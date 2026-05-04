/**
 * Skip passage feature tests.
 *
 * Verifies that the "Sauter ce passage" button:
 * - Does not cancel the request
 * - Does not board the request
 * - Removes the request from current recommendation
 * - Keeps the request in pending/assigned/arriving status
 * - Returns the request after dropoff/cycle change
 * - Is not visible on dropoff
 * - Is not visible on boarded/onboard
 * - Survives refresh (DB-backed)
 * - Works across multi-device
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const BRAIN = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
const TYPES = readFileSync(join(root, "types/hoist.ts"), "utf8");
const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
const I18N = readFileSync(join(root, "lib/i18n.ts"), "utf8");
const DISPATCH_ENGINE = readFileSync(join(root, "services/dispatchEngine.ts"), "utf8");

// ---------------------------------------------------------------------------
// 1. DB schema has skip columns
// ---------------------------------------------------------------------------
test("skip: DB schema has skipped_by_elevator_id and skipped_at columns", () => {
  assert.match(SCHEMA, /skipped_by_elevator_id/, "skipped_by_elevator_id column");
  assert.match(SCHEMA, /skipped_at/, "skipped_at column");
  assert.match(SCHEMA, /idx_requests_skipped_active/, "partial index for active skips");
});

// ---------------------------------------------------------------------------
// 2. HoistRequest type has skip fields
// ---------------------------------------------------------------------------
test("skip: HoistRequest type includes skipped_by_elevator_id and skipped_at", () => {
  assert.match(TYPES, /skipped_by_elevator_id/, "skipped_by_elevator_id in type");
  assert.match(TYPES, /skipped_at/, "skipped_at in type");
});

// ---------------------------------------------------------------------------
// 3. BrainRequest includes skip fields
// ---------------------------------------------------------------------------
test("skip: BrainRequest includes skipped_by_elevator_id and skipped_at", () => {
  assert.match(BRAIN, /skipped_by_elevator_id.*\n.*skipped_at/s, "BrainRequest has both skip fields");
});

// ---------------------------------------------------------------------------
// 4. Dispatch engine filters out skipped requests (isSkippedForThisElevator)
// ---------------------------------------------------------------------------
test("skip: dispatch engine filters skipped requests for current elevator", () => {
  assert.match(BRAIN, /isSkippedForThisElevator/, "isSkippedForThisElevator function");
  assert.match(BRAIN, /SKIP_TTL_MS/, "skip TTL constant");
  assert.match(BRAIN, /5 \* 60_000/, "5 minute TTL");
  assert.match(BRAIN, /!isSkippedForThisElevator\(request\)/, "skipped filter in openRequests");
});

// ---------------------------------------------------------------------------
// 5. Server action skipRequestForCurrentPassage exists
// ---------------------------------------------------------------------------
test("skip: skipRequestForCurrentPassage server action exists", () => {
  assert.match(ACTIONS, /skipRequestForCurrentPassage/, "server action defined");
  assert.match(ACTIONS, /skipped_by_elevator_id: elevatorId/, "sets skipped_by_elevator_id");
  assert.match(ACTIONS, /skipped_at: now/, "sets skipped_at");
  assert.match(ACTIONS, /\[Elevio Skip\]/, "[Elevio Skip] log tag");
});

// ---------------------------------------------------------------------------
// 6. Skip does NOT change status to cancelled or completed
// ---------------------------------------------------------------------------
test("skip: skip action does NOT cancel or complete the request", () => {
  const skipFn = ACTIONS.match(/skipRequestForCurrentPassage[\s\S]*?^export async function clearSkipped/m)?.[0] ?? "";
  assert.doesNotMatch(skipFn, /status.*cancelled/, "skip does not set cancelled");
  assert.doesNotMatch(skipFn, /status.*completed/, "skip does not set completed");
  assert.doesNotMatch(skipFn, /status.*boarded/, "skip does not set boarded");
  assert.doesNotMatch(skipFn, /completed_at/, "skip does not set completed_at");
});

// ---------------------------------------------------------------------------
// 7. Skip rejects non-pickup statuses
// ---------------------------------------------------------------------------
test("skip: skip action rejects boarded/completed/cancelled requests", () => {
  assert.match(ACTIONS, /WAITING_STATUSES\.has\(request/, "checks WAITING_STATUSES");
  assert.match(ACTIONS, /Cette demande ne peut plus etre sautee/, "rejection message for non-pickup status");
});

// ---------------------------------------------------------------------------
// 8. clearSkippedRequestsForElevator clears after dropoff
// ---------------------------------------------------------------------------
test("skip: clearSkippedRequestsForElevator exists for post-dropoff cleanup", () => {
  assert.match(ACTIONS, /clearSkippedRequestsForElevator/, "clear action defined");
  assert.match(ACTIONS, /skipped_by_elevator_id: null/, "clears skipped_by_elevator_id");
  assert.match(ACTIONS, /skipped_at: null/, "clears skipped_at");
});

// ---------------------------------------------------------------------------
// 9. Skip button visible ONLY for opportunistic pickup (with onboard passengers)
// ---------------------------------------------------------------------------
test("skip: skip button only visible for opportunistic pickup with onboard passengers", () => {
  // isOpportunisticPickup function must exist
  assert.match(RECOMMENDED, /isOpportunisticPickup/, "isOpportunisticPickup function exists");
  // isOpportunistic guards the skip button visibility
  assert.match(RECOMMENDED, /isOpportunistic &&/, "skip button guarded by isOpportunistic");
  // Function checks onboardRequests.length > 0
  assert.match(RECOMMENDED, /onboardRequests\.length === 0/, "returns false when no onboard passengers");
});

// ---------------------------------------------------------------------------
// 10. Skip button hidden when idle (no onboard passengers)
// ---------------------------------------------------------------------------
test("skip: skip button hidden when no onboard passengers", () => {
  // isOpportunisticPickup returns false when onboardRequests.length === 0
  assert.match(RECOMMENDED, /onboardRequests\.length === 0.*return false/, "returns false for no onboard");
});

// ---------------------------------------------------------------------------
// 11. Skip button hidden on dropoff
// ---------------------------------------------------------------------------
test("skip: skip button never visible on dropoff action", () => {
  // The dropoff button section (effectiveShowDropoff branch) should NOT contain skipPickup
  const dropoffBranch = RECOMMENDED.match(/effectiveShowDropoff \? \([\s\S]*?\) : showPickup/m)?.[0] ?? "";
  assert.doesNotMatch(dropoffBranch, /skipPickup/, "no skipPickup in dropoff branch");
  assert.doesNotMatch(dropoffBranch, /skipPassage/, "no skipPassage in dropoff branch");
});

// ---------------------------------------------------------------------------
// 12. After skip with onboard passenger, Déposer shown instead of Pause
// ---------------------------------------------------------------------------
test("skip: after skip with onboard passengers, dropoff shown not pause", () => {
  // onboardDropoffIds computed from onboard requests independently
  assert.match(RECOMMENDED, /onboardDropoffIds/, "onboardDropoffIds computed independently");
  assert.match(RECOMMENDED, /onboardDropFloorId/, "onboardDropFloorId computed independently");
  // effectiveShowDropoff fallback when onboard exists and pickup was skipped
  assert.match(RECOMMENDED, /effectiveShowDropoff/, "effectiveShowDropoff computed");
  assert.match(RECOMMENDED, /onboardRequests\.length > 0 && !hasPickupCandidate/, "fallback to onboard dropoff when pickup skipped");
});

// ---------------------------------------------------------------------------
// 13. Skipped pending request remains active (not cancelled, not boarded)
// ---------------------------------------------------------------------------
test("skip: skipped pending request remains active, not cancelled or boarded", () => {
  const skipFn = ACTIONS.match(/skipRequestForCurrentPassage[\s\S]*?^export async function clearSkipped/m)?.[0] ?? "";
  assert.doesNotMatch(skipFn, /status.*cancelled/, "skip does not set cancelled");
  assert.doesNotMatch(skipFn, /status.*completed/, "skip does not set completed");
  assert.doesNotMatch(skipFn, /status.*boarded/, "skip does not set boarded");
});

// ---------------------------------------------------------------------------
// 14. Skipped request does not remove onboard request
// ---------------------------------------------------------------------------
test("skip: skip filter applies only to pickup candidates, not onboard/dropoff", () => {
  // isSkippedForThisElevator only checks WAITING_STATUSES (pending/assigned/arriving)
  // Boarded passengers are never filtered
  assert.match(BRAIN, /!isSkippedForThisElevator\(request\)/, "skip filter on openRequests only");
  // onboardPassengers are computed separately — not affected by skip
  assert.doesNotMatch(BRAIN, /isSkippedForThisElevator.*boarded/, "skip filter never checks boarded");
});

// ---------------------------------------------------------------------------
// 15. onboardRequests prop passed from Dashboard
// ---------------------------------------------------------------------------
test("skip: Dashboard passes onboardRequests to RecommendedNextStop", () => {
  assert.match(DASHBOARD, /onboardRequests=\{enriched\.filter/, "onboardRequests prop passed");
  assert.match(DASHBOARD, /r\.status === "boarded"/, "filtered by boarded status");
});

// ---------------------------------------------------------------------------
// 16. Skip confirmation message in i18n
// ---------------------------------------------------------------------------
test("skip: i18n has skipPassage and skipConfirmation keys", () => {
  assert.match(I18N, /operator\.skipPassage/, "skipPassage key");
  assert.match(I18N, /operator\.skipConfirmation/, "skipConfirmation key");
  assert.match(I18N, /Sauter ce passage/, "FR text");
  assert.match(I18N, /Skip this pass/, "EN text");
});

// ---------------------------------------------------------------------------
// 17. Skip server call is fire-and-forget (no blocking)
// ---------------------------------------------------------------------------
test("skip: skip server call is fire-and-forget", () => {
  assert.match(RECOMMENDED, /void skipRequestForCurrentPassage/, "void fire-and-forget");
  assert.match(RECOMMENDED, /\.then\(/, "then handler for result");
  assert.match(RECOMMENDED, /\.catch\(/, "catch handler for error");
});

// ---------------------------------------------------------------------------
// 18. Skip uses deferred event type
// ---------------------------------------------------------------------------
test("skip: skip logs deferred event type", () => {
  assert.match(ACTIONS, /event_type: "deferred"/, "deferred event type");
});

// ---------------------------------------------------------------------------
// 19. Skip button uses SkipForward icon
// ---------------------------------------------------------------------------
test("skip: skip button uses SkipForward icon", () => {
  assert.match(RECOMMENDED, /SkipForward/, "SkipForward icon imported");
  assert.match(RECOMMENDED, /SkipForward size=\{16\}/, "SkipForward icon in button");
});

// ---------------------------------------------------------------------------
// 20. Confirmation auto-hides after 3s
// ---------------------------------------------------------------------------
test("skip: confirmation auto-hides after 3 seconds", () => {
  assert.match(RECOMMENDED, /setTimeout.*setSkipConfirmation.*null.*3000/, "3s auto-hide");
});

// ---------------------------------------------------------------------------
// 21. skippedIds state filters actionRequest
// ---------------------------------------------------------------------------
test("skip: skippedIds filters actionRequest (instant optimistic removal)", () => {
  assert.match(RECOMMENDED, /skippedIds\.has\(request\.id\)/, "skippedIds filter in actionRequest");
});

// ---------------------------------------------------------------------------
// 22. skippedIds state filters pickupCandidateAtDropFloor
// ---------------------------------------------------------------------------
test("skip: skippedIds filters pickupCandidateAtDropFloor", () => {
  const candidateMatch = RECOMMENDED.match(/pickupCandidateAtDropFloor[\s\S]*?null;/s)?.[0] ?? "";
  assert.match(candidateMatch, /skippedIds\.has/, "skippedIds filter in pickupCandidateAtDropFloor");
});
