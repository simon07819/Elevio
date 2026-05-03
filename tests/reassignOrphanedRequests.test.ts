/**
 * Reassign orphaned requests on operator release — targeted tests.
 *
 * Bug: when an operator releases their tablet and another operator is
 * available, requests assigned to the released elevator were either
 * cancelled (if no operators) or left orphaned (if another operator
 * existed). Passengers were always reset via queue_cleared even when
 * their request was reassigned to another operator.
 *
 * Fix (server-side):
 * - Add reassignOrphanedRequestsToActiveOperator in actions.ts
 * - Called BEFORE cancelActiveProjectRequestsIfNoLiveOperators
 * - Uses assignRequestToBestElevator for scoring
 * - Only updates elevator_id (no new request, no duplication)
 * - Returns hasOtherOperator boolean in release result
 *
 * Fix (client-side):
 * - After release, broadcast OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED
 *   to other operators always
 * - Broadcast PASSENGER_BROADCAST_QUEUE_CLEARED to passengers ONLY
 *   if no other operator is available (hasOtherOperator=false)
 * - If hasOtherOperator=true, passengers keep their request (reassigned)
 *
 * Tests:
 * 1. Release without other operator → passenger reset (queue_cleared)
 * 2. Release with other operator → request reassigned
 * 3. Reassigned request visible at new operator (elevator_id changed)
 * 4. Boarded request NOT reassigned (ORPHAN_REASSIGN_STATUSES excludes boarded)
 * 5. No duplication: only elevator_id updated via .update()
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. Release without other operator → passenger reset (queue_cleared sent)
// ---------------------------------------------------------------------------
test("reassign: queue_cleared broadcast sent when no other operator (hasOtherOperator=false)", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(workspace, /broadcastPassengerQueueCleared/);
  // Broadcast is conditional on hasOtherOperator
  assert.match(workspace, /hasOtherOperator/);
  // queue_cleared only sent when !hasOtherOperator
  assert.match(workspace, /!result\.hasOtherOperator/);
});

// ---------------------------------------------------------------------------
// 2. Release with other operator → request reassigned (server-side)
// ---------------------------------------------------------------------------
test("reassign: reassignOrphanedRequestsToActiveOperator exists and called before cancel", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  assert.match(actions, /reassignOrphanedRequestsToActiveOperator/);
  // Called BEFORE cancelActiveProjectRequestsIfNoLiveOperators
  const releaseFn = actions.match(/async function releaseOperatorElevator[\s\S]{0,2000}/);
  assert.ok(releaseFn, "releaseOperatorElevator found");
  const reassignPos = releaseFn![0].indexOf("reassignOrphanedRequestsToActiveOperator");
  const cancelPos = releaseFn![0].indexOf("cancelActiveProjectRequestsIfNoLiveOperators");
  assert.ok(reassignPos > 0, "reassign called");
  assert.ok(cancelPos > 0, "cancel called");
  assert.ok(reassignPos < cancelPos, "reassign called BEFORE cancel");
});

// ---------------------------------------------------------------------------
// 3. Reassigned request visible at new operator (elevator_id changed)
// ---------------------------------------------------------------------------
test("reassign: elevator_id updated via assignRequestToBestElevator scoring", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  // assignRequestToBestElevator is used for scoring
  assert.match(actions, /assignRequestToBestElevator/);
  // Result elevatorId is written back to DB
  assert.match(actions, /assignment\.elevatorId/);
  assert.match(actions, /\.update\(\{ elevator_id: assignment\.elevatorId/);
});

// ---------------------------------------------------------------------------
// 4. Boarded request NOT reassigned (ORPHAN_REASSIGN_STATUSES excludes boarded)
// ---------------------------------------------------------------------------
test("reassign: ORPHAN_REASSIGN_STATUSES excludes boarded/completed/cancelled", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const match = actions.match(/ORPHAN_REASSIGN_STATUSES[^;]+;/);
  assert.ok(match, "ORPHAN_REASSIGN_STATUSES defined");
  assert.ok(match![0].includes("pending"), "includes pending");
  assert.ok(match![0].includes("assigned"), "includes assigned");
  assert.ok(match![0].includes("arriving"), "includes arriving");
  assert.ok(!match![0].includes("boarded"), "excludes boarded");
  assert.ok(!match![0].includes("completed"), "excludes completed");
  assert.ok(!match![0].includes("cancelled"), "excludes cancelled");
});

// ---------------------------------------------------------------------------
// 5. No duplication: only elevator_id changed, no new request created
// ---------------------------------------------------------------------------
test("reassign: only elevator_id changed via update, no insert", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  // Find the reassign function body — ends at the next top-level function or export
  const fnStart = actions.indexOf("async function reassignOrphanedRequestsToActiveOperator");
  const fnEnd = actions.indexOf("\n}", fnStart + 100); // first closing brace at column 0
  const fnBody = actions.slice(fnStart, fnEnd);
  assert.ok(fnBody.includes(".update({ elevator_id:"), "uses update");
  assert.ok(!fnBody.includes(".insert("), "no insert in reassign function body");
  assert.match(fnBody, /\.eq\("id", orphan\.id\)/, "targets specific request by id");
});
