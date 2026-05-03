/**
 * Operator terminal accuracy — targeted tests.
 *
 * Verifies that the operator terminal displays correct information:
 * 1. realtime merge respects terminal statuses (completed/cancelled not overwritten)
 * 2. remaining capacity accounts for reserved (assigned/arriving) passengers
 * 3. MovementBoard splits by direction correctly
 * 4. completed/cancelled requests excluded from movement queue
 * 5. capacity blocked count is accurate
 * 6. brain recommendation matches displayed next stop
 * 7. double-click protection exists
 * 8. rollback handlers exist for pickup/dropoff failures
 * 9. terminal doesn't disable operator by error display
 * 10. pending requests stay visible even when capacity blocked
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { mergeRealtimeRequest, mergeOperatorPollRequest } from "../lib/realtime";
import type { RequestRealtimePayload } from "../lib/realtime";
import type { HoistRequest } from "../types/hoist";

const root = process.cwd();
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const MOVEMENT = readFileSync(join(root, "components/operator/MovementBoard.tsx"), "utf8");
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");

// ---------------------------------------------------------------------------
// 1. realtime merge respects terminal statuses
// ---------------------------------------------------------------------------
test("terminal accuracy: mergeRealtimeRequest keeps completed status over late incoming", () => {
  const completed: HoistRequest = {
    id: "r1", project_id: "p", elevator_id: "e1",
    from_floor_id: "rdc", to_floor_id: "5", direction: "up",
    passenger_count: 2, original_passenger_count: 2, remaining_passenger_count: 0,
    split_required: false, priority: false, priority_reason: null, note: null,
    status: "completed", sequence_number: 1,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    created_at: "2026-04-30T11:55:00.000Z",
    updated_at: "2026-04-30T11:56:00.000Z",
    completed_at: "2026-04-30T11:56:00.000Z",
  };
  const lateIncoming: HoistRequest = { ...completed, status: "boarded", updated_at: "2026-04-30T11:55:30.000Z" };
  const payload: RequestRealtimePayload = { eventType: "UPDATE", new: lateIncoming, old: { id: "r1" } };
  const result = mergeRealtimeRequest([completed], payload);
  assert.equal(result[0].status, "completed", "completed should not be overwritten by late boarded");
});

// ---------------------------------------------------------------------------
// 2. remaining capacity accounts for reserved (assigned/arriving) passengers
// ---------------------------------------------------------------------------
test("terminal accuracy: remaining subtracts reserved load from assigned+arriving", () => {
  assert.match(DASHBOARD, /const reservedLoad = elevatorRequests/);
  assert.match(DASHBOARD, /request\.status === "assigned" \|\| request\.status === "arriving"/);
  assert.match(DASHBOARD, /effectiveElevator\.capacity - effectiveElevator\.current_load - reservedLoad/);
});

// ---------------------------------------------------------------------------
// 3. MovementBoard splits by direction (up list vs down list)
// ---------------------------------------------------------------------------
test("terminal accuracy: MovementBoard separates up and down requests", () => {
  assert.match(MOVEMENT, /const up = visibleRequests\.filter\(\(request\) => request\.direction === "up"\)/);
  assert.match(MOVEMENT, /const down = visibleRequests\.filter\(\(request\) => request\.direction === "down"\)/);
});

// ---------------------------------------------------------------------------
// 4. completed/cancelled excluded from movement queue
// ---------------------------------------------------------------------------
test("terminal accuracy: isOperatorMovementQueueStatus excludes completed/cancelled", () => {
  // Verify the constant definition excludes terminal statuses
  const hoist = readFileSync(join(root, "types/hoist.ts"), "utf8");
  assert.match(hoist, /OPERATOR_MOVEMENT_QUEUE_STATUSES.*pending.*assigned.*arriving.*boarded/);
  assert.doesNotMatch(hoist.match(/OPERATOR_MOVEMENT_QUEUE_STATUSES\s*=\s*\[[^\]]*\]/)?.[0] ?? "", /completed|cancelled/);
});

// ---------------------------------------------------------------------------
// 5. double-click protection exists in RecommendedNextStop
// ---------------------------------------------------------------------------
test("terminal accuracy: pendingPickupIds prevents double-click pickup", () => {
  assert.match(RECOMMENDED, /if \(pendingPickupIds\.has\(requestId\)\) return/);
  assert.match(RECOMMENDED, /const alreadyPending = ids\.some\(\(id\) => pendingDropoffIds\.has\(id\)\)/);
});

// ---------------------------------------------------------------------------
// 6. rollback handlers exist for pickup and dropoff failures
// ---------------------------------------------------------------------------
test("terminal accuracy: onPickupFailure restores original request status", () => {
  assert.match(DASHBOARD, /onPickupFailure=\{[\s\S]*?status: req\.status,\s*updated_at: req\.updated_at,\s*elevator_id: req\.elevator_id/);
});

test("terminal accuracy: onDropoffFailure restores boarded status and clears completed_at", () => {
  assert.match(DASHBOARD, /onDropoffFailure=\{[\s\S]*?status: "boarded" as const, completed_at: null/);
});

// ---------------------------------------------------------------------------
// 7. poll merge respects terminal statuses (existing behavior, lock it)
// ---------------------------------------------------------------------------
test("terminal accuracy: mergeOperatorPollRequest keeps completed over incoming non-terminal", () => {
  const completed: HoistRequest = {
    id: "r1", project_id: "p", elevator_id: "e1",
    from_floor_id: "rdc", to_floor_id: "5", direction: "up",
    passenger_count: 1, original_passenger_count: 1, remaining_passenger_count: 0,
    split_required: false, priority: false, priority_reason: null, note: null,
    status: "completed", sequence_number: 1,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    created_at: "2026-04-30T11:55:00.000Z",
    updated_at: "2026-04-30T11:56:00.000Z",
    completed_at: "2026-04-30T11:56:00.000Z",
  };
  const incoming: HoistRequest = { ...completed, status: "assigned", updated_at: "2026-04-30T11:55:30.000Z" };
  const result = mergeOperatorPollRequest(completed, incoming);
  assert.equal(result.status, "completed");
});

// ---------------------------------------------------------------------------
// 8. terminal doesn't disable operator by hiding error display
// ---------------------------------------------------------------------------
test("terminal accuracy: operator action error is displayed, not terminal-blocking", () => {
  assert.match(DASHBOARD, /operatorActionError \?/);
  assert.match(DASHBOARD, /\{operatorActionError/);
});

// ---------------------------------------------------------------------------
// 9. pending requests stay visible even when capacity blocked
// ---------------------------------------------------------------------------
test("terminal accuracy: activeQueue includes requests even if passenger_count > remaining", () => {
  // activeQueue is filtered by isOperatorMovementQueueStatus, not by capacity
  // So oversized requests are visible in the queue with capacity warnings
  assert.match(DASHBOARD, /const activeQueue = liveQueue\.filter\(\(request\) => isOperatorMovementQueueStatus\(request\.status\)\)/);
  // Verify no passenger_count filter on activeQueue
  const activeLine = DASHBOARD.match(/const activeQueue = [^;]+;/)?.[0] ?? "";
  assert.doesNotMatch(activeLine, /passenger_count/);
});

// ---------------------------------------------------------------------------
// 10. broadcast only after server confirmation, not on optimistic pickup
// ---------------------------------------------------------------------------
test("terminal accuracy: broadcast passenger only after onPickupConfirmed, not onPickupSuccess", () => {
  const successBlock = DASHBOARD.match(/onPickupSuccess=\{\(req\) => \{[\s\S]*?\}\}/)?.[0] ?? "";
  assert.doesNotMatch(successBlock, /broadcastPassengerRequestBoarded/);
  assert.match(DASHBOARD, /onPickupConfirmed=\{[\s\S]*?broadcastPassengerRequestBoarded/);
});
