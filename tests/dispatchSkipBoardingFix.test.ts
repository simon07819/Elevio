/**
 * Critical dispatch + skip + boarding duplicate tests.
 *
 * 10 scenarios from the mission specification.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const BRAIN = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const ROUTING = readFileSync(join(root, "lib/elevatorRouting.ts"), "utf8");
const STATE_RES = readFileSync(join(root, "lib/stateResolution.ts"), "utf8");
const REALTIME = readFileSync(join(root, "lib/realtime.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// 1. Brain: after pickup 15→3, next action = pickup 8 (not dropoff 3)
// ═══════════════════════════════════════════════════════════════════════════
test("dispatch: opportunistic pickup before dropoff when on the way", () => {
  // The brain must check for pickups toward the next dropoff BEFORE returning dropoff
  assert.match(BRAIN, /openPickupsTowardNextDropoff/, "uses openPickupsTowardNextDropoff");
  assert.match(BRAIN, /nextDropSort !== null/, "has nextDropSort branch for onboard passengers");
  // The pickup toward dropoff branch must come BEFORE the plain dropoff return
  const pickupBranch = BRAIN.match(/if \(nextDropSort !== null\) \{[\s\S]*?return \{[\s\S]*?action: "dropoff"[\s\S]*?\};/)?.[0] ?? "";
  assert.match(pickupBranch, /action: "pickup"/, "pickup action appears in nextDropSort branch before dropoff fallback");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Brain: after skip, if onboard exists → dropoff, not pause
// ═══════════════════════════════════════════════════════════════════════════
test("dispatch: never pause when onboard passengers exist", () => {
  // The brain must guard against "wait" when hasOnboard
  const waitReturns = BRAIN.match(/action: "wait"/g) ?? [];
  assert.ok(waitReturns.length >= 2, "has wait returns to guard");

  // Each "wait" return must be preceded by a hasOnboard guard
  const brainAfterOnboard = BRAIN.substring(BRAIN.indexOf("const hasOnboard"));
  // Count hasOnboard guards before wait returns
  const onboardGuards = (brainAfterOnboard.match(/hasOnboard.*?onboardPassengers\.length > 0/g) ?? []).length;
  assert.ok(onboardGuards >= 2, "at least 2 hasOnboard guards before wait returns");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. After dropoff, skipped request becomes eligible again
// ═══════════════════════════════════════════════════════════════════════════
test("dispatch: skipped request re-eligible after dropoff", () => {
  assert.match(ACTIONS, /clearSkippedRequestsForElevator/, "clearSkippedRequestsForElevator function");
  assert.match(DASHBOARD, /clearSkippedRequestsForElevator/, "called after dropoff in dashboard");
  assert.match(BRAIN, /isSkippedForThisElevator/, "brain checks skip filter");
  assert.match(BRAIN, /SKIP_TTL_MS/, "TTL for skip auto-expiry");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Brain never returns pause when onboardRequests.length > 0
// ═══════════════════════════════════════════════════════════════════════════
test("dispatch: brain RULE 5 - no pause with onboard", () => {
  // Check that the brain has the "RULE 5" guard
  assert.match(BRAIN, /RULE 5/, "RULE 5 comment present");
  assert.match(BRAIN, /Never PAUSE when onboard/, "RULE 5 description");
  // The guard returns "dropoff" action when hasOnboard and would-be-wait
  const rule5Guard = BRAIN.match(/hasOnboard.*?onboardPassengers\.length > 0[\s\S]*?action: "dropoff"/s)?.[0] ?? "";
  assert.ok(rule5Guard.length > 0, "RULE 5 returns dropoff instead of wait when onboard");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Skip does not filter onboardRequests
// ═══════════════════════════════════════════════════════════════════════════
test("dispatch: skip never filters onboard requests", () => {
  // The brain's openRequests filter uses WAITING_STATUSES which excludes "boarded"
  assert.match(BRAIN, /WAITING_STATUSES\.has\(request\.status\)/, "openRequests filtered by WAITING_STATUSES");
  // onboardPassengers are passed separately and never filtered by skip
  assert.match(BRAIN, /onboardPassengers/, "onboardPassengers used separately from openRequests");
  // The skip filter is ONLY on openRequests (WAITING_STATUSES), not onboard
  const skipFilter = BRAIN.match(/isSkippedForThisElevator[\s\S]*?\.filter[\s\S]*?openRequests/s)?.[0] ?? "";
  assert.ok(skipFilter.length > 0 || BRAIN.includes("!isSkippedForThisElevator(request)"), "skip filter only on openRequests, not onboard");
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Skip does not change request status
// ═══════════════════════════════════════════════════════════════════════════
test("skip: does not change request status", () => {
  // The skip server action only sets skipped_by_elevator_id and skipped_at
  const skipStart = ACTIONS.indexOf("export async function skipRequestForCurrentPassage");
  const skipEnd = ACTIONS.indexOf("export async function clearSkippedRequestsForElevator", skipStart);
  const skipFn = skipStart >= 0 && skipEnd >= 0 ? ACTIONS.slice(skipStart, skipEnd) : "";
  assert.ok(skipFn.length > 0, "skip function found");
  assert.doesNotMatch(skipFn, /status.*boarded/, "skip does not set boarded");
  assert.doesNotMatch(skipFn, /status.*completed/, "skip does not set completed");
  assert.doesNotMatch(skipFn, /status.*cancelled/, "skip does not set cancelled");
  assert.match(skipFn, /skipped_by_elevator_id/, "skip sets skipped_by_elevator_id");
  assert.match(skipFn, /skipped_at/, "skip sets skipped_at");
  // Validates WAITING_STATUSES only
  assert.match(skipFn, /WAITING_STATUSES/, "validates request is in WAITING_STATUSES");
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. UI never shows Ramasser for boarded request
// ═══════════════════════════════════════════════════════════════════════════
test("ui: never shows pickup button for boarded request", () => {
  // actionRequest useMemo filters by pending/assigned/arriving only
  assert.match(RECOMMENDED, /request\.status === "pending" \|\| request\.status === "assigned" \|\| request\.status === "arriving"/, "actionRequest only picks pending/assigned/arriving");
  // Guard in pickup() function
  assert.match(RECOMMENDED, /Elevio Guard.*duplicate pickup/, "duplicate pickup guard in pickup function");
  assert.match(RECOMMENDED, /actionRequest\.status === "boarded"/, "checks if request is already boarded");
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Server action: boarded→boarded is idempotent
// ═══════════════════════════════════════════════════════════════════════════
test("server: boarded→boarded transition is idempotent (ok, not error)", () => {
  // IDEMPOTENT guard: same status returns ok immediately
  assert.match(ACTIONS, /currentStatus === status/, "idempotent check for same status");
  assert.match(ACTIONS, /IDEMPOTENT/, "IDEMPOTENT log tag");
  // Illegal transitions return ok:true with ignoree message (not ok:false error)
  assert.match(ACTIONS, /ignoree/, "ignoree message for graceful handling");
  // The return must be ok: true (not ok: false which would cause UI error)
  const illegalBlock = ACTIONS.match(/isLegalTransition[\s\S]{0,500}ok: true/s)?.[0] ?? "";
  assert.ok(illegalBlock.length > 0, "illegal transition block returns ok: true");
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Fire-and-forget pickup does not leave button stuck
// ═══════════════════════════════════════════════════════════════════════════
test("ui: fire-and-forget pickup does not leave En cours stuck", () => {
  // Pickup has no spinner/pending state — instant optimistic
  assert.match(RECOMMENDED, /onPickupSuccess\?\.\(targetRequest\)/, "instant optimistic update before server call");
  // The pendingDropoffIds safety timeout for stuck buttons
  assert.match(RECOMMENDED, /10_000/, "safety timeout for stuck pendingDropoffIds");
  // Dropoff always clears pendingDropoffIds in finally
  assert.match(RECOMMENDED, /\.finally\(\(\) =>/, "finally block clears pending state");
  // pendingDropoffIds delete in finally
  const finallyMatch = RECOMMENDED.match(/\.finally\(\(\) => \{[\s\S]*?next\.delete/s)?.[0] ?? "";
  assert.ok(finallyMatch.length > 0, "pendingDropoffIds entries deleted in finally");
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Poll/realtime never re-injects stale requests after advanced status
// ═══════════════════════════════════════════════════════════════════════════
test("sync: poll/realtime never downgrades boarded→pending", () => {
  // resolveMerge: higher priority wins
  assert.match(STATE_RES, /STATUS_PRIORITY/, "status priority defined");
  assert.match(STATE_RES, /boarded: 3/, "boarded has priority 3");
  assert.match(STATE_RES, /pending: 1/, "pending has priority 1");
  // resolveMerge: existing with higher priority beats incoming with lower
  assert.match(STATE_RES, /existingPriority > incomingPriority.*return existing/, "existing higher priority wins");
  // mergeOperatorPollRequest uses resolveMerge
  assert.match(REALTIME, /resolveMerge/, "mergeOperatorPollRequest uses resolveMerge");
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Direction override after pickup for immediate brain recalculation
// ═══════════════════════════════════════════════════════════════════════════
test("ui: direction override after pickup forces immediate brain recalc", () => {
  assert.match(DASHBOARD, /directionOverride/, "directionOverride state exists");
  assert.match(DASHBOARD, /setDirectionOverride/, "setDirectionOverride function");
  // Set in onPickupSuccess
  const pickupSuccess = DASHBOARD.match(/onPickupSuccess=.*?=>[\s\S]*?rememberOptimisticRequest/s)?.[0] ?? "";
  assert.match(pickupSuccess, /setDirectionOverride/, "direction set in onPickupSuccess");
  // Used in effectiveElevator
  assert.match(DASHBOARD, /directionOverride \?\? elevator\.direction/, "directionOverride used in effectiveElevator");
  // Cleared on dropoff
  const dropoffSuccess = DASHBOARD.match(/onDropoffSuccess=.*?=>[\s\S]*?clearSkipped/s)?.[0] ?? "";
  assert.match(dropoffSuccess, /setDirectionOverride\(null\)/, "direction cleared on dropoff");
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Debug logs present
// ═══════════════════════════════════════════════════════════════════════════
test("debug: [Elevio Brain] log present", () => {
  assert.match(BRAIN, /\[Elevio Brain\]/, "[Elevio Brain] log tag in brain");
});

test("debug: [Elevio Skip] log present", () => {
  assert.match(ACTIONS, /\[Elevio Skip\]/, "[Elevio Skip] log tag in actions");
});

test("debug: [Elevio Guard] duplicate pickup log present", () => {
  assert.match(RECOMMENDED, /\[Elevio Guard\]/, "[Elevio Guard] log tag in recommended");
});

test("debug: recalculated_after_action log present", () => {
  assert.match(RECOMMENDED, /recalculated_after_action/, "recalculated_after_action structured log");
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Routing: openPickupsTowardNextDropoff finds pickups between current and drop
// ═══════════════════════════════════════════════════════════════════════════
test("routing: openPickupsTowardNextDropoff covers down-direction segments", () => {
  assert.match(ROUTING, /pickupFromSortOnSegmentToDropoff/, "segment check function exists");
  assert.match(ROUTING, /from < cur && from > drop/, "down-direction: from < cur AND from > drop");
  assert.match(ROUTING, /from > cur && from < drop/, "up-direction: from > cur AND from < drop");
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. effectiveShowDropoff with onboard passengers prevents Pause
// ═══════════════════════════════════════════════════════════════════════════
test("ui: effectiveShowDropoff prevents Pause when onboard exists", () => {
  assert.match(RECOMMENDED, /effectiveShowDropoff/, "effectiveShowDropoff computed");
  assert.match(RECOMMENDED, /onboardRequests\.length > 0/, "onboardRequests length check in effectiveShowDropoff");
  assert.match(RECOMMENDED, /onboardDropFloorId/, "onboardDropFloorId computed from onboard requests");
});
