/**
 * Passenger terminal sync and tablet toggle stability — targeted tests.
 *
 * Bugs fixed:
 * A. Pickup confirmed → passenger returns to QR instantly (persistent channel)
 * B. Passenger self-cancel → stays in selection flow, NOT forced to QR
 * C. Cleared demands never re-injected by stale poll/realtime
 * D. Tablet toggle stability (rapid click guard, no impossible state)
 *
 * Tests:
 * 1. Pickup operator → passenger returns QR immediately (structural)
 * 2. Passenger cancel → stays in flow, not forced to QR (structural)
 * 3. Cleared demands filtered from stale poll (structural)
 * 4. Terminal empty → no false "demande envoyée" (structural)
 * 5. Release tablet → activate quickly available (structural)
 * 6. Rapid clicks activate/release → guard prevents impossible state (structural)
 * 7. Stale realtime/poll cannot re-inject cancelled/completed (mergeOperatorPollRequest)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { mergeOperatorPollRequest } from "../lib/realtime";
import type { HoistRequest } from "../types/hoist";

const root = process.cwd();

function mkReq(id: string, status: string, updatedAt: string): HoistRequest {
  return {
    id, project_id: "p", elevator_id: "e1",
    from_floor_id: "rdc", to_floor_id: "5",
    direction: "up", passenger_count: 2,
    original_passenger_count: 2, remaining_passenger_count: 2,
    split_required: false, priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    status: status as HoistRequest["status"],
    sequence_number: 1,
    created_at: "2026-04-30T11:55:00.000Z",
    updated_at: updatedAt, completed_at: null,
  };
}

// ---------------------------------------------------------------------------
// 1. Pickup operator → passenger returns QR immediately
// ---------------------------------------------------------------------------
test("passenger-sync: operator pickup sends instant broadcast (persistent channel)", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dashboard, /broadcastChannelRef/);
  assert.match(dashboard, /event: "request_boarded"/);
  // onPickupConfirmed sends on persistent channel (no subscribe wait)
  assert.match(dashboard, /broadcastChannelRef\.current/);
});

// ---------------------------------------------------------------------------
// 2. Passenger cancel → stays in flow, not forced to QR
// ---------------------------------------------------------------------------
test("passenger-sync: self-cancel stays in selection flow, no router.replace", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // clearsPassengerPendingStorage does NOT include "cancelled"
  assert.ok(!form.includes('return isTerminalPassengerRequestStatus(status) || status === "cancelled"'));
  // There should be a separate path for cancelled that does NOT call router.replace
  assert.match(form, /isPassengerSelfCancelStatus/);
  // queue_cleared broadcast should NOT force router.replace("/")
  const clearedHandler = form.match(/PASSENGER_BROADCAST_QUEUE_CLEARED[\s\S]{0,500}/);
  assert.ok(clearedHandler, "queue_cleared handler exists");
  assert.ok(!clearedHandler![0].includes('router.replace("/")'), "queue_cleared does NOT navigate to /");
});

// ---------------------------------------------------------------------------
// 3. Cleared demands filtered from stale poll (clearedIdsRef)
// ---------------------------------------------------------------------------
test("passenger-sync: clearedIdsRef prevents stale poll re-injection", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dashboard, /clearedIdsRef/);
  // cleared IDs are added in clearVisibleQueue
  assert.match(dashboard, /clearedIdsRef\.current\.add/);
  // filtered in syncRequests poll
  assert.match(dashboard, /clearedIdsRef\.current/);
  // filtered in realtime handler
  assert.match(dashboard, /clearedIdsRef\.current\.has/);
});

// ---------------------------------------------------------------------------
// 4. Terminal empty → no false "demande envoyée" (structural)
// ---------------------------------------------------------------------------
test("passenger-sync: cleared request not tracked as pending", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // clearsPassengerPendingStorage clears localStorage so passenger can re-request
  assert.match(form, /clearPassengerPendingRequest/);
  // shouldRestoreSubmittedFromSnapshot returns false for cancelled
  assert.match(form, /shouldRestoreSubmittedFromSnapshot/);
});

// ---------------------------------------------------------------------------
// 5. Release tablet → activate quickly available
// ---------------------------------------------------------------------------
test("tablet-toggle: release sets releasingElevatorId=null in finally", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  // release function has finally block that clears releasingElevatorId
  assert.match(workspace, /setReleasingElevatorId\(null\)/);
  // release optimistically clears selectedElevatorId (no waiting for server)
  assert.match(workspace, /setSelectedElevatorId\(null\)/);
});

// ---------------------------------------------------------------------------
// 6. Rapid clicks activate/release → guard prevents impossible state
// ---------------------------------------------------------------------------
test("tablet-toggle: handleActivate and release guard against concurrent ops on same elevator", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  // handleActivate checks guard (narrowed to same elevator)
  assert.match(workspace, /activatingElevatorId === elevator\.id \|\| releasingElevatorId === elevator\.id/);
  // release checks guard (narrowed to same elevator)
  const releaseFn = workspace.match(/function release\(\)[\s\S]{0,400}/);
  assert.ok(releaseFn, "release function exists");
  assert.ok(releaseFn![0].includes("=== selectedElevator.id"), "release has narrow concurrent guard per elevator");
  // activate button disabled during operation
  assert.match(workspace, /disabled=\{locked \|\| isActivatingThisElevator\}/);
  // release button disabled during operation
  assert.match(workspace, /disabled=\{releasingElevatorId === selectedElevator\.id\}/);
});

// ---------------------------------------------------------------------------
// 7. Stale realtime/poll cannot re-inject cancelled/completed (mergeOperatorPollRequest)
// ---------------------------------------------------------------------------
test("passenger-sync: mergeOperatorPollRequest keeps terminal over stale incoming", () => {
  const local = mkReq("r1", "cancelled", "2026-04-30T12:02:00.000Z");
  const stale = mkReq("r1", "assigned", "2026-04-30T12:00:00.000Z");
  const result = mergeOperatorPollRequest(local, stale);
  assert.equal(result.status, "cancelled", "cancelled stays cancelled over stale assigned");
});

test("passenger-sync: mergeOperatorPollRequest keeps completed over stale boarded", () => {
  const local = mkReq("r2", "completed", "2026-04-30T12:03:00.000Z");
  const stale = mkReq("r2", "boarded", "2026-04-30T12:00:30.000Z");
  const result = mergeOperatorPollRequest(local, stale);
  assert.equal(result.status, "completed", "completed stays completed over stale boarded");
});
