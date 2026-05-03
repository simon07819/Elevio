/**
 * Operator release tablet sync — targeted tests.
 *
 * Bugs:
 * A. No broadcast after "Libérer tablette" — passengers don't know their
 *    operator is gone until the next poll (~30s). They stay stuck in
 *    "request submitted" state.
 * B. handleActivate/release guards too broad — block ALL activations when
 *    ANY elevator is being released, preventing fast re-activation of a
 *    different elevator.
 *
 * Fixes:
 * A. After successful release, broadcast both:
 *    - OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED (for other operators)
 *    - PASSENGER_BROADCAST_QUEUE_CLEARED (for passengers on released elevator)
 * B. Narrow guards: only block the SAME elevator, not all elevators.
 *
 * Tests:
 * 1. Release sends queue_cleared broadcast for passenger sync
 * 2. Release sends elevator_session_cleared broadcast for operator sync
 * 3. handleActivate guard is narrow (same elevator only)
 * 4. Release guard is narrow (same elevator only)
 * 5. Released elevator's requests don't include completed/cancelled
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. Release sends queue_cleared broadcast for passenger sync
// ---------------------------------------------------------------------------
test("release-sync: broadcastPassengerQueueCleared called after successful release", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(workspace, /broadcastPassengerQueueCleared/);
  // Only broadcast non-terminal requests
  assert.match(workspace, /r\.status !== "completed" && r\.status !== "cancelled"/);
});

// ---------------------------------------------------------------------------
// 2. Release sends elevator_session_cleared broadcast for operator sync
// ---------------------------------------------------------------------------
test("release-sync: broadcastOperatorElevatorSessionCleared called after successful release", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(workspace, /broadcastOperatorElevatorSessionCleared/);
});

// ---------------------------------------------------------------------------
// 3. handleActivate guard is narrow (same elevator only)
// ---------------------------------------------------------------------------
test("release-sync: handleActivate guard only blocks same elevator", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  // Guard should check elevator.id, not just truthy
  assert.match(workspace, /activatingElevatorId === elevator\.id \|\| releasingElevatorId === elevator\.id/);
  // Old broad guard should NOT exist
  assert.ok(!workspace.includes("if (activatingElevatorId || releasingElevatorId) return"), "old broad guard removed from handleActivate");
});

// ---------------------------------------------------------------------------
// 4. Release guard is narrow (same elevator only)
// ---------------------------------------------------------------------------
test("release-sync: release guard only blocks same elevator", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseFn = workspace.match(/function release\(\)[\s\S]{0,500}/);
  assert.ok(releaseFn, "release function exists");
  assert.ok(releaseFn![0].includes("=== selectedElevator.id"), "release guard checks specific elevator id");
  // Old broad guard should NOT be in release
  assert.ok(!releaseFn![0].includes("if (activatingElevatorId || releasingElevatorId) return"), "old broad guard removed from release");
});

// ---------------------------------------------------------------------------
// 5. Released elevator's requests don't include completed/cancelled
// ---------------------------------------------------------------------------
test("release-sync: broadcast filters out completed/cancelled requests", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  // The filter should exclude terminal statuses so passengers with
  // already-completed trips aren't incorrectly reset
  assert.match(workspace, /releasedRequestIds = requests/);
  assert.match(workspace, /r\.status !== "completed" && r\.status !== "cancelled"/);
  assert.match(workspace, /broadcastPassengerQueueCleared\(client, project\.id, releasedRequestIds\)/);
});
