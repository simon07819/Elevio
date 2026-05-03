/**
 * Network resilience — targeted tests.
 *
 * Bug: When the network drops, passengers and operators get stuck:
 * - No visual feedback about connectivity
 * - Destructive actions (cancel, submit) proceed offline and fail silently
 * - No automatic retry for polling
 *
 * Fix:
 * - useNetworkStatus hook: tracks navigator.onLine + online/offline events
 * - i18n key "common.unstableConnection" (FR + EN)
 * - Passenger: amber banner when offline; submit + cancel disabled offline
 * - Operator: amber banner when offline; existing catch handlers remain
 * - Polling continues (will auto-recover when online returns)
 *
 * Tests:
 * 1. useNetworkStatus hook exists and exports online boolean
 * 2. i18n key for unstable connection (FR + EN)
 * 3. Passenger: submit and cancel disabled when offline
 * 4. Passenger: amber banner visible when offline
 * 5. Operator: amber banner visible when offline
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. useNetworkStatus hook exists and uses navigator.onLine
// ---------------------------------------------------------------------------
test("network: useNetworkStatus hook tracks navigator.onLine", () => {
  const hook = readFileSync(join(root, "lib/useNetworkStatus.ts"), "utf8");
  assert.match(hook, /navigator\.onLine/, "reads navigator.onLine");
  assert.match(hook, /addEventListener.*online/, "listens for online event");
  assert.match(hook, /addEventListener.*offline/, "listens for offline event");
  assert.match(hook, /export function useNetworkStatus/, "exports hook");
});

// ---------------------------------------------------------------------------
// 2. i18n key for unstable connection (FR + EN)
// ---------------------------------------------------------------------------
test("network: unstableConnection i18n key exists FR + EN", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /"common\.unstableConnection"/, "key exists");
  assert.match(i18n, /Connexion instable/, "FR message");
  assert.match(i18n, /Unstable connection/, "EN message");
});

// ---------------------------------------------------------------------------
// 3. Passenger: submit and cancel disabled when offline
// ---------------------------------------------------------------------------
test("network: passenger submit and cancel disabled when offline", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Submit button disabled when !isOnline
  assert.match(form, /disabled=\{[^}]*!isOnline/, "submit disabled when offline");
  // Cancel disabled when !isOnline
  assert.match(form, /isOnline.*submittedRequest\.status.*boarded/, "cancel guarded by isOnline");
});

// ---------------------------------------------------------------------------
// 4. Passenger: amber banner visible when offline
// ---------------------------------------------------------------------------
test("network: passenger shows amber banner when offline", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /!isOnline/, "offline condition exists");
  assert.match(form, /unstableConnection/, "references i18n key");
  assert.match(form, /bg-amber-50/, "amber background");
  // Banner renders conditionally in both submitted and non-submitted views
  const count = (form.match(/!isOnline &&/g) || []).length;
  assert.ok(count >= 2, "banner in at least 2 views (submitted + form)");
});

// ---------------------------------------------------------------------------
// 5. Operator: amber banner visible when offline
// ---------------------------------------------------------------------------
test("network: operator shows amber banner when offline", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dashboard, /useNetworkStatus/, "hook imported and used");
  assert.match(dashboard, /!isOnline/, "offline condition used");
  assert.match(dashboard, /unstableConnection/, "references i18n key");
  assert.match(dashboard, /bg-amber-500/, "amber background in operator banner");
});
