/**
 * Live app test — bugs found and fixed during final audit.
 *
 * Tests:
 * 1. AppShell showSupport is role-gated (not always true)
 * 2. RequestCard hides Defer/Partial/Cancel buttons for boarded status
 * 3. RequestCard rollback uses ref (not stale closure)
 * 4. Illegal transitions return ok:false (not ok:true)
 * 5. Idempotent transitions (same status) still return ok:true
 * 6. OperatorWorkspace error messages use t() not hardcoded FR
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ═══════════════════════════════════════════════════════════════════
// 1. AppShell showSupport is role-gated
// ═══════════════════════════════════════════════════════════════════

test("live: AppShell showSupport is computed from userRole (not always true)", () => {
  const shell = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
  assert.match(shell, /showSupport.*userRole.*passenger/, "showSupport depends on userRole");
  assert.doesNotMatch(shell, /showSupport={?true}?/, "no hardcoded showSupport={true}");
  assert.doesNotMatch(shell, /showSupport\s*\/>/, "no bare showSupport prop");
});

// ═══════════════════════════════════════════════════════════════════
// 2. RequestCard hides Defer/Partial/Cancel for boarded
// ═══════════════════════════════════════════════════════════════════

test("live: RequestCard hides defer/partial/cancel buttons for boarded status", () => {
  const card = readFileSync(join(root, "components/operator/RequestCard.tsx"), "utf8");
  assert.match(card, /currentStatus !== "boarded"/, "guards against boarded showing defer/cancel");
  // The defer button should NOT be visible for boarded passengers
  // boarded→pending is illegal, so the button must be hidden
});

// ═══════════════════════════════════════════════════════════════════
// 3. RequestCard rollback uses ref
// ═══════════════════════════════════════════════════════════════════

test("live: RequestCard rollback uses preAdvanceStatus ref (not stale closure)", () => {
  const card = readFileSync(join(root, "components/operator/RequestCard.tsx"), "utf8");
  assert.match(card, /useRef/, "uses useRef");
  assert.match(card, /preAdvanceStatus/, "has preAdvanceStatus ref");
  assert.match(card, /preAdvanceStatus\.current/, "rollback uses ref.current");
  assert.doesNotMatch(card, /setCurrentStatus\(request\.status\)/, "no stale request.status in rollback");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Illegal transitions return ok:false
// ═══════════════════════════════════════════════════════════════════

test("live: illegal transitions return ok:false (not ok:true)", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  assert.match(actions, /isLegalTransition[\s\S]{0,300}ok: false/s, "illegal transitions return ok:false");
  assert.doesNotMatch(actions, /ignoree/, "no graceful ignoree message");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Idempotent (same status) still returns ok:true
// ═══════════════════════════════════════════════════════════════════

test("live: idempotent same-status transitions still return ok:true", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  assert.match(actions, /currentStatus === status[\s\S]{0,300}ok: true/s, "same-status returns ok:true");
});

// ═══════════════════════════════════════════════════════════════════
// 6. OperatorWorkspace error messages use t()
// ═══════════════════════════════════════════════════════════════════

test("live: OperatorWorkspace error messages use t() not hardcoded FR", () => {
  const workspace = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.doesNotMatch(workspace, /setMessage\("Impossible d/, "no hardcoded FR error messages");
  assert.match(workspace, /operator\.activateFailed|operator\.releaseFailed/, "uses i18n keys for errors");
});

// ═══════════════════════════════════════════════════════════════════
// 7. RequestCard partial_boarded note uses t() not hardcoded FR
// ═══════════════════════════════════════════════════════════════════

test("live: RequestCard partial_boarded note uses t() not hardcoded FR", () => {
  const card = readFileSync(join(root, "components/operator/RequestCard.tsx"), "utf8");
  assert.doesNotMatch(card, /Prise partielle signalee par l.operateur/, "no hardcoded FR partial board note");
  assert.match(card, /createRequestEvent.*requestCard\.partial/, "uses t() for partial board note");
});
