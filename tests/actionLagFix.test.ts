/**
 * Action lag fix — Ramasser instant (optimistic UI) + no false timeout rollback.
 *
 * Verifies that the Ramasser (pickup) button:
 * - Updates UI immediately (optimistic) — no spinner
 * - Server call is fire-and-forget (NO timeout wrapper)
 * - onPickupFailure provides rollback ONLY on real server error
 * - NEVER rollback on slow server / network delay
 * - Performance logging for pickup click → UI update
 * - Server action returns fast for boarded/completed status
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");

// ---------------------------------------------------------------------------
// 1. No pendingPickupIds state — pickup is instant, no spinner
// ---------------------------------------------------------------------------
test("action lag: no pendingPickupIds state variable", () => {
  assert.doesNotMatch(RECOMMENDED, /pendingPickupIds/, "pendingPickupIds removed — no pickup spinner");
});

// ---------------------------------------------------------------------------
// 2. Pickup calls onPickupSuccess BEFORE server call
// ---------------------------------------------------------------------------
test("action lag: onPickupSuccess fires before advanceRequestStatus", () => {
  const pickupFn = RECOMMENDED.match(/function pickup\(\) \{[\s\S]*?^  \}/m)?.[0] ?? "";
  assert.match(pickupFn, /onPickupSuccess/, "onPickupSuccess is called in pickup");
  const successPos = pickupFn.indexOf("onPickupSuccess");
  const serverPos = pickupFn.indexOf("advanceRequestStatus");
  assert.ok(successPos < serverPos, "onPickupSuccess fires before advanceRequestStatus");
});

// ---------------------------------------------------------------------------
// 3. No withTimeout — server call is pure fire-and-forget
// ---------------------------------------------------------------------------
test("action lag: no withTimeout wrapper on pickup server call", () => {
  assert.doesNotMatch(RECOMMENDED, /withTimeout/, "withTimeout removed — no false timeout rollback");
  assert.doesNotMatch(RECOMMENDED, /SERVER_ACTION_TIMEOUT_MS/, "timeout constant removed");
});

// ---------------------------------------------------------------------------
// 4. Rollback ONLY on real server error (ok: false) or real exception
// ---------------------------------------------------------------------------
test("action lag: onPickupFailure only on real server error, never on slow response", () => {
  assert.match(RECOMMENDED, /onPickupFailure\?\.\(targetRequest\)/, "onPickupFailure on server error");
  // No timeout-specific error message — that was the false rollback
  assert.doesNotMatch(RECOMMENDED, /Le serveur ne repond pas/, "timeout error message removed");
  // Only rollback on: result.ok === false OR catch (real exception)
  assert.match(RECOMMENDED, /if \(result\.ok\)/, "checks result.ok for success vs failure");
  assert.match(RECOMMENDED, /\.catch\(/, "catch for real exceptions only");
});

// ---------------------------------------------------------------------------
// 5. Optimistic state stays visible even when server is slow
// ---------------------------------------------------------------------------
test("action lag: optimistic boarded stays visible — no rollback on delay", () => {
  // pickup_optimistic_success log confirms the optimistic state
  assert.match(RECOMMENDED, /pickup_optimistic_success/, "optimistic success log");
  // pickup_server_confirmed log when server finally confirms
  assert.match(RECOMMENDED, /pickup_server_confirmed/, "server confirmed log");
  // pickup_server_error log ONLY when server says ok: false
  assert.match(RECOMMENDED, /pickup_server_error/, "server error log");
  // pickup_exception log ONLY on real exception (network down)
  assert.match(RECOMMENDED, /pickup_exception/, "exception log");
});

// ---------------------------------------------------------------------------
// 6. Performance log: pickup click → UI update
// ---------------------------------------------------------------------------
test("action lag: performance log measures pickup click → UI update", () => {
  assert.match(RECOMMENDED, /pickupClickTimeRef/, "click time ref");
  assert.match(RECOMMENDED, /performance\.now\(\)/, "performance.now used");
  assert.match(RECOMMENDED, /pickup_click_to_ui/, "specific performance event name");
  assert.match(RECOMMENDED, /target: "<200ms"/, "200ms target logged");
});

// ---------------------------------------------------------------------------
// 7. SLOW performance warning
// ---------------------------------------------------------------------------
test("action lag: SLOW warning when pickup UI update >200ms", () => {
  assert.match(RECOMMENDED, /uiUpdateMs > 200/, ">200ms threshold");
  assert.match(RECOMMENDED, /pickup click → UI update SLOW/, "SLOW console.warn");
});

// ---------------------------------------------------------------------------
// 8. Server action fast-path for boarded/completed
// ---------------------------------------------------------------------------
test("action lag: updateRequestStatus returns fast for boarded/completed", () => {
  assert.match(ACTIONS, /isFastPath = status === "boarded" \|\| status === "completed"/, "fast path for boarded/completed");
  assert.match(ACTIONS, /void \(async \(\) => \{/, "background tasks fire-and-forget");
  assert.match(ACTIONS, /return \{ ok: true, message: "Statut mis a jour\." \}/, "returns before background tasks");
});

// ---------------------------------------------------------------------------
// 9. Background tasks still execute (syncElevator, insertEvent, revalidate)
// ---------------------------------------------------------------------------
test("action lag: background tasks still run after fast return", () => {
  const fastPathBlock = ACTIONS.match(/const isFastPath[\s\S]*?return \{ ok: true[\s\S]*?message: "Statut mis a jour\." \};/)?.[0] ?? "";
  assert.match(fastPathBlock, /syncElevatorWithRequestStatus/, "syncElevator still runs in background");
  assert.match(fastPathBlock, /request_events.*insert/, "insertEvent still runs in background");
  assert.match(fastPathBlock, /revalidatePath/, "revalidatePath still runs in background");
});

// ---------------------------------------------------------------------------
// 10. Combined button uses atomic server action with optimistic pickup
// ---------------------------------------------------------------------------
test("action lag: combined button uses atomic action and instant optimistic pickup", () => {
  // The combined action MUST run optimistic UI before the server call.
  const runCombined = RECOMMENDED.match(/function runCombined\([\s\S]*?^  \}/m)?.[0] ?? "";
  assert.match(runCombined, /onPickupSuccess/, "onPickupSuccess in combined helper");
  assert.match(runCombined, /onDropoffSuccess/, "onDropoffSuccess in combined helper");
  assert.match(runCombined, /applyCombinedOperatorAction/, "uses atomic server action");
  assert.doesNotMatch(runCombined, /withTimeout/, "no withTimeout in combined");
});

// ---------------------------------------------------------------------------
// 11. isActionPending only for dropoff (not pickup)
// ---------------------------------------------------------------------------
test("action lag: isActionPending only checks dropoff, not pickup", () => {
  assert.match(RECOMMENDED, /isActionPending = pendingDropoffIds\.size > 0/, "isActionPending = dropoff only");
});

// ---------------------------------------------------------------------------
// 12. No "En cours..." spinner for pickup button
// ---------------------------------------------------------------------------
test("action lag: pickup button has no spinner state", () => {
  assert.doesNotMatch(RECOMMENDED, /pendingPickupIds/, "no pendingPickupIds — no pickup spinner");
});

// ---------------------------------------------------------------------------
// 13. onPickupFailure callback exists for rollback on real error
// ---------------------------------------------------------------------------
test("action lag: onPickupFailure callback exists for real error rollback", () => {
  assert.match(RECOMMENDED, /onPickupFailure\?:\s*\(request: EnrichedRequest\) => void/, "onPickupFailure prop type");
});
