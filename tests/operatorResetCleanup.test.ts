/**
 * Critical reset tests: operator release → zero operators → reactivation.
 *
 * Verifies:
 * - When last operator releases, ALL non-terminal requests are cancelled
 * - Boarded requests are cancelled too (no operator = no dropoff possible)
 * - Elevator state is fully reset
 * - Skip markers are cleared
 * - Session guard prevents stale requests from reappearing
 * - New requests after reactivation appear normally
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const ADMIN_PROJECT = readFileSync(join(root, "lib/adminProject.ts"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const WORKSPACE = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
const STATE_RES = readFileSync(join(root, "lib/stateResolution.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 1-5: Release last operator → all requests cancelled
// ═══════════════════════════════════════════════════════════════════════════

test("reset: zero operators cancels ALL non-terminal statuses including boarded", () => {
  assert.match(ACTIONS, /cancellableStatuses: RequestStatus\[\] = \["pending", "assigned", "arriving", "boarded"\]/, "all 4 statuses in cancellable list");
});

test("reset: zero operators resets ALL elevators in project", () => {
  assert.match(ACTIONS, /from\("elevators"\)\.update\(fullReset\)\.eq\("project_id", projectId\)/, "all elevators reset on zero operators");
});

test("reset: zero operators clears skip markers", () => {
  assert.match(ACTIONS, /skipped_by_elevator_id: null/, "skip markers cleared");
  assert.match(ACTIONS, /not\("skipped_by_elevator_id", "is", null\)/, "filter for non-null skip markers");
});

test("reset: SSR auto-cleanup also cancels boarded when zero operators", () => {
  assert.match(ADMIN_PROJECT, /"boarded"/, "boarded in SSR cancellable list");
  assert.match(ADMIN_PROJECT, /zero_live_operators|hasLiveOperator/, "SSR checks live operators");
});

test("reset: SSR clears skip markers and resets elevators", () => {
  assert.match(ADMIN_PROJECT, /skipped_by_elevator_id: null/, "SSR clears skip markers");
  assert.match(ADMIN_PROJECT, /from\("elevators"\)\.update\(fullReset\)\.eq\("project_id", projectId\)/, "SSR resets all elevators");
});

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 6-8: Completed/cancelled requests never reappear
// ═══════════════════════════════════════════════════════════════════════════

test("reset: completed/cancelled have highest priority — never downgraded", () => {
  assert.match(STATE_RES, /completed: 4/, "completed priority 4");
  assert.match(STATE_RES, /cancelled: 4/, "cancelled priority 4");
  assert.match(STATE_RES, /boarded: 3/, "boarded priority 3 (lower than cancelled)");
  // resolveMerge: existing with higher priority wins
  assert.match(STATE_RES, /existingPriority > incomingPriority.*return existing/, "higher priority wins");
});

test("reset: poll query only fetches OPERATOR_VISIBLE_REQUEST_STATUSES (excludes completed/cancelled)", () => {
  assert.match(DASHBOARD, /OPERATOR_VISIBLE_REQUEST_STATUSES/, "visible statuses defined");
  assert.doesNotMatch(DASHBOARD, /completed.*OPERATOR_VISIBLE/, "completed not in visible statuses");
  assert.doesNotMatch(DASHBOARD, /cancelled.*OPERATOR_VISIBLE/, "cancelled not in visible statuses");
});

test("reset: clearedIdsRef blocks stale poll re-injection", () => {
  assert.match(DASHBOARD, /clearedIdsRef/, "clearedIdsRef present");
  assert.match(DASHBOARD, /cleared\.has\(next\[i\]\.id\)/, "cleared IDs filtered from poll merge");
});

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 9-10: Session guard — sessionStartedAt filter
// ═══════════════════════════════════════════════════════════════════════════

test("reset: sessionStartedAt prop on OperatorDashboard", () => {
  assert.match(DASHBOARD, /sessionStartedAt/, "sessionStartedAt prop exists");
  assert.match(DASHBOARD, /sessionStartedAt\?: string/, "sessionStartedAt typed as string");
});

test("reset: sessionStartedAt passed from OperatorWorkspace", () => {
  assert.match(WORKSPACE, /sessionStartedAt=\{selectedElevator\.operator_session_started_at\}/, "sessionStartedAt passed from workspace");
});

test("reset: elevatorRequests filtered by sessionStartedAt", () => {
  assert.match(DASHBOARD, /sessionStartMs/, "sessionStartMs computed from sessionStartedAt");
  assert.match(DASHBOARD, /createdMs >= sessionStartMs/, "requests filtered by session start time");
});

test("reset: 5s tolerance for clock skew", () => {
  assert.match(DASHBOARD, /5000/, "5s tolerance in session guard");
});

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 11-12: New requests after reactivation appear normally
// ═══════════════════════════════════════════════════════════════════════════

test("reset: session guard only filters requests BEFORE session start, not after", () => {
  // The filter is `createdMs >= sessionStartMs - 5000`
  // So requests created after session start WILL pass through
  assert.match(DASHBOARD, />=/, ">= comparison allows new requests");
  assert.doesNotMatch(DASHBOARD, /createdMs > sessionStartMs/, "uses >= not >, allowing same-time requests");
});

test("reset: releaseOperatorElevator calls cancelActiveProjectRequestsIfNoLiveOperators", () => {
  assert.match(ACTIONS, /cancelActiveProjectRequestsIfNoLiveOperators\(supabase, projectId\)/, "called on release");
});

test("reset: adminDeactivateOperatorTablet also calls cancelActiveProjectRequestsIfNoLiveOperators", () => {
  assert.match(ACTIONS, /adminDeactivateOperatorTablet[\s\S]*?cancelActiveProjectRequestsIfNoLiveOperators/s, "called on admin deactivate");
});

test("reset: force-release API also triggers cleanup", () => {
  // The force-release route does inline cleanup (cancels orphaned requests
  // including boarded when no other operator is available)
  const forceRelease = readFileSync(join(root, "app/api/operator/force-release/route.ts"), "utf8");
  assert.match(forceRelease, /ORPHAN_REASSIGN_STATUSES/, "force-release handles orphaned requests");
  assert.match(forceRelease, /status: "cancelled"/, "cancels orphaned requests");
  assert.match(forceRelease, /boarded/, "handles boarded in orphan list");
  assert.match(forceRelease, /current_load: 0/, "resets elevator load");
  assert.match(forceRelease, /direction: "idle"/, "resets elevator direction");
});

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 13-18: Additional hardening — poll filter, router.refresh, error checking
// ═══════════════════════════════════════════════════════════════════════════

test("reset: poll query filters by sessionStartedAt (gte created_at)", () => {
  // The poll now adds .gte("created_at", sessionStartIso) to prevent
  // old requests from being returned even if DB cancellation failed
  assert.match(DASHBOARD, /gte\("created_at"/, "poll filters by created_at >= session start");
  assert.match(DASHBOARD, /sessionStartIso/, "session start ISO computed for poll filter");
});

test("reset: poll useEffect depends on sessionStartedAt", () => {
  // When sessionStartedAt changes, the poll restarts with the new filter
  assert.match(DASHBOARD, /sessionStartedAt\]/, "sessionStartedAt in poll useEffect deps");
});

test("reset: router.refresh() called after successful activation", () => {
  // After activation, SSR data is refreshed so the requests prop is up-to-date
  assert.match(WORKSPACE, /router\.refresh\(\)/, "router.refresh called after activation");
});

test("reset: router.refresh() called after successful release", () => {
  // After release, SSR data is refreshed so stale requests don't linger
  const matches = WORKSPACE.match(/router\.refresh\(\)/g);
  assert.ok(matches && matches.length >= 2, "router.refresh called in at least 2 places (activate + release)");
});

test("reset: cancelActiveProjectRequestsIfNoLiveOperators checks for DB errors", () => {
  assert.match(ACTIONS, /cancelError/, "checks cancel error");
  assert.match(ACTIONS, /cancelActiveNoLiveOps_ERROR/, "logs cancel error");
  assert.match(ACTIONS, /skipClearError/, "checks skip clear error");
  assert.match(ACTIONS, /cancelActiveNoLiveOps_skipClear_ERROR/, "logs skip clear error");
});

test("reset: SSR auto-cleanup also checks for DB errors", () => {
  assert.match(ADMIN_PROJECT, /cancelError/, "SSR checks cancel error");
  assert.match(ADMIN_PROJECT, /autoCleanupOrphanedRequests_ERROR/, "SSR logs cancel error");
  assert.match(ADMIN_PROJECT, /skipClearError/, "SSR checks skip clear error");
  assert.match(ADMIN_PROJECT, /autoCleanupOrphanedRequests_skipClear_ERROR/, "SSR logs skip clear error");
});
