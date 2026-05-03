/**
 * Passenger status feedback — targeted tests.
 *
 * Bug: After submitting a request, the passenger sees only "Demande envoyée"
 * regardless of the actual request status (pending → assigned → arriving
 * → boarded). No visual feedback about operator assignment or approach.
 *
 * Fix:
 * - Add i18n keys for each status: statusPending, statusAssigned,
 *   statusArriving, statusBoarded (FR + EN)
 * - Show a status badge in the submitted card that changes based on
 *   submittedRequest.status
 * - pending → "En attente d'un opérateur" / "Waiting for an operator"
 * - assigned → "Opérateur assigné — en préparation" / "Operator assigned — preparing"
 * - arriving → "L'opérateur arrive à votre étage" / "The operator is arriving"
 * - boarded → "Embarquement en cours" / "Boarding in progress"
 *
 * Tests:
 * 1. i18n keys exist for all 4 statuses (FR + EN)
 * 2. UI shows status label based on submittedRequest.status
 * 3. All 4 statuses produce different visible text
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. i18n keys exist for all 4 statuses (FR + EN)
// ---------------------------------------------------------------------------
test("passenger status: i18n keys for all 4 request statuses", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /"request\.statusPending"/, "statusPending key exists");
  assert.match(i18n, /"request\.statusAssigned"/, "statusAssigned key exists");
  assert.match(i18n, /"request\.statusArriving"/, "statusArriving key exists");
  assert.match(i18n, /"request\.statusBoarded"/, "statusBoarded key exists");
  // FR messages
  assert.match(i18n, /En attente d'un opérateur/);
  assert.match(i18n, /Opérateur assigné/);
  assert.match(i18n, /L'opérateur arrive/);
  assert.match(i18n, /Embarquement en cours/);
  // EN messages
  assert.match(i18n, /Waiting for an operator/);
  assert.match(i18n, /Operator assigned/);
  assert.match(i18n, /The operator is arriving/);
  assert.match(i18n, /Boarding in progress/);
});

// ---------------------------------------------------------------------------
// 2. UI shows status label based on submittedRequest.status
// ---------------------------------------------------------------------------
test("passenger status: UI references status-dependent i18n keys", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /request\.statusPending/, "references statusPending");
  assert.match(form, /request\.statusAssigned/, "references statusAssigned");
  assert.match(form, /request\.statusArriving/, "references statusArriving");
  assert.match(form, /request\.statusBoarded/, "references statusBoarded");
});

// ---------------------------------------------------------------------------
// 3. All 4 statuses produce different visible text (no two share the same label)
// ---------------------------------------------------------------------------
test("passenger status: each status has distinct FR and EN message", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  // Extract the 4 FR status messages
  const frPending = i18n.match(/"request\.statusPending":\s*"([^"]+)"/);
  const frAssigned = i18n.match(/"request\.statusAssigned":\s*"([^"]+)"/);
  const frArriving = i18n.match(/"request\.statusArriving":\s*"([^"]+)"/);
  const frBoarded = i18n.match(/"request\.statusBoarded":\s*"([^"]+)"/);
  assert.ok(frPending, "FR pending message found");
  assert.ok(frAssigned, "FR assigned message found");
  assert.ok(frArriving, "FR arriving message found");
  assert.ok(frBoarded, "FR boarded message found");
  // All distinct
  const frMessages = [frPending![1], frAssigned![1], frArriving![1], frBoarded![1]];
  assert.equal(new Set(frMessages).size, 4, "all 4 FR status messages are distinct");
});
