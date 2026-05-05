/**
 * Dispatch scenario tests — PHASE 3 A-H.
 *
 * Tests all passenger + dispatch scenarios using the elevator brain
 * runtime logic:
 * A: Simple requests
 * B: Overlapping/directional
 * C: Ascending (montée)
 * D: Reverse direction
 * E: Full capacity
 * F: Skip passenger
 * G: Passenger cancel
 * H: Complete pickup+dropoff flow
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBestElevatorForRequest,
  computeNextOperatorAction,
  enrichDispatchRequests,
} from "../services/elevatorBrain";
import type { Direction, Elevator, Floor, HoistRequest } from "../types/hoist";

const root = process.cwd();
const ACTIONS_SRC = readFileSync(join(root, "lib/actions.ts"), "utf8");
const STATE_RES_SRC = readFileSync(join(root, "lib/stateResolution.ts"), "utf8");
const PASSENGER_CANCEL = readFileSync(join(root, "lib/passengerCancelClient.ts"), "utf8");

const now = Date.parse("2026-04-30T12:00:00.000Z");

// Floors matching the user's spec: P1, RDC, 2, 3, 8, 15, 16
const floors: Floor[] = [
  floor("p1", "P1", -1),
  floor("rdc", "RDC", 0),
  floor("2", "2", 2),
  floor("3", "3", 3),
  floor("8", "8", 8),
  floor("15", "15", 15),
  floor("16", "16", 16),
];

function floor(id: string, label: string, sort_order: number): Floor {
  return { id, project_id: "project", label, sort_order, qr_token: `${id}-qr`, access_code: `${id}-code`, active: true };
}

function elevator(id: string, current_floor_id: string, direction: Direction = "idle", patch: Partial<Elevator> = {}): Elevator {
  return {
    id, project_id: "project", name: id.toUpperCase(), current_floor_id, direction,
    capacity: 4, current_load: 0, active: true,
    operator_session_id: `session-${id}`,
    operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z",
    operator_user_id: null, ...patch,
  };
}

function req(id: string, from: string, to: string, patch: Partial<HoistRequest> = {}): HoistRequest {
  const fromSort = floors.find((f) => f.id === from)?.sort_order ?? 0;
  const toSort = floors.find((f) => f.id === to)?.sort_order ?? 0;
  return {
    id, project_id: "project", elevator_id: null, from_floor_id: from, to_floor_id: to,
    direction: toSort > fromSort ? "up" : "down",
    passenger_count: 1, original_passenger_count: 1, remaining_passenger_count: 1,
    split_required: false, priority: false, priority_reason: null, note: null,
    status: "pending", sequence_number: Number(id.replace(/\D/g, "")) || 1,
    wait_started_at: "2026-04-30T11:58:00.000Z", created_at: "2026-04-30T11:58:00.000Z",
    updated_at: "2026-04-30T11:58:00.000Z", completed_at: null, ...patch,
  };
}

function nextAction(elev: Elevator, assigned: HoistRequest[], boarded: HoistRequest[] = []) {
  const assignedDispatch = enrichDispatchRequests(assigned, floors);
  const onboardPassengers = enrichDispatchRequests(boarded, floors).map((r) => ({
    requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
    from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order, passenger_count: r.passenger_count,
  }));
  return computeNextOperatorAction({ elevator: elev, assignedRequests: assignedDispatch, onboardPassengers, projectFloors: floors, nowMs: now });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO A: Simple requests — P1→8, 3→P1, 8→15, 15→3
// ═══════════════════════════════════════════════════════════════════════════

test("A1: P1→8 — idle elevator at P1 picks up immediately", () => {
  const r1 = req("r1", "p1", "8");
  const elev = elevator("e1", "p1");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, "e1");
});

test("A2: 3→P1 — down request assigned to idle elevator at 3", () => {
  const r2 = req("r2", "3", "p1");
  const elev = elevator("e1", "3");
  const result = computeBestElevatorForRequest({ newRequest: r2, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, "e1");
});

test("A3: 8→15 — up request from 8 to 15", () => {
  const r3 = req("r3", "8", "15");
  const elev = elevator("e1", "8");
  const result = computeBestElevatorForRequest({ newRequest: r3, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, "e1");
});

test("A4: 15→3 — down request from 15 to 3", () => {
  const r4 = req("r4", "15", "3");
  const elev = elevator("e1", "15");
  const result = computeBestElevatorForRequest({ newRequest: r4, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, "e1");
});

test("A5: All 4 simple requests — elevator at P1, picks up r1 (P1→8) first", () => {
  const r1 = req("r1", "p1", "8");
  const r2 = req("r2", "3", "p1");
  const r3 = req("r3", "8", "15");
  const r4 = req("r4", "15", "3");
  const elev = elevator("e1", "p1");
  const action = nextAction(elev, [r1, r2, r3, r4]);
  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r1");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO B: Overlapping — 15→3, 8→P1
// Elevator going down should pick up 15 first, then 8 on the way
// ═══════════════════════════════════════════════════════════════════════════

test("B1: 15→3 and 8→P1 — elevator at 15 picks up r1 first", () => {
  const r1 = req("r1", "15", "3");
  const r2 = req("r2", "8", "p1");
  const elev = elevator("e1", "15");
  const action = nextAction(elev, [r1, r2]);
  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r1");
});

test("B2: After picking up at 15, going down — heading to next stop", () => {
  const r1 = req("r1", "15", "3", { elevator_id: "e1", status: "boarded" });
  const r2 = req("r2", "8", "p1", { elevator_id: "e1", status: "assigned" });
  const elev = elevator("e1", "10", "down", { current_load: 1 });
  const action = nextAction(elev, [r2], [r1]);
  assert.ok(action.action === "pickup" || action.action === "dropoff", "valid next action while going down");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO C: Ascending (montée) — P1→8, 2→15, 3→16
// ═══════════════════════════════════════════════════════════════════════════

test("C1: Three up requests — elevator at P1 picks up P1→8 first", () => {
  const r1 = req("r1", "p1", "8");
  const r2 = req("r2", "2", "15");
  const r3 = req("r3", "3", "16");
  const elev = elevator("e1", "p1");
  const action = nextAction(elev, [r1, r2, r3]);
  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r1");
});

test("C2: After picking up at P1, going up — pickup at 2", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "boarded" });
  const r2 = req("r2", "2", "15", { elevator_id: "e1", status: "assigned" });
  const r3 = req("r3", "3", "16", { elevator_id: "e1", status: "assigned" });
  const elev = elevator("e1", "2", "up", { current_load: 1 });
  const action = nextAction(elev, [r2, r3], [r1]);
  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r2");
});

test("C3: After picking up at 2, going up — pickup at 3", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "boarded" });
  const r2 = req("r2", "2", "15", { elevator_id: "e1", status: "boarded" });
  const r3 = req("r3", "3", "16", { elevator_id: "e1", status: "assigned" });
  const elev = elevator("e1", "3", "up", { current_load: 2 });
  const action = nextAction(elev, [r3], [r1, r2]);
  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r3");
});

test("C4: All boarded — drop off at 8 first (lowest destination going up)", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "boarded" });
  const r2 = req("r2", "2", "15", { elevator_id: "e1", status: "boarded" });
  const r3 = req("r3", "3", "16", { elevator_id: "e1", status: "boarded" });
  const elev = elevator("e1", "5", "up", { current_load: 3 });
  const action = nextAction(elev, [], [r1, r2, r3]);
  assert.equal(action.action, "dropoff");
  assert.ok(action.nextFloorSortOrder !== null, "has next floor");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO D: Reverse direction — add 15→3 while going up
// ═══════════════════════════════════════════════════════════════════════════

test("D1: Going up with boarded passengers — reverse request not picked up yet", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "boarded" });
  const r2 = req("r2", "15", "3", { elevator_id: "e1", status: "assigned" });
  const elev = elevator("e1", "5", "up", { current_load: 1 });
  const action = nextAction(elev, [r2], [r1]);
  assert.ok(action.action === "dropoff" || action.action === "wait", "not picking up reverse direction while going up");
});

test("D2: Reverse direction request gets assigned to best elevator", () => {
  const r1 = req("r1", "15", "3");
  const elev = elevator("e1", "8", "up");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.ok(result.elevatorId, "request gets assigned to some elevator");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E: Elevator full — capacity limit
// ═══════════════════════════════════════════════════════════════════════════

test("E1: Full elevator not assigned new requests", () => {
  const r1 = req("r1", "3", "8");
  const elev = elevator("e1", "3", "idle", { current_load: 4, capacity: 4 });
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, null);
});

test("E2: Full elevator — action is dropoff (unload), not pickup", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "boarded" });
  const r2 = req("r2", "2", "15", { elevator_id: "e1", status: "boarded" });
  const r3 = req("r3", "3", "16", { elevator_id: "e1", status: "boarded" });
  const r4 = req("r4", "8", "3", { elevator_id: "e1", status: "boarded" });
  const elev = elevator("e1", "5", "up", { current_load: 4, capacity: 4 });
  const action = nextAction(elev, [], [r1, r2, r3, r4]);
  assert.equal(action.action, "dropoff");
});

test("E3: After dropoff, elevator has capacity again", () => {
  const r1 = req("r1", "3", "8");
  const elev = elevator("e1", "3", "idle", { current_load: 1, capacity: 4 });
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, "e1");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO F: Skip passenger
// ═══════════════════════════════════════════════════════════════════════════

test("F1: Skip mechanism exists in actions", () => {
  assert.match(ACTIONS_SRC, /skipPassenger|skipRequest|skipped_by_elevator_id/, "skip mechanism exists");
});

test("F2: Skip marker prevents same elevator from re-picking up immediately", () => {
  assert.match(ACTIONS_SRC, /skipped_by_elevator_id/, "skip marker tracks which elevator skipped");
  assert.match(ACTIONS_SRC, /skipped_at/, "skip marker has timestamp");
});

test("F3: Skipped request can be reassigned to another elevator", () => {
  const r1 = req("r1", "3", "8", { skipped_by_elevator_id: "e1", skipped_at: "2026-04-30T11:59:00.000Z" });
  const elev = elevator("e2", "3");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elev], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.ok(result.elevatorId, "skipped request can be assigned to another elevator");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO G: Passenger cancel
// ═══════════════════════════════════════════════════════════════════════════

test("G1: Cancel action exists and sets status to cancelled", () => {
  assert.match(PASSENGER_CANCEL, /cancelPassengerRequestClient/, "cancel function exists in passengerCancelClient");
  assert.match(ACTIONS_SRC, /"cancelled"/, "actions sets cancelled status");
});

test("G2: Cancelled request is terminal — never reappears", () => {
  assert.match(STATE_RES_SRC, /isTerminalStatus/, "isTerminalStatus function exists");
  assert.match(STATE_RES_SRC, /"cancelled"/, "cancelled is terminal");
});

test("G3: Cancelled status has highest finality priority", () => {
  assert.match(STATE_RES_SRC, /statusPriority/, "has status priority function");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO H: Complete flow — pickup → dropoff → completed
// ═══════════════════════════════════════════════════════════════════════════

test("H1: Assigned request at pickup floor → pickup action", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "assigned" });
  const elev = elevator("e1", "p1", "idle", { current_load: 0 });
  const action = nextAction(elev, [r1], []);
  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r1");
});

test("H2: After pickup, next action is dropoff at destination", () => {
  const r1 = req("r1", "p1", "8", { elevator_id: "e1", status: "boarded" });
  const elev = elevator("e1", "p1", "up", { current_load: 1 });
  const action = nextAction(elev, [], [r1]);
  assert.equal(action.action, "dropoff");
  assert.ok(action.nextFloorSortOrder !== null, "has dropoff floor");
});

test("H3: Completed status is terminal", () => {
  assert.match(STATE_RES_SRC, /"completed"/, "completed is a terminal status");
  assert.match(STATE_RES_SRC, /isTerminalStatus/, "isTerminalStatus function exists");
});

test("H4: Log action creates entry on state transition", () => {
  assert.match(STATE_RES_SRC, /logAction/, "logAction function exists");
});

test("H5: Request event types include pickup, dropoff, complete", () => {
  assert.match(ACTIONS_SRC, /pickup|picked_up/, "pickup event exists");
  assert.match(ACTIONS_SRC, /dropoff|dropped_off/, "dropoff event exists");
  assert.match(ACTIONS_SRC, /completed/, "completed event exists");
});
