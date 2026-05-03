/**
 * Capacity overflow fix — targeted tests.
 *
 * Bug: requestsToPickup listed ALL requests at the target floor without
 * filtering by remaining capacity. When multiple groups waited at the
 * same floor, the operator could board more passengers than the elevator
 * can hold.
 *
 * Fix: fitRequestsToCapacity trims the list to only include requests that
 * fit within remainingCapacity, consuming capacity as each request is added.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computeNextOperatorAction, enrichDispatchRequests } from "../services/elevatorBrain";
import type { Elevator, Floor, HoistRequest } from "../types/hoist";

const now = Date.parse("2026-04-30T12:00:00.000Z");

const floors: Floor[] = [
  { id: "rdc", project_id: "p", label: "RDC", sort_order: 0, qr_token: "x", access_code: "x", active: true },
  { id: "5", project_id: "p", label: "5", sort_order: 5, qr_token: "x", access_code: "x", active: true },
  { id: "13", project_id: "p", label: "13", sort_order: 13, qr_token: "x", access_code: "x", active: true },
];

function mkReq(id: string, from: string, to: string, count: number, seq: number): HoistRequest {
  const fromSort = floors.find((f) => f.id === from)?.sort_order ?? 0;
  const toSort = floors.find((f) => f.id === to)?.sort_order ?? 0;
  return {
    id, project_id: "p", elevator_id: "e1", from_floor_id: from, to_floor_id: to,
    direction: toSort > fromSort ? "up" : "down", passenger_count: count,
    original_passenger_count: count, remaining_passenger_count: count, split_required: false,
    priority: false, priority_reason: null, note: null, wait_started_at: "2026-04-30T11:55:00.000Z",
    status: "assigned", sequence_number: seq, created_at: "2026-04-30T11:55:00.000Z",
    updated_at: "2026-04-30T11:55:00.000Z", completed_at: null,
  };
}

function mkElev(floorId: string, load: number, cap: number): Elevator {
  return {
    id: "e1", project_id: "p", name: "E1", current_floor_id: floorId, direction: "idle",
    capacity: cap, current_load: load, active: true,
    operator_session_id: "s1", operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z", operator_user_id: null,
  };
}

// ---------------------------------------------------------------------------
// 1. requestsToPickup caps at remaining capacity (idle section)
// ---------------------------------------------------------------------------
test("capacity overflow: 4 groups of 5 at same floor, cap 15 → only 3 picked up", () => {
  const reqs = [mkReq("a1", "rdc", "13", 5, 1), mkReq("a2", "rdc", "13", 5, 2), mkReq("a3", "rdc", "5", 5, 3), mkReq("a4", "rdc", "13", 5, 4)];
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", 0, 15),
    assignedRequests: enrichDispatchRequests(reqs, floors),
    onboardPassengers: [],
    projectFloors: floors,
    capacityEnabled: true,
    nowMs: now,
  });
  const total = result.requestsToPickup.reduce((s, r) => s + r.passenger_count, 0);
  assert.ok(total <= 15, `total ${total} exceeds capacity 15`);
  assert.equal(result.requestsToPickup.length, 3, "should include exactly 3 of 4 groups");
});

// ---------------------------------------------------------------------------
// 2. requestsToPickup respects boarded load (idle section)
// ---------------------------------------------------------------------------
test("capacity overflow: 3 groups of 5, 8 onboard cap 15 → only 1 fits", () => {
  const reqs = [mkReq("a1", "rdc", "13", 5, 1), mkReq("a2", "rdc", "13", 5, 2), mkReq("a3", "rdc", "5", 5, 3)];
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", 8, 15),
    assignedRequests: enrichDispatchRequests(reqs, floors),
    onboardPassengers: [],
    projectFloors: floors,
    capacityEnabled: true,
    nowMs: now,
  });
  const total = result.requestsToPickup.reduce((s, r) => s + r.passenger_count, 0);
  assert.ok(total <= 7, `total ${total} exceeds remaining 7`);
});

// ---------------------------------------------------------------------------
// 3. requestsToPickup caps on segment (nextDropSort section)
// ---------------------------------------------------------------------------
test("capacity overflow: on-segment pickups capped by remaining capacity", () => {
  const boarded = enrichDispatchRequests([{ ...mkReq("b0", "rdc", "13", 5, 0), status: "boarded" as const }], floors);
  const p1 = mkReq("p1", "5", "13", 4, 1);
  const p2 = mkReq("p2", "5", "13", 8, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", 5, 15),
    assignedRequests: enrichDispatchRequests([p1, p2], floors),
    onboardPassengers: boarded.map((r) => ({
      requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
      from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order, passenger_count: r.passenger_count,
    })),
    projectFloors: floors,
    capacityEnabled: true,
    nowMs: now,
  });
  const total = result.requestsToPickup.reduce((s, r) => s + r.passenger_count, 0);
  assert.ok(total <= 10, `total ${total} exceeds remaining 10`);
});
