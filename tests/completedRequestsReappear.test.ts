/**
 * BUG fix — completed requests reappear after operator refresh.
 *
 * Root causes (3 injection paths):
 * 1. SSR prop `requests` from getAdminProjectData had NO status filter → completed included
 * 2. mergeRealtimeRequest inserted new terminal requests from Realtime events
 * 3. mergeRequestsPropIntoLive injected new terminal requests from SSR props
 * 4. dispatchRequests fed completed requests to the brain
 *
 * Fixes:
 * 1. getAdminProjectData: .in("status", ["pending","assigned","arriving","boarded"])
 * 2. mergeRealtimeRequest: skip new terminal requests not already tracked locally
 * 3. mergeRequestsPropIntoLive: skip new terminal requests from props
 * 4. mergeServerRequestsWithLive: skip new terminal requests from server
 * 5. OperatorDashboard dispatchRequests: filter out TERMINAL_REQUEST_STATUSES
 * 6. TERMINAL_REQUEST_STATUSES exported from realtime.ts
 *
 * Tests:
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("completed-reappear: SSR query excludes completed/cancelled requests", () => {
  const admin = readFileSync(join(root, "lib/adminProject.ts"), "utf8");
  const requestQueryIdx = admin.indexOf('.from("requests")');
  const afterQuery = admin.substring(requestQueryIdx, requestQueryIdx + 600);
  assert.match(afterQuery, /\.in\("status"/, "status filter added to requests query");
  assert.match(afterQuery, /pending.*assigned.*arriving.*boarded|boarded.*arriving.*assigned.*pending/, "only active statuses included");
  assert.doesNotMatch(afterQuery.match(/\.in\("status",\s*\[[^\]]*\]\)/)?.[0] ?? "", /completed|cancelled/, "completed/cancelled excluded from SSR query");
});

test("completed-reappear: mergeRealtimeRequest skips new terminal requests", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  const fnIdx = rt.indexOf("mergeRealtimeRequest");
  const fnBody = rt.substring(fnIdx, fnIdx + 800);
  assert.match(fnBody, /isTerminal/, "isTerminal variable exists");
  assert.match(fnBody, /!exists && isTerminal/, "skips when not exists AND isTerminal");
  assert.match(fnBody, /return current/, "returns current unchanged");
});

test("completed-reappear: mergeRequestsPropIntoLive skips new terminal requests from props", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  const fnIdx = rt.indexOf("mergeRequestsPropIntoLive");
  const fnBody = rt.substring(fnIdx, fnIdx + 800);
  assert.match(fnBody, /TERMINAL_REQUEST_STATUSES/, "checks terminal status");
  assert.match(fnBody, /!TERMINAL_REQUEST_STATUSES\.includes\(p\.status\)/, "skips new terminal requests from props");
});

test("completed-reappear: mergeServerRequestsWithLive skips new terminal requests", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  const fnIdx = rt.indexOf("mergeServerRequestsWithLive");
  const fnBody = rt.substring(fnIdx, fnIdx + 800);
  assert.match(fnBody, /TERMINAL_REQUEST_STATUSES/, "checks terminal status");
  assert.match(fnBody, /!previous\.some.*TERMINAL_REQUEST_STATUSES/, "skips new terminal from server data");
});

test("completed-reappear: OperatorDashboard dispatchRequests filters terminal statuses", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  const dispatchIdx = dash.indexOf("dispatchRequests: DispatchRequest");
  const afterDispatch = dash.substring(dispatchIdx, dispatchIdx + 400);
  assert.match(afterDispatch, /TERMINAL_REQUEST_STATUSES/, "uses TERMINAL_REQUEST_STATUSES");
  assert.match(afterDispatch, /\.filter\(/, "filters dispatch requests");
  assert.match(afterDispatch, /!TERMINAL_REQUEST_STATUSES\.includes/, "excludes terminal statuses");
});

test("completed-reappear: TERMINAL_REQUEST_STATUSES is exported from realtime.ts", () => {
  const rt = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  assert.match(rt, /export const TERMINAL_REQUEST_STATUSES/, "constant is exported");
  assert.match(rt, /completed.*cancelled|cancelled.*completed/, "includes completed and cancelled");
});

test("completed-reappear: OperatorDashboard imports TERMINAL_REQUEST_STATUSES", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // Import may span multiple lines; just check both exist in the file
  assert.match(dash, /TERMINAL_REQUEST_STATUSES/, "constant name present in file");
  assert.match(dash, /from.*realtime/, "import from realtime module");
  // Verify it's imported, not just used inline
  const importBlock = dash.substring(0, dash.indexOf("const directionKeys"));
  assert.match(importBlock, /TERMINAL_REQUEST_STATUSES/, "TERMINAL_REQUEST_STATUSES is imported near top of file");
});

test("completed-reappear: syncRequests poll still uses OPERATOR_VISIBLE_REQUEST_STATUSES filter", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /\.in\("status", OPERATOR_VISIBLE_REQUEST_STATUSES\)/, "poll still filters by visible statuses");
});
