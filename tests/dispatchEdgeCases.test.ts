/**
 * Dispatch edge cases — targeted tests.
 *
 * Verifies dispatch correctness for unusual but realistic scenarios:
 * 1. Pickup at current floor when boarded passengers going ahead
 * 2. Opposite-direction request ignored during active cycle
 * 3. All requests below current floor (SCAN turnaround via wave)
 * 4. Empty elevator with no requests → idle_empty
 * 5. Dropoff at same floor as boarded pickup (dropoffsAtCurrent priority)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computeNextOperatorAction, enrichDispatchRequests } from "../services/elevatorBrain";
import type { Elevator, Floor, HoistRequest } from "../types/hoist";

const now = Date.parse("2026-04-30T12:00:00.000Z");

const floors: Floor[] = [
  { id: "p1", project_id: "p", label: "P1", sort_order: -1, qr_token: "x", access_code: "x", active: true },
  { id: "rdc", project_id: "p", label: "RDC", sort_order: 0, qr_token: "x", access_code: "x", active: true },
  { id: "5", project_id: "p", label: "5", sort_order: 5, qr_token: "x", access_code: "x", active: true },
  { id: "8", project_id: "p", label: "8", sort_order: 7, qr_token: "x", access_code: "x", active: true },
  { id: "13", project_id: "p", label: "13", sort_order: 13, qr_token: "x", access_code: "x", active: true },
  { id: "16", project_id: "p", label: "16", sort_order: 15, qr_token: "x", access_code: "x", active: true },
];

function mkReq(id: string, from: string, to: string, count: number, seq: number, status?: string): HoistRequest {
  const fromSort = floors.find((f) => f.id === from)?.sort_order ?? 0;
  const toSort = floors.find((f) => f.id === to)?.sort_order ?? 0;
  return {
    id, project_id: "p", elevator_id: "e1", from_floor_id: from, to_floor_id: to,
    direction: toSort > fromSort ? "up" : "down", passenger_count: count,
    original_passenger_count: count, remaining_passenger_count: count, split_required: false,
    priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    status: (status ?? "assigned") as HoistRequest["status"],
    sequence_number: seq, created_at: "2026-04-30T11:55:00.000Z",
    updated_at: "2026-04-30T11:55:00.000Z", completed_at: null,
  };
}

function mkElev(floorId: string, dir: string, load: number, cap: number): Elevator {
  return {
    id: "e1", project_id: "p", name: "E1", current_floor_id: floorId,
    direction: dir as "up" | "down" | "idle", capacity: cap, current_load: load,
    active: true, operator_session_id: "s1",
    operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z", operator_user_id: null,
  };
}

// ---------------------------------------------------------------------------
// 1. Pickup at current floor included when boarded passengers going ahead
// ---------------------------------------------------------------------------
test("dispatch edge: pickup at current floor included on segment to dropoff", () => {
  const boarded = mkReq("b1", "rdc", "13", 5, 0, "boarded");
  const pickup = mkReq("p1", "5", "16", 2, 1);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "up", 5, 15),
    assignedRequests: enrichDispatchRequests([pickup], floors),
    onboardPassengers: enrichDispatchRequests([boarded], floors).map((r) => ({
      requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
      from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order, passenger_count: r.passenger_count,
    })),
    projectFloors: floors, nowMs: now,
  });
  assert.equal(result.action, "pickup");
  assert.equal(result.primaryPickupRequestId, "p1");
});

// ---------------------------------------------------------------------------
// 2. Opposite-direction request excluded during active UP cycle
// ---------------------------------------------------------------------------
test("dispatch edge: down request skipped during active up cycle", () => {
  const boarded = mkReq("b1", "rdc", "13", 5, 0, "boarded");
  const downReq = mkReq("d1", "5", "p1", 2, 1);  // down at 5
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "up", 5, 15),
    assignedRequests: enrichDispatchRequests([downReq], floors),
    onboardPassengers: enrichDispatchRequests([boarded], floors).map((r) => ({
      requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
      from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order, passenger_count: r.passenger_count,
    })),
    projectFloors: floors, nowMs: now,
  });
  assert.equal(result.action, "dropoff");
  assert.equal(result.primaryPickupRequestId, null);
});

// ---------------------------------------------------------------------------
// 3. All requests below current floor → wave handles turnaround
// ---------------------------------------------------------------------------
test("dispatch edge: up requests only below → wave finds target (turnaround)", () => {
  const r1 = mkReq("r1", "p1", "5", 2, 1);
  const r2 = mkReq("r2", "rdc", "8", 2, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("13", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors, nowMs: now,
  });
  assert.equal(result.action, "pickup");
  assert.equal(result.nextFloor?.id, "p1");
});

// ---------------------------------------------------------------------------
// 4. Empty elevator with no requests → idle_empty
// ---------------------------------------------------------------------------
test("dispatch edge: no requests → idle_empty", () => {
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", "idle", 0, 15),
    assignedRequests: [],
    onboardPassengers: [],
    projectFloors: floors, nowMs: now,
  });
  assert.equal(result.action, "wait");
  assert.equal(result.reasonDetail?.kind, "idle_empty");
});

// ---------------------------------------------------------------------------
// 5. Dropoff at current floor prioritized over pickup
// ---------------------------------------------------------------------------
test("dispatch edge: dropoffsAtCurrent takes priority over pickup", () => {
  const boarded = mkReq("b1", "5", "rdc", 5, 0, "boarded");
  const pickup = mkReq("p1", "rdc", "13", 2, 1);
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", "idle", 5, 15),
    assignedRequests: enrichDispatchRequests([pickup], floors),
    onboardPassengers: enrichDispatchRequests([boarded], floors).map((r) => ({
      requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
      from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order, passenger_count: r.passenger_count,
    })),
    projectFloors: floors, nowMs: now,
  });
  assert.equal(result.action, "dropoff");
  assert.ok(result.requestsToDropoff.length > 0, "should have dropoffs at current floor");
});
