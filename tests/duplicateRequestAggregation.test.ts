/**
 * Duplicate request aggregation — targeted tests.
 *
 * Bug: when two identical requests exist (same from, same to, same direction),
 * the recommendation text showed "1 personne(s)" instead of the total count.
 * The reason was that pickupReasonDetail used only the primary request's
 * passenger_count, not the sum of all requests at the same floor going to
 * the same destination.
 *
 * Fix: pickupReasonDetail accepts an optional `sameFloorRequests` parameter
 * (all fitted requests at the target floor). passengerCount is now the sum
 * of all sameFloorRequests that share the primary's to_floor_id.
 *
 * Tests:
 * 1. Two identical requests 4→14 → passengerCount=2
 * 2. Floor label stays 4, not shifted to another floor
 * 3. Two identical requests are not deduplicated (both in requestsToPickup)
 * 4. Pickup group marks all matching requests as to-pickup
 * 5. A different request 5→14 stays separate from 4→14
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computeNextOperatorAction, enrichDispatchRequests } from "../services/elevatorBrain";
import type { Direction, RequestStatus } from "../types/hoist";

const floors = [
  { id: "4", project_id: "p", label: "4", sort_order: 4, qr_token: "x", access_code: "x", active: true },
  { id: "5", project_id: "p", label: "5", sort_order: 5, qr_token: "x", access_code: "x", active: true },
  { id: "14", project_id: "p", label: "14", sort_order: 14, qr_token: "x", access_code: "x", active: true },
];

function mkReq(id: string, from: string, to: string, count: number, seq: number, status?: string) {
  const fromSort = floors.find((f) => f.id === from)!.sort_order;
  const toSort = floors.find((f) => f.id === to)!.sort_order;
  return {
    id, project_id: "p", elevator_id: "e1", from_floor_id: from, to_floor_id: to,
    direction: (toSort > fromSort ? "up" : "down") as "up" | "down", passenger_count: count,
    original_passenger_count: count, remaining_passenger_count: count,
    split_required: false, priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z", status: (status || "assigned") as RequestStatus,
    sequence_number: seq, created_at: "2026-04-30T11:55:00.000Z",
    updated_at: "2026-04-30T11:55:00.000Z", completed_at: null,
  };
}

function mkElev(floorId: string, dir: Direction, load: number, cap: number) {
  return {
    id: "e1", project_id: "p", name: "E1", current_floor_id: floorId,
    direction: dir, capacity: cap, current_load: load, active: true,
    operator_session_id: "s1", operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z", operator_user_id: null,
    manual_full: false,
  };
}

// ---------------------------------------------------------------------------
// 1. Two identical requests 4→14 → passengerCount=2
// ---------------------------------------------------------------------------
test("aggregation: two identical 4→14 requests sum to passengerCount=2", () => {
  const r1 = mkReq("r1", "4", "14", 1, 1);
  const r2 = mkReq("r2", "4", "14", 1, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.reasonDetail?.kind, "pickup");
  if (result.reasonDetail?.kind === "pickup") {
    assert.equal(result.reasonDetail.passengerCount, 2, "two 1-person requests sum to 2");
    assert.equal(result.reasonDetail.destinationLabel, "14");
  }
});

// ---------------------------------------------------------------------------
// 2. Floor label stays 4, not shifted to another floor
// ---------------------------------------------------------------------------
test("aggregation: pickupLabel is 4, not shifted", () => {
  const r1 = mkReq("r1", "4", "14", 1, 1);
  const r2 = mkReq("r2", "4", "14", 1, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.reasonDetail?.kind, "pickup");
  if (result.reasonDetail?.kind === "pickup") {
    assert.equal(result.reasonDetail.pickupLabel, "4", "shows from floor 4, not 5");
  }
});

// ---------------------------------------------------------------------------
// 3. Two identical requests are not deduplicated (both in requestsToPickup)
// ---------------------------------------------------------------------------
test("aggregation: both identical requests remain in requestsToPickup", () => {
  const r1 = mkReq("r1", "4", "14", 1, 1);
  const r2 = mkReq("r2", "4", "14", 1, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.requestsToPickup.length, 2, "both requests kept, not deduplicated");
  const ids = result.requestsToPickup.map((r) => r.id).sort();
  assert.deepEqual(ids, ["r1", "r2"]);
});

// ---------------------------------------------------------------------------
// 4. Pickup group marks all matching requests as to-pickup
// ---------------------------------------------------------------------------
test("aggregation: requestsToPickup includes all same-floor same-dest requests", () => {
  const r1 = mkReq("r1", "4", "14", 2, 1);
  const r2 = mkReq("r2", "4", "14", 3, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.requestsToPickup.length, 2);
  assert.equal(result.reasonDetail?.kind, "pickup");
  if (result.reasonDetail?.kind === "pickup") {
    assert.equal(result.reasonDetail.passengerCount, 5, "2+3=5 passengers total");
  }
});

// ---------------------------------------------------------------------------
// 5. A different request 5→14 stays separate from 4→14
// ---------------------------------------------------------------------------
test("aggregation: request from different floor stays separate", () => {
  const r1 = mkReq("r1", "4", "14", 1, 1);
  const r2 = mkReq("r2", "4", "14", 1, 2);
  const r3 = mkReq("r3", "5", "14", 1, 3);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2, r3], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  // Primary is at floor 4 (lower sequence), r3 at floor 5 is separate
  assert.equal(result.reasonDetail?.kind, "pickup");
  if (result.reasonDetail?.kind === "pickup") {
    assert.equal(result.reasonDetail.passengerCount, 2, "only 4→14 summed, not 5→14");
    assert.equal(result.reasonDetail.pickupLabel, "4");
    assert.deepEqual(result.reasonDetail.upcomingPickupLabels, ["5"], "5→14 appears as upcoming");
  }
});
