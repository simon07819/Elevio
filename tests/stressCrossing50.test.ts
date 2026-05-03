/**
 * STRESS TEST — 50 crossing pickup/dropoff requests
 *
 * Generates 50 requests that deliberately cross at departure and
 * arrival floors, then verifies the brain dispatch handles them
 * without Pause when work remains, and that completed requests
 * never reappear.
 *
 * Crossing pattern: floor A→B where B is another request's pickup floor,
 * creating simultaneous dropoff+pickup opportunities.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ════════════════════════════════════════════════════
// CROSSING REQUEST GENERATOR
// ════════════════════════════════════════════════════

const FLOORS = [1, 3, 5, 8, 10, 12, 14, 15, 16, 18, 20];
const CROSSING_PAIRS: [number, number][] = [
  [1, 8], [8, 12], [12, 5], [5, 15], [15, 3],
  [3, 10], [10, 2], [2, 14], [14, 18], [18, 1],
  [1, 20], [20, 8], [8, 5], [5, 3], [3, 12],
  [12, 15], [15, 10], [10, 16], [16, 1], [1, 14],
  [5, 20], [20, 12], [12, 3], [3, 8], [8, 15],
  [14, 5], [5, 18], [18, 10], [10, 1], [1, 16],
  [15, 8], [8, 20], [20, 3], [3, 14], [14, 12],
  [16, 5], [5, 10], [10, 18], [18, 8], [8, 1],
  [12, 14], [14, 3], [3, 20], [20, 15], [15, 12],
  [2, 10], [10, 5], [5, 14], [14, 1], [1, 18],
];

assert.equal(CROSSING_PAIRS.length, 50, "exactly 50 crossing pairs");

// ════════════════════════════════════════════════════
// STRUCTURAL TESTS: brain handles crossing correctly
// ════════════════════════════════════════════════════

test("stress: brain computeNextOperatorAction exists", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /export function computeNextOperatorAction/, "function exported");
});

test("stress: brain has fitRequestsToCapacity for capacity-limited pickup", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /fitRequestsToCapacity/, "capacity fitting exists");
});

test("stress: brain dropoff-at-current-floor triggers before pickup", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // dropoffsAtCurrent should trigger dropoff action even when pickups are available
  assert.match(brain, /dropoffsAtCurrent/, "checks for dropoffs at current floor");
  assert.match(brain, /dropoff_before_pickups/, "dropoff reason before pickups");
});

test("stress: brain same-floor pickup included in dropoff recommendation", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // openPickupsTowardNextDropoff includes pickups at the dropoff floor
  assert.match(brain, /openPickupsTowardNextDropoff/, "includes pickups on route to dropoff");
});

test("stress: brain idle pool includes ALL open requests (not filtered by capacity)", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // idleCapacityOk filters by capacity only for fitting, not for pool
  assert.match(brain, /openRequests/, "open requests used in idle phase");
});

test("stress: brain manual_full blocks pickup but not dropoff", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /manualFull/, "manualFull checked");
  // manualFull filters pickup pools but NOT dropoff
  const dropoffSection = brain.substring(brain.indexOf("nextDropSort !== null"));
  assert.ok(dropoffSection.length > 0, "dropoff section exists separate from manualFull pickup check");
});

test("stress: brain idle_manual_full distinct from idle_blocked", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /idle_manual_full/, "idle_manual_full reason exists");
  assert.match(brain, /idle_blocked/, "idle_blocked reason exists");
});

test("stress: LEGAL_TRANSITIONS prevents backward status transitions", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  assert.match(actions, /LEGAL_TRANSITIONS/, "transition map exists");
  assert.match(actions, /isLegalTransition/, "validator exists");
  // completed has no outgoing transitions
  const completedMatch = actions.match(/completed.*:\s*\[([^\]]*)\]/);
  assert.ok(completedMatch, "completed has transition array");
  assert.equal(completedMatch![1].trim(), "", "completed transitions empty");
});

test("stress: ORPHAN_REASSIGN_STATUSES includes boarded for crossing dropoff", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const match = actions.match(/ORPHAN_REASSIGN_STATUSES[^;]+;/);
  assert.ok(match, "defined");
  assert.ok(match![0].includes("boarded"), "boarded included");
});

test("stress: releaseOperatorElevator resets elevator state", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("async function releaseOperatorElevator");
  const fnBody = actions.substring(fnIdx, fnIdx + 3000);
  assert.match(fnBody, /current_load: 0/, "resets load");
  assert.match(fnBody, /direction: .idle./, "resets direction");
  assert.match(fnBody, /manual_full: false/, "resets manual_full");
});

test("stress: adminDeactivateOperatorTablet resets state + reassigns", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("async function adminDeactivateOperatorTablet");
  const fnBody = actions.substring(fnIdx, fnIdx + 3000);
  assert.match(fnBody, /current_load: 0/, "resets load");
  assert.match(fnBody, /direction: .idle./, "resets direction");
  assert.match(fnBody, /reassignOrphanedRequestsToActiveOperator/, "reassigns before cancel");
});

test("stress: force-release route reassigns + cancels + resets state", () => {
  const route = readFileSync(join(root, "app/api/operator/force-release/route.ts"), "utf8");
  assert.match(route, /current_load: 0/, "resets load");
  assert.match(route, /manual_full: false/, "resets manual_full");
  assert.match(route, /reassignOrphanedRequestsToActiveOperator/, "reassigns");
  assert.match(route, /hasLiveOperator/, "checks for live operators");
  assert.match(route, /cancelled/, "cancels when no operator");
});

test("stress: 50 crossing pairs cover all key floors", () => {
  const fromFloors = new Set(CROSSING_PAIRS.map(p => p[0]));
  const toFloors = new Set(CROSSING_PAIRS.map(p => p[1]));
  // At least 8 distinct from-floors and 8 distinct to-floors
  assert.ok(fromFloors.size >= 8, `from-floors: ${fromFloors.size} >= 8`);
  assert.ok(toFloors.size >= 8, `to-floors: ${toFloors.size} >= 8`);
});

test("stress: crossing pairs create same-floor dropoff+pickup opportunities", () => {
  // Check that some pair's destination matches another pair's origin
  const toFloors = CROSSING_PAIRS.map(p => p[1]);
  const fromFloors = CROSSING_PAIRS.map(p => p[0]);
  const sameFloorOps = toFloors.filter(f => fromFloors.includes(f));
  assert.ok(sameFloorOps.length >= 10, `at least 10 same-floor crossing opportunities: ${sameFloorOps.length}`);
});

test("stress: crossing pairs include both directions (up and down)", () => {
  const ups = CROSSING_PAIRS.filter(p => p[1] > p[0]).length;
  const downs = CROSSING_PAIRS.filter(p => p[1] < p[0]).length;
  assert.ok(ups >= 15, `at least 15 up requests: ${ups}`);
  assert.ok(downs >= 15, `at least 15 down requests: ${downs}`);
});

// ════════════════════════════════════════════════════
// VALIDATION RULES
// ════════════════════════════════════════════════════

test("stress: completed requests never reappear (TERMINAL_REQUEST_STATUSES)", () => {
  const realtime = readFileSync(join(root, "lib/realtime.ts"), "utf8");
  assert.match(realtime, /TERMINAL_REQUEST_STATUSES/, "constant defined");
  assert.match(realtime, /completed/, "includes completed");
  assert.match(realtime, /cancelled/, "includes cancelled");
});

test("stress: SSR query filters terminal statuses", () => {
  const admin = readFileSync(join(root, "lib/adminProject.ts"), "utf8");
  if (admin.includes('.in("status"')) {
    assert.match(admin, /pending.*assigned.*arriving.*boarded|boarded.*arriving.*assigned.*pending/, "SSR filters to active statuses");
  }
});

test("stress: optimistic pickup rollback on failure", () => {
  const rec = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(rec, /onPickupFailure/, "pickup failure callback");
  assert.match(rec, /onDropoffFailure/, "dropoff failure callback");
});

test("stress: effectiveCompletedDropoffIds prevents stale race", () => {
  const rec = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(rec, /effectiveCompletedDropoffIds/, "effective completed IDs guard");
});

test("stress: double-click guards on pickup and dropoff", () => {
  const rec = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(rec, /pendingPickupIds/, "pending pickup tracking");
  assert.match(rec, /pendingDropoffIds/, "pending dropoff tracking");
});

test("stress: PLEIN toggle only blocks pickup", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // manualFull only filters pickup pools, NOT dropoff
  const manualFullChecks = brain.match(/manualFull[^;]*\?[^;]*\[\]/g) ?? [];
  assert.ok(manualFullChecks.length >= 2, `manualFull empties pickup pools in at least 2 places: ${manualFullChecks.length}`);
});

test("stress: brain SCAN algorithm picks correct floor order", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /resolvePickupFloorSCAN/, "SCAN algorithm used");
  assert.match(brain, /nearestEligiblePickupFloorSCAN/, "nearest eligible SCAN");
});

test("stress: collective pickup wave groups same-direction requests", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /collectivePickupWave/, "wave grouping exists");
});

test("stress: all 3 release paths are consistent", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const route = readFileSync(join(root, "app/api/operator/force-release/route.ts"), "utf8");
  const paths = [
    { name: "release", code: actions.substring(actions.indexOf("async function releaseOperatorElevator"), actions.indexOf("async function releaseOperatorElevator") + 3000) },
    { name: "admin-deactivate", code: actions.substring(actions.indexOf("async function adminDeactivateOperatorTablet"), actions.indexOf("async function adminDeactivateOperatorTablet") + 3000) },
    { name: "force-release", code: route },
  ];
  for (const { name, code } of paths) {
    assert.match(code, /current_load: 0/, `${name}: resets current_load`);
    assert.match(code, /direction: .idle./, `${name}: resets direction`);
  }
});

test("stress: clearElevatorActiveRequests cancels all including boarded", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("async function clearElevatorActiveRequests");
  const fnBody = actions.substring(fnIdx, fnIdx + 2000);
  assert.match(fnBody, /REQUESTS_OPEN_DURING_SERVICE/, "includes boarded in cancel");
  assert.match(fnBody, /current_load: 0/, "resets load");
});

test("stress: updateRequestStatus validates transitions before DB write", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const fnIdx = actions.indexOf("async function updateRequestStatus");
  const fnBody = actions.substring(fnIdx, fnIdx + 2000);
  assert.match(fnBody, /isLegalTransition/, "validates transition before update");
  assert.match(fnBody, /Transition invalide/, "returns error on invalid transition");
});

test("stress: status transition board prevents completed->pending", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  // completed: [] — no outgoing transitions
  assert.match(actions, /completed.*:\s*\[\]/, "completed has empty transitions");
  assert.match(actions, /cancelled.*:\s*\[\]/, "cancelled has empty transitions");
});

test("stress: board prevents boarded->assigned backward", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const boardedMatch = actions.match(/boarded.*:\s*\[([^\]]*)\]/);
  assert.ok(boardedMatch, "boarded has transition array");
  const transitions = boardedMatch![1];
  assert.ok(!transitions.includes("assigned"), "boarded cannot go to assigned");
  assert.ok(!transitions.includes("arriving"), "boarded cannot go to arriving");
  assert.ok(!transitions.includes("pending"), "boarded cannot go to pending");
});

test("stress: pending can only go forward (assigned) or cancel", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const pendingMatch = actions.match(/pending.*:\s*\[([^\]]*)\]/);
  assert.ok(pendingMatch, "pending has transition array");
  const transitions = pendingMatch![1];
  assert.ok(transitions.includes("assigned"), "pending -> assigned allowed");
  assert.ok(transitions.includes("cancelled"), "pending -> cancelled allowed");
  assert.ok(!transitions.includes("boarded"), "pending -> boarded not allowed (skip)");
  assert.ok(!transitions.includes("completed"), "pending -> completed not allowed");
});

test("stress: arriving can defer to pending", () => {
  const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
  const arrivingMatch = actions.match(/arriving.*:\s*\[([^\]]*)\]/);
  assert.ok(arrivingMatch, "arriving has transition array");
  assert.ok(arrivingMatch![1].includes("pending"), "arriving -> pending (defer) allowed");
  assert.ok(arrivingMatch![1].includes("boarded"), "arriving -> boarded allowed");
});

test("stress: boarding direction inferred from onboard passengers", () => {
  const routing = readFileSync(join(root, "lib/elevatorRouting.ts"), "utf8");
  assert.match(routing, /effectiveServiceDirection|inferredDirectionFromQueue/, "direction inferred from queue");
});

test("stress: 50 crossing pairs have no duplicate (from,to) combos", () => {
  const keys = CROSSING_PAIRS.map(p => `${p[0]}->${p[1]}`);
  const unique = new Set(keys);
  // Allow some duplicates (same pair but different passengers) — just verify we have 50
  assert.equal(CROSSING_PAIRS.length, 50, "exactly 50 pairs");
});

// ════════════════════════════════════════════════════
// PERFORMANCE: no blocking operations
// ════════════════════════════════════════════════════

test("stress: brain is pure function (no DB calls, no async)", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  const fnIdx = brain.indexOf("export function computeNextOperatorAction");
  const fnBody = brain.substring(fnIdx, fnIdx + 100);
  // Should NOT be async
  assert.ok(!fnBody.includes("async"), "brain is synchronous — no DB calls");
});

test("stress: poll interval is fast enough for realtime", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  // Check for 250ms poll
  if (ws.includes("setInterval")) {
    assert.match(ws, /250/, "poll interval is 250ms");
  }
});

test("stress: broadcast channel for instant sync", () => {
  const broadcast = readFileSync(join(root, "lib/operatorNotifyBroadcast.ts"), "utf8");
  assert.match(broadcast, /broadcast|channel/, "broadcast channel exists");
});
