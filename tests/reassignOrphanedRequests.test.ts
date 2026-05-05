/**
 * Reassign orphaned requests on operator release — targeted tests.
 *
 * Bug: when an operator releases their tablet and another operator is
 * available, requests assigned to the released elevator were either
 * cancelled (if no operators) or left orphaned (if another operator
 * existed). Passengers were always reset via queue_cleared even when
 * their request was reassigned to another operator.
 *
 * Additional bug: if another operator exists but is ineligible
 * (PLEIN/manual_full, capacity full, out of service), requests were
 * left orphaned — passenger stuck waiting indefinitely.
 *
 * Fix (server-side):
 * - Add reassignOrphanedRequestsToActiveOperator in actions.ts
 * - Called BEFORE cancelActiveProjectRequestsIfNoLiveOperators
 * - Uses assignRequestToBestElevator for scoring
 * - Only updates elevator_id (no new request, no duplication)
 * - If assignRequestToBestElevator returns null (ineligible operator),
 *   cancels the orphan with note "Annulée automatiquement: aucun
 *   opérateur éligible disponible."
 * - Returns true ONLY if ALL orphans were reassigned
 * - Returns false if any orphan was unassignable → triggers queue_cleared
 * - Returns hasOtherOperator boolean in release result
 *
 * Fix (client-side):
 * - After release, broadcast OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED
 *   to other operators always
 * - Broadcast PASSENGER_BROADCAST_QUEUE_CLEARED to passengers ONLY
 *   if hasOtherOperator=false
 *
 * Tests:
 * 1. Release without other operator → passenger reset (queue_cleared)
 * 2. Release with other operator → request reassigned
 * 3. Reassigned request visible at new operator (elevator_id changed)
 * 4. Boarded request NOT reassigned (ORPHAN_REASSIGN_STATUSES excludes boarded)
 * 5. Unassignable orphans cancelled (ineligible operator → cancel + queue_cleared)
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
  // Called BEFORE cancelActiveProjectRequestsIfNoLiveOperators in releaseOperatorElevator
  const releaseIdx = actions.indexOf("export async function releaseOperatorElevator");
  assert.ok(releaseIdx > 0, "releaseOperatorElevator found");
  const releaseBody = actions.slice(releaseIdx, releaseIdx + 3000);
  const reassignPos = releaseBody.indexOf("reassignOrphanedRequestsToActiveOperator");
  const cancelPos = releaseBody.indexOf("cancelActiveProjectRequestsIfNoLiveOperators");
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
// 4. Boarded requests NOT reassigned — passenger is physically in the released elevator
// ---------------------------------------------------------------------------
test("reassign: ORPHAN_REASSIGN_STATUSES excludes boarded (passenger physically in released elevator)", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const match = actions.match(/ORPHAN_REASSIGN_STATUSES[^;]+;/);
  assert.ok(match, "ORPHAN_REASSIGN_STATUSES defined");
  assert.ok(match![0].includes("pending"), "includes pending");
  assert.ok(match![0].includes("assigned"), "includes assigned");
  assert.ok(match![0].includes("arriving"), "includes arriving");
  assert.ok(!match![0].includes("boarded"), "excludes boarded — passenger physically in released elevator");
  assert.ok(!match![0].includes("completed"), "excludes completed");
  assert.ok(!match![0].includes("cancelled"), "excludes cancelled");
});

// ---------------------------------------------------------------------------
// 4b. Boarded requests on released elevator are cancelled explicitly
// ---------------------------------------------------------------------------
test("reassign: boarded requests on released elevator are cancelled on release", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const releaseIdx = actions.indexOf("export async function releaseOperatorElevator");
  assert.ok(releaseIdx > 0, "releaseOperatorElevator found");
  const releaseBody = actions.slice(releaseIdx, releaseIdx + 5000);
  // Boarded requests cancelled after reassign but before zero-operator check
  assert.match(releaseBody, /releaseOperator_boardedCancel/, "logs boarded cancel action");
  assert.match(releaseBody, /\.eq\("status", "boarded"\)/, "targets boarded status specifically");
  assert.match(releaseBody, /Annulé automatiquement.*opérateur libéré/, "cancellation note for released operator");
});

// ---------------------------------------------------------------------------
// 5. Unassignable orphans cancelled (ineligible operator → cancel + queue_cleared)
// ---------------------------------------------------------------------------
test("reassign: unassignable orphans cancelled when operator ineligible", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnStart = actions.indexOf("async function reassignOrphanedRequestsToActiveOperator");
  const fnEnd = actions.indexOf("\n}", fnStart + 100);
  const fnBody = actions.slice(fnStart, fnEnd);
  // Unassignable orphans collected in unassignedIds
  assert.match(fnBody, /unassignedIds/, "tracks unassignable orphans");
  // They are cancelled with status "cancelled"
  assert.match(fnBody, /status: .cancelled./, "sets status to cancelled");
  // With a specific note explaining why
  assert.match(fnBody, /Annulée automatiquement/, "cancellation note present");
  // Function returns false if any orphan was unassignable
  assert.match(fnBody, /unassignedIds\.length === 0/, "returns false when unassignable orphans exist");
  // No insert in reassign function
  assert.ok(!fnBody.includes(".insert("), "no insert in reassign function body");
});
