/**
 * Passenger status clarity — targeted tests.
 *
 * Bug: After submitting a request, the passenger sees only
 * "Demande envoyee" regardless of actual request status.
 * No visual feedback about operator assignment, approach,
 * boarding, cancellation, or no-operator situations.
 *
 * Fix:
 * - 5 i18n keys for active statuses (pending, assigned,
 *   arriving, boarded, cancelled) — FR + EN
 * - Title changes per status (no longer static "Demande envoyee")
 * - Distinct icon per status (Clock, UserCheck, Navigation,
 *   CheckCircle2, ShieldAlert)
 * - Distinct color per status (yellow, blue, sky, emerald, red)
 * - Cancelled state shows specific message + allows new request
 *
 * Tests:
 * 1. i18n keys for all 5 statuses exist (FR + EN)
 * 2. Title changes per status (references status-dependent keys)
 * 3. Each status has distinct icon imported
 * 4. Each status has distinct background color
 * 5. Cancelled state + no-operator state both show specific text
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. i18n keys for all 5 statuses exist (FR + EN)
// ---------------------------------------------------------------------------
test("passenger-clarity: i18n keys for pending, assigned, arriving, boarded, cancelled", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /"request\.statusPending"/);
  assert.match(i18n, /"request\.statusAssigned"/);
  assert.match(i18n, /"request\.statusArriving"/);
  assert.match(i18n, /"request\.statusBoarded"/);
  assert.match(i18n, /"request\.statusCancelled"/);
  // FR messages
  assert.match(i18n, /En attente d'un opérateur/);
  assert.match(i18n, /Opérateur assigné/);
  assert.match(i18n, /L'opérateur arrive/);
  assert.match(i18n, /Embarqué/);
  // EN messages
  assert.match(i18n, /Waiting for an operator/);
  assert.match(i18n, /Operator assigned/);
  assert.match(i18n, /The operator is arriving/);
  assert.match(i18n, /Boarded/);
});

// ---------------------------------------------------------------------------
// 2. Title changes per status (references status-dependent keys)
// ---------------------------------------------------------------------------
test("passenger-clarity: title references status-dependent i18n keys", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /request\.statusPending/, "pending key used");
  assert.match(form, /request\.statusAssigned/, "assigned key used");
  assert.match(form, /request\.statusArriving/, "arriving key used");
  assert.match(form, /request\.statusBoarded/, "boarded key used");
  assert.match(form, /request\.statusCancelled/, "cancelled key used");
});

// ---------------------------------------------------------------------------
// 3. Each status has distinct icon imported
// ---------------------------------------------------------------------------
test("passenger-clarity: distinct icons per status", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /import.*Clock.*from "lucide-react"/, "Clock icon imported");
  assert.match(form, /import.*UserCheck.*from "lucide-react"/, "UserCheck icon imported");
  assert.match(form, /import.*Navigation.*from "lucide-react"/, "Navigation icon imported");
  assert.match(form, /<Clock/, "Clock rendered for pending");
  assert.match(form, /<UserCheck/, "UserCheck rendered for assigned");
  assert.match(form, /<Navigation/, "Navigation rendered for arriving");
});

// ---------------------------------------------------------------------------
// 4. Each status has distinct background color
// ---------------------------------------------------------------------------
test("passenger-clarity: distinct background color per status", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /bg-yellow-50/, "pending → yellow");
  assert.match(form, /bg-blue-50/, "assigned → blue");
  assert.match(form, /bg-sky-50/, "arriving → sky");
  assert.match(form, /bg-emerald-50/, "boarded → emerald");
  assert.match(form, /bg-red-50/, "no operator → red");
});

// ---------------------------------------------------------------------------
// 5. Cancelled + no-operator states show specific text
// ---------------------------------------------------------------------------
test("passenger-clarity: cancelled and no-operator show specific messages", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /request\.statusCancelled/, "cancelled key in title");
  assert.match(form, /request\.dispatchNoOperator/, "no-operator key in title");
  assert.match(form, /request\.cancelled/, "cancelled i18n key also exists (reset message)");
});
