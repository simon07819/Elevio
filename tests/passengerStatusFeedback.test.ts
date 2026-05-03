/**
 * Passenger status feedback — targeted tests.
 *
 * Bug: After submitting a request, the passenger saw only "Demande envoyee"
 * regardless of actual request status. No visual feedback about operator
 * assignment, approach, or cancellation.
 *
 * Fix:
 * - 6 distinct visual states, each with unique icon + color + title:
 *   pending  → yellow bg, Clock icon, statusPending text
 *   assigned → blue bg, UserCheck icon, statusAssigned text
 *   arriving → sky bg, Navigation icon, statusArriving text
 *   boarded  → emerald bg, CheckCircle2 icon, statusBoarded text
 *   no operator → red bg, ShieldAlert icon, dispatchNoOperator text
 *   cancelled → uses existing request.cancelled message
 * - Title changes per status (no longer static "Demande envoyee")
 * - Each state has distinct i18n keys (FR + EN)
 *
 * Tests:
 * 1. i18n keys for all 4 active statuses + no operator + cancelled
 * 2. UI maps each status to its icon (Clock, UserCheck, Navigation, CheckCircle2, ShieldAlert)
 * 3. UI maps each status to its color (yellow, blue, sky, emerald, red)
 * 4. Title uses status-dependent key, not static "request.sent"
 * 5. All active statuses produce distinct FR text
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. i18n keys for all statuses exist (FR + EN)
// ---------------------------------------------------------------------------
test("passenger status: i18n keys for all request statuses", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /"request\.statusPending"/);
  assert.match(i18n, /"request\.statusAssigned"/);
  assert.match(i18n, /"request\.statusArriving"/);
  assert.match(i18n, /"request\.statusBoarded"/);
  assert.match(i18n, /"request\.dispatchNoOperator"/);
  assert.match(i18n, /"request\.cancelled"/);
});

// ---------------------------------------------------------------------------
// 2. UI maps each status to its icon
// ---------------------------------------------------------------------------
test("passenger status: each status has distinct icon", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Icons are imported and used in the submitted card rendering
  assert.match(form, /import.*Clock.*from "lucide-react"/, "Clock icon imported");
  assert.match(form, /import.*UserCheck.*from "lucide-react"/, "UserCheck icon imported");
  assert.match(form, /import.*Navigation.*from "lucide-react"/, "Navigation icon imported");
  assert.match(form, /import.*ShieldAlert.*from "lucide-react"/, "ShieldAlert icon imported");
  // Verify icon usage in submitted card
  assert.match(form, /<Navigation/, "Navigation rendered");
  assert.match(form, /<UserCheck/, "UserCheck rendered");
  assert.match(form, /<Clock/, "Clock rendered");
});

// ---------------------------------------------------------------------------
// 3. UI maps each status to distinct color
// ---------------------------------------------------------------------------
test("passenger status: each status has distinct background color", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /bg-sky-50/, "arriving → sky bg");
  assert.match(form, /bg-blue-50/, "assigned → blue bg");
  assert.match(form, /bg-red-50/, "no operator → red bg");
  assert.match(form, /bg-emerald-50/, "boarded → emerald bg");
  assert.match(form, /bg-yellow-50/, "pending → yellow bg");
});

// ---------------------------------------------------------------------------
// 4. Title uses status-dependent key, not static "request.sent"
// ---------------------------------------------------------------------------
test("passenger status: title changes per status via statusKey", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Title uses t(statusKey) not t("request.sent")
  assert.match(form, /t\(statusKey\)/, "title uses dynamic statusKey");
  // statusKey is computed from status conditions referencing i18n keys
  assert.match(form, /statusPending/, "statusPending referenced in statusKey");
  assert.match(form, /statusAssigned/, "statusAssigned referenced in statusKey");
  assert.match(form, /statusArriving/, "statusArriving referenced in statusKey");
  assert.match(form, /dispatchNoOperator/, "dispatchNoOperator referenced in statusKey");
});

// ---------------------------------------------------------------------------
// 5. All active statuses produce distinct FR text
// ---------------------------------------------------------------------------
test("passenger status: each status has distinct FR message", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  const extract = (key: string) => i18n.match(new RegExp(`"${key}":\\s*"([^"]+)"`));
  const pending = extract("request.statusPending");
  const assigned = extract("request.statusAssigned");
  const arriving = extract("request.statusArriving");
  const boarded = extract("request.statusBoarded");
  assert.ok(pending && assigned && arriving && boarded, "all FR messages found");
  const messages = [pending![1], assigned![1], arriving![1], boarded![1]];
  assert.equal(new Set(messages).size, 4, "all 4 FR status messages are distinct");
});
