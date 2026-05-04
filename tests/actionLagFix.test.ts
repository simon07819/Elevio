/**
 * Action lag fix — Ramasser instant (optimistic UI).
 *
 * Verifies that the Ramasser (pickup) button:
 * - Updates UI immediately (optimistic) — no spinner
 * - Server call is fire-and-forget with timeout
 * - onPickupFailure provides rollback on error/timeout
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
  // In pickup(), onPickupSuccess must appear BEFORE the server call
  const pickupFn = RECOMMENDED.match(/function pickup\(\) \{[\s\S]*?^  \}/m)?.[0] ?? "";
  assert.match(pickupFn, /onPickupSuccess/, "onPickupSuccess is called in pickup");
  const successPos = pickupFn.indexOf("onPickupSuccess");
  const serverPos = pickupFn.indexOf("advanceRequestStatus");
  assert.ok(successPos < serverPos, "onPickupSuccess fires before advanceRequestStatus");
});

// ---------------------------------------------------------------------------
// 3. Server call uses withTimeout (3s) — fire-and-forget
// ---------------------------------------------------------------------------
test("action lag: advanceRequestStatus wrapped in withTimeout", () => {
  assert.match(RECOMMENDED, /void withTimeout\(/, "fire-and-forget with timeout");
  assert.match(RECOMMENDED, /SERVER_ACTION_TIMEOUT_MS/, "timeout constant used");
  assert.match(RECOMMENDED, /SERVER_ACTION_TIMEOUT_MS = 3_000/, "3 second timeout");
});

// ---------------------------------------------------------------------------
// 4. Timeout error triggers onPickupFailure (rollback)
// ---------------------------------------------------------------------------
test("action lag: timeout and server errors trigger onPickupFailure", () => {
  assert.match(RECOMMENDED, /onPickupFailure\?\.\(targetRequest\)/, "onPickupFailure on server error");
  // Timeout-specific error message
  assert.match(RECOMMENDED, /Le serveur ne repond pas/, "specific timeout error message");
});

// ---------------------------------------------------------------------------
// 5. Performance log: pickup click → UI update
// ---------------------------------------------------------------------------
test("action lag: performance log measures pickup click → UI update", () => {
  assert.match(RECOMMENDED, /pickupClickTimeRef/, "click time ref");
  assert.match(RECOMMENDED, /performance\.now\(\)/, "performance.now used");
  assert.match(RECOMMENDED, /pickup_click_to_ui/, "specific performance event name");
  assert.match(RECOMMENDED, /target: "<200ms"/, "200ms target logged");
});

// ---------------------------------------------------------------------------
// 6. SLOW performance warning
// ---------------------------------------------------------------------------
test("action lag: SLOW warning when pickup UI update >200ms", () => {
  assert.match(RECOMMENDED, /uiUpdateMs > 200/, ">200ms threshold");
  assert.match(RECOMMENDED, /pickup click → UI update SLOW/, "SLOW console.warn");
});

// ---------------------------------------------------------------------------
// 7. Server action fast-path for boarded/completed
// ---------------------------------------------------------------------------
test("action lag: updateRequestStatus returns fast for boarded/completed", () => {
  assert.match(ACTIONS, /isFastPath = status === "boarded" \|\| status === "completed"/, "fast path for boarded/completed");
  assert.match(ACTIONS, /void \(async \(\) => \{/, "background tasks fire-and-forget");
  assert.match(ACTIONS, /return \{ ok: true, message: "Statut mis a jour\." \}/, "returns before background tasks");
});

// ---------------------------------------------------------------------------
// 8. Background tasks still execute (syncElevator, insertEvent, revalidate)
// ---------------------------------------------------------------------------
test("action lag: background tasks still run after fast return", () => {
  // In the fast-path block, syncElevator, insertEvent, revalidate must still happen
  const fastPathBlock = ACTIONS.match(/const isFastPath[\s\S]*?return \{ ok: true[\s\S]*?message: "Statut mis a jour\." \};/)?.[0] ?? "";
  assert.match(fastPathBlock, /syncElevatorWithRequestStatus/, "syncElevator still runs in background");
  assert.match(fastPathBlock, /request_events.*insert/, "insertEvent still runs in background");
  assert.match(fastPathBlock, /revalidatePath/, "revalidatePath still runs in background");
});

// ---------------------------------------------------------------------------
// 9. Combined button also uses optimistic pickup (no spinner)
// ---------------------------------------------------------------------------
test("action lag: combined button uses instant optimistic pickup", () => {
  // In dropoffAndPickup, pickup is also optimistic
  const combinedFn = RECOMMENDED.match(/function dropoffAndPickup\(\) \{[\s\S]*?^  \}/m)?.[0] ?? "";
  assert.match(combinedFn, /onPickupSuccess/, "onPickupSuccess in combined");
  assert.match(combinedFn, /withTimeout/, "combined pickup also uses withTimeout");
});

// ---------------------------------------------------------------------------
// 10. isActionPending only for dropoff (not pickup)
// ---------------------------------------------------------------------------
test("action lag: isActionPending only checks dropoff, not pickup", () => {
  assert.match(RECOMMENDED, /isActionPending = pendingDropoffIds\.size > 0/, "isActionPending = dropoff only");
});

// ---------------------------------------------------------------------------
// 11. No "En cours..." spinner for pickup button
// ---------------------------------------------------------------------------
test("action lag: pickup button has no spinner state", () => {
  // The pickup button should NOT show Loader2 for pickup-specific pending
  // (the isActionPending now only covers dropoff, and showPickup only shows
  // when there's no dropoff, so isActionPending will be false for pickup)
  assert.doesNotMatch(RECOMMENDED, /pendingPickupIds/, "no pendingPickupIds — no pickup spinner");
});

// ---------------------------------------------------------------------------
// 12. Rollback on server failure restores previous state
// ---------------------------------------------------------------------------
test("action lag: onPickupFailure callback exists for rollback", () => {
  assert.match(RECOMMENDED, /onPickupFailure\?:\s*\(request: EnrichedRequest\) => void/, "onPickupFailure prop type");
});
