/**
 * Network resilience — targeted tests.
 *
 * Bug: When the network drops, passengers and operators are stuck:
 * no feedback, destructive actions (cancel, submit) proceed and
 * fail silently, no automatic recovery when connection returns.
 *
 * Fix:
 * - useNetworkStatus hook: tracks navigator.onLine + online/offline
 *   events, calls onBackOnline callback for immediate refresh
 * - i18n keys common.offline + common.offlineAction (FR + EN)
 * - Passenger: amber banner when offline; submit + cancel disabled
 * - Operator: amber banner when offline
 * - Polling/realtime continue and auto-recover when online returns
 * - No destructive action allowed while offline
 *
 * Tests:
 * 1. useNetworkStatus hook tracks navigator.onLine + events
 * 2. i18n keys for offline messages (FR + EN)
 * 3. Passenger submit and cancel disabled when offline
 * 4. Operator shows offline banner
 * 5. onBackOnline callback triggers router.refresh
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. useNetworkStatus hook tracks navigator.onLine + events + onBackOnline
// ---------------------------------------------------------------------------
test("network: hook tracks navigator.onLine, events, onBackOnline callback", () => {
  const hook = readFileSync(join(root, "lib/useNetworkStatus.ts"), "utf8");
  assert.match(hook, /navigator\.onLine/, "reads navigator.onLine");
  assert.match(hook, /addEventListener.*"online"/, "listens for online event");
  assert.match(hook, /addEventListener.*"offline"/, "listens for offline event");
  assert.match(hook, /onBackOnline/, "onBackOnline callback parameter");
  assert.match(hook, /wasOffline/, "tracks offline→online transition");
});

// ---------------------------------------------------------------------------
// 2. i18n keys for offline messages (FR + EN)
// ---------------------------------------------------------------------------
test("network: offline i18n keys exist FR + EN", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /"common\.offline"/, "key exists");
  assert.match(i18n, /Connexion instable/, "FR message");
  assert.match(i18n, /Unstable connection/, "EN message");
  assert.match(i18n, /"common\.offlineAction"/, "offlineAction key exists");
  assert.match(i18n, /Action impossible hors ligne/, "FR action message");
  assert.match(i18n, /Action not available offline/, "EN action message");
});

// ---------------------------------------------------------------------------
// 3. Passenger submit and cancel disabled when offline
// ---------------------------------------------------------------------------
test("network: passenger submit and cancel disabled when offline", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Submit button disabled when !isOnline
  assert.match(form, /disabled=\{[^}]*!isOnline/, "submit disabled when offline");
  // Cancel guarded by isOnline
  assert.match(form, /isOnline.*submittedRequest\.status.*boarded/, "cancel guarded by isOnline");
});

// ---------------------------------------------------------------------------
// 4. Operator shows offline banner
// ---------------------------------------------------------------------------
test("network: operator shows amber offline banner", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /useNetworkStatus/, "hook imported and used");
  assert.match(dash, /!isOnline/, "offline condition");
  assert.match(dash, /common\.offline/, "references i18n key");
  assert.match(dash, /bg-amber-500/, "amber background");
});

// ---------------------------------------------------------------------------
// 5. onBackOnline callback triggers router.refresh (no duplicate requests)
// ---------------------------------------------------------------------------
test("network: onBackOnline calls router.refresh, no duplicate submission risk", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // The hook is called with a callback containing router.refresh
  assert.match(form, /useNetworkStatus/, "hook called");
  assert.match(form, /router\.refresh/, "router.refresh used in onBackOnline callback");
  // Submit button is disabled while submitting (prevents duplicate on retry)
  assert.match(form, /isSubmittingRequest/, "submit guarded by isSubmittingRequest");
  // Cancel is guarded by isCancellingRequest
  assert.match(form, /isCancellingRequest/, "cancel guarded by isCancellingRequest");
});
