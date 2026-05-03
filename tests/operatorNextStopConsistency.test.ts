/**
 * Operator terminal next stop consistency + passenger QR reset — targeted tests.
 *
 * Bug 1: Pre-pickup terminal showed wrong upcoming stops (idle section listed
 * all pickups without accounting for the dropoff sequence created after pickup).
 * Fix: plannedDropoffLabels shows full dropoff sequence, upcomingPickupLabels
 * filtered to on-route only.
 *
 * Bug 2: Passenger QR reset was slow (broadcast created new channel + subscribe each time).
 * Fix: persistent broadcast channel (pre-subscribed on mount).
 *
 * Tests:
 * 1. Exact scenario P1→16 + 5→10: full sequence pickup→pickup→dropoff→dropoff
 * 2. Pre-pickup upcoming limited to on-route only (not all pickups)
 * 3. Post-pickup: after P1 pickup, next action is pickup 5; after 5 pickup, dropoff 10
 * 4. Demand 5→10 remains present in correct list after pickup
 * 5. Passenger QR reset uses persistent channel (structural)
 * 6. Failed pickup does NOT trigger broadcast (structural)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { computeNextOperatorAction, enrichDispatchRequests } from "../services/elevatorBrain";
import type { Elevator, Floor, HoistRequest, ActivePassenger, DispatchRecommendationReason } from "../types/hoist";

const root = process.cwd();

const floors: Floor[] = [
  { id: "p1", project_id: "p", label: "P1", sort_order: -1, qr_token: "x", access_code: "x", active: true },
  { id: "rdc", project_id: "p", label: "RDC", sort_order: 0, qr_token: "x", access_code: "x", active: true },
  { id: "5", project_id: "p", label: "5", sort_order: 5, qr_token: "x", access_code: "x", active: true },
  { id: "10", project_id: "p", label: "10", sort_order: 10, qr_token: "x", access_code: "x", active: true },
  { id: "16", project_id: "p", label: "16", sort_order: 16, qr_token: "x", access_code: "x", active: true },
];

type PickupReason = Extract<DispatchRecommendationReason, { kind: "pickup" }>;

function asPickup(d?: DispatchRecommendationReason): PickupReason | null {
  return d?.kind === "pickup" ? (d as PickupReason) : null;
}

function mkReq(id: string, from: string, to: string, count: number, seq: number): HoistRequest {
  const fromSort = floors.find((f) => f.id === from)?.sort_order ?? 0;
  const toSort = floors.find((f) => f.id === to)?.sort_order ?? 0;
  return {
    id, project_id: "p", elevator_id: "e1", from_floor_id: from, to_floor_id: to,
    direction: toSort > fromSort ? "up" : "down", passenger_count: count,
    original_passenger_count: count, remaining_passenger_count: count, split_required: false,
    priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    status: "assigned" as HoistRequest["status"],
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

function mkBoarded(reqs: HoistRequest[]): ActivePassenger[] {
  return enrichDispatchRequests(reqs, floors).map((r) => ({
    requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
    from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order, passenger_count: r.passenger_count,
  }));
}

// ---------------------------------------------------------------------------
// 1. Exact scenario P1→16 + 5→10: full sequence verified
//    Expected: pickup P1 → pickup 5 → dropoff 10 → dropoff 16
// ---------------------------------------------------------------------------
test("next-stop: P1→16 + 5→10 full sequence: pickup P1, pickup 5, dropoff 10, dropoff 16", () => {
  const r1 = mkReq("r1", "p1", "16", 2, 1);
  const r2 = mkReq("r2", "5", "10", 2, 2);

  // Step 1: At P1, idle — pickup P1
  const step1 = computeNextOperatorAction({
    elevator: mkElev("p1", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(step1.action, "pickup");
  assert.equal(step1.primaryPickupRequestId, "r1");
  const detail1 = asPickup(step1.reasonDetail);
  assert.ok(detail1, "step1 reason is pickup");
  assert.ok(detail1.upcomingPickupLabels?.includes("5"), "5 listed as upcoming pickup");
  assert.deepEqual(detail1.plannedDropoffLabels, ["10", "16"], "planned dropoffs: 10 then 16");

  // Step 2: After pickup P1, at P1 going up — pickup 5
  const step2 = computeNextOperatorAction({
    elevator: mkElev("p1", "up", 2, 15),
    assignedRequests: enrichDispatchRequests([r2], floors),
    onboardPassengers: mkBoarded([r1]),
    projectFloors: floors,
  });
  assert.equal(step2.action, "pickup");
  assert.equal(step2.nextFloor?.id, "5");
  assert.equal(step2.primaryPickupRequestId, "r2");

  // Step 3: After pickup 5 too, at 5 going up — dropoff 10
  const step3 = computeNextOperatorAction({
    elevator: mkElev("5", "up", 4, 15),
    assignedRequests: [],
    onboardPassengers: mkBoarded([r1, r2]),
    projectFloors: floors,
  });
  assert.equal(step3.action, "dropoff");
  assert.equal(step3.nextFloor?.id, "10");
  assert.ok(step3.requestsToDropoff.some((p) => p.requestId === "r2"), "r2 dropped at 10");

  // Step 4: After dropoff 10, P1→16 still boarded — dropoff 16
  const step4 = computeNextOperatorAction({
    elevator: mkElev("10", "up", 2, 15),
    assignedRequests: [],
    onboardPassengers: mkBoarded([r1]),
    projectFloors: floors,
  });
  assert.equal(step4.action, "dropoff");
  assert.equal(step4.nextFloor?.id, "16");
  assert.ok(step4.requestsToDropoff.some((p) => p.requestId === "r1"), "r1 dropped at 16");
});

// ---------------------------------------------------------------------------
// 2. Pre-pickup upcoming limited to on-route only
// ---------------------------------------------------------------------------
test("next-stop: upcoming excludes pickups beyond dropoff destination", () => {
  // P1→5 (short trip), 10→16 (pickup past dropoff at 5)
  const r1 = mkReq("r1", "p1", "5", 2, 1);
  const r2 = mkReq("r2", "10", "16", 2, 2);
  const result = computeNextOperatorAction({
    elevator: mkElev("p1", "idle", 0, 15),
    assignedRequests: enrichDispatchRequests([r1, r2], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  const detail = asPickup(result.reasonDetail);
  assert.ok(detail, "reason is pickup kind");
  assert.deepEqual(detail.plannedDropoffLabels, ["5"], "only final dropoff at 5");
  const upcoming = detail.upcomingPickupLabels ?? [];
  assert.ok(!upcoming.includes("10"), "10 should NOT be upcoming (past dropoff at 5)");
});

// ---------------------------------------------------------------------------
// 3. Post-pickup: after P1 pickup → pickup 5; after 5 pickup → dropoff 10
// ---------------------------------------------------------------------------
test("next-stop: after P1 pickup next is pickup 5; after 5 pickup next is dropoff 10", () => {
  const r1 = mkReq("r1", "p1", "16", 2, 1);
  const r2 = mkReq("r2", "5", "10", 2, 2);

  // After P1 pickup
  const postP1 = computeNextOperatorAction({
    elevator: mkElev("p1", "up", 2, 15),
    assignedRequests: enrichDispatchRequests([r2], floors),
    onboardPassengers: mkBoarded([r1]),
    projectFloors: floors,
  });
  assert.equal(postP1.action, "pickup", "after P1 pickup: next action is pickup");
  assert.equal(postP1.nextFloor?.id, "5", "after P1 pickup: next floor is 5");

  // After 5 pickup too
  const postP5 = computeNextOperatorAction({
    elevator: mkElev("5", "up", 4, 15),
    assignedRequests: [],
    onboardPassengers: mkBoarded([r1, r2]),
    projectFloors: floors,
  });
  assert.equal(postP5.action, "dropoff", "after 5 pickup: next action is dropoff");
  assert.equal(postP5.nextFloor?.id, "10", "after 5 pickup: dropoff at 10 first (not 16)");
});

// ---------------------------------------------------------------------------
// 4. Demand 5→10 remains present in correct list after pickup
// ---------------------------------------------------------------------------
test("next-stop: 5→10 stays in requestsToPickup after P1 pickup", () => {
  const r1 = mkReq("r1", "p1", "16", 2, 1);
  const r2 = mkReq("r2", "5", "10", 2, 2);
  const post = computeNextOperatorAction({
    elevator: mkElev("p1", "up", 2, 15),
    assignedRequests: enrichDispatchRequests([r2], floors),
    onboardPassengers: mkBoarded([r1]),
    projectFloors: floors,
  });
  assert.ok(post.requestsToPickup.some((r) => r.id === "r2"), "5→10 should be in requestsToPickup");
});

// ---------------------------------------------------------------------------
// 5. Passenger QR reset uses persistent channel (structural)
// ---------------------------------------------------------------------------
test("next-stop: operator dashboard pre-subscribes broadcast channel", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dashboard, /broadcastChannelRef/);
  assert.match(dashboard, /passengerProjectBroadcastChannel\(projectId\)/);
  assert.match(dashboard, /broadcastChannelRef\.current/);
  assert.match(dashboard, /event: "request_boarded"/);
  assert.match(dashboard, /type: "broadcast"/);
  assert.match(dashboard, /broadcastPassengerRequestBoarded/);
});

// ---------------------------------------------------------------------------
// 6. Failed pickup does NOT trigger broadcast (structural)
// ---------------------------------------------------------------------------
test("next-stop: onPickupFailure does NOT call onPickupConfirmed", () => {
  const component = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(component, /result\.ok/);
  assert.match(component, /onPickupConfirmed/);
  assert.match(component, /onPickupFailure/);
  const catchMatch = component.match(/\.catch\([^)]*\)\s*=>\s*\{[\s\S]*?\}\)/);
  assert.ok(catchMatch, ".catch block exists");
  const catchCode = catchMatch[0];
  assert.ok(!catchCode.includes("onPickupConfirmed"), "onPickupConfirmed not in .catch");
});
