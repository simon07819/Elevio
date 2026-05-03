/**
 * BUG fixes — admin/operator session cleanup + instant activation + no re-injection.
 *
 * BUG 1 — "Desactiver" does nothing:
 * Root cause: adminDeactivateOperatorTablet cleared session fields but did NOT:
 *   - reset elevator current_load/direction/manual_full
 *   - reassign orphaned requests
 *   - cancel unassignable orphans
 * Fix: same cleanup as releaseOperatorElevator (reassign + cancel + reset elevator state)
 *
 * BUG 2 — "Forcer" + "Actif" keeps old requests:
 * Root cause: completed/cancelled requests re-injected via SSR/realtime/merge
 * Fix: SSR query filters by active statuses; realtime/merge guards skip terminal requests
 *
 * BUG 3 — "Liberer cette tablette" doesn't work / delay:
 * Root cause: handleActivate guard blocked on releasingElevatorId (200ms-2s server call)
 * Fix: guard only checks activatingElevatorId; hasActivatedAfterReleaseRef for safe rollback
 * Also: release success message added; catch uses i18n key
 *
 * Tests:
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ─── BUG 1: adminDeactivateOperatorTablet full cleanup ───

test("admin-cleanup: deactivation resets elevator current_load and direction", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("adminDeactivateOperatorTablet");
  const fn = actions.substring(fnIdx, fnIdx + 2000);
  assert.match(fn, /current_load: 0/, "resets current_load to 0");
  assert.match(fn, /direction: .idle./, "resets direction to idle");
  assert.match(fn, /manual_full: false/, "resets manual_full to false");
});

test("admin-cleanup: deactivation reassigns orphaned requests", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("adminDeactivateOperatorTablet");
  const fn = actions.substring(fnIdx, fnIdx + 3000);
  assert.match(fn, /reassignOrphanedRequestsToActiveOperator/, "reassigns orphaned requests");
});

test("admin-cleanup: deactivation cancels requests when no live operators", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("adminDeactivateOperatorTablet");
  const fn = actions.substring(fnIdx, fnIdx + 3000);
  assert.match(fn, /cancelActiveProjectRequestsIfNoLiveOperators/, "cancels requests when no live operators");
});

test("admin-cleanup: deactivation handles missing manual_full column", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("adminDeactivateOperatorTablet");
  const fn = actions.substring(fnIdx, fnIdx + 2500);
  assert.match(fn, /isMissingElevatorManualFullColumn/, "handles missing manual_full column");
});

// ─── BUG 2: no re-injection of completed/cancelled requests ───

test("no-reinject: SSR query excludes completed/cancelled", () => {
  const admin = readFileSync(join(root, "lib/adminProject.ts"), "utf8");
  const reqIdx = admin.indexOf('.from("requests")');
  const afterReq = admin.substring(reqIdx, reqIdx + 600);
  assert.match(afterReq, /\.in\("status"/, "status filter added");
  assert.match(afterReq, /pending.*assigned.*arriving.*boarded/, "only active statuses included");
});

test("no-reinject: mergeRealtimeRequest skips new terminal requests", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  const fnIdx = rt.indexOf("mergeRealtimeRequest");
  const fn = rt.substring(fnIdx, fnIdx + 600);
  assert.match(fn, /isTerminal/, "checks terminal status");
  assert.match(fn, /!exists && isTerminal/, "skips new terminal requests");
});

test("no-reinject: mergeRequestsPropIntoLive skips terminal from props", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  const fnIdx = rt.indexOf("mergeRequestsPropIntoLive");
  const fn = rt.substring(fnIdx, fnIdx + 800);
  assert.match(fn, /TERMINAL_REQUEST_STATUSES/, "checks terminal status");
  assert.match(fn, /!TERMINAL_REQUEST_STATUSES\.includes\(p\.status\)/, "skips terminal from props");
});

test("no-reinject: mergeServerRequestsWithLive skips terminal from server", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  const fnIdx = rt.indexOf("mergeServerRequestsWithLive");
  const fn = rt.substring(fnIdx, fnIdx + 800);
  assert.match(fn, /TERMINAL_REQUEST_STATUSES/, "checks terminal status");
});

test("no-reinject: dispatchRequests filters terminal statuses", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  const dispatchIdx = dash.indexOf("dispatchRequests: DispatchRequest");
  const afterDispatch = dash.substring(dispatchIdx, dispatchIdx + 400);
  assert.match(afterDispatch, /TERMINAL_REQUEST_STATUSES/, "uses TERMINAL_REQUEST_STATUSES");
  assert.match(afterDispatch, /\.filter\(/, "filters dispatch requests");
});

test("no-reinject: TERMINAL_REQUEST_STATUSES exported from realtime.ts", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  assert.match(rt, /export const TERMINAL_REQUEST_STATUSES/, "constant is exported");
});

// ─── BUG 3: instant activation after release ───

test("instant-activate: handleActivate does NOT guard on releasingElevatorId", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const activateIdx = ws.indexOf("function handleActivate");
  const activateFn = ws.substring(activateIdx, activateIdx + 700);
  const guardMatch = activateFn.match(/if\s*\(\s*activatingElevatorId\s*\)\s*return/);
  assert.ok(guardMatch, "guard checks only activatingElevatorId");
  assert.doesNotMatch(guardMatch[0], /releasingElevatorId/, "guard does NOT check releasingElevatorId");
});

test("instant-activate: hasActivatedAfterReleaseRef exists", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /hasActivatedAfterReleaseRef/, "ref exists");
  assert.match(ws, /hasActivatedAfterReleaseRef\.current = true/, "set in handleActivate");
  assert.match(ws, /hasActivatedAfterReleaseRef\.current = false/, "reset in release");
});

test("instant-activate: release shows success message", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx, releaseIdx + 4000);
  assert.match(releaseFn, /operator\.releaseSuccess/, "shows releaseSuccess on success");
});

test("instant-activate: release failure rollback checks ref", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx, releaseIdx + 4000);
  const refChecks = releaseFn.match(/hasActivatedAfterReleaseRef\.current/g) ?? [];
  assert.ok(refChecks.length >= 2, "ref checked in both failure paths");
});

test("instant-activate: catch block uses i18n releaseFailed key", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const releaseIdx = ws.indexOf("function release()");
  const releaseFn = ws.substring(releaseIdx, releaseIdx + 5000);
  const catchIdx = releaseFn.indexOf("} catch");
  const catchBlock = releaseFn.substring(catchIdx, catchIdx + 800);
  assert.match(catchBlock, /operator\.releaseFailed/, "uses i18n key for failure message");
});
