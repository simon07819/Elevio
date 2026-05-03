/**
 * BUG 1 fix — Terminal never auto-pauses with active work.
 * BUG 2 fix — Pickup + dropoff shown at same floor.
 *
 * BUG 1 root cause: brain filtered idle pickup pool by capacity, so when ALL
 * open requests exceeded remaining capacity, the pool was empty → idle_blocked.
 * The operator saw "Pause" even though requests existed.
 * Fix: include ALL open requests in idle pool; capacity only filters fitRequestsToCapacity.
 *
 * BUG 2 root cause: when dropoff at current floor existed, brain returned
 * requestsToPickup=[] even if pickups were at the same floor. The UI showed
 * only "Déposer", forcing the operator to click twice at the same stop.
 * Fix: brain includes same-floor pickups in the dropoff recommendation.
 * UI shows "Déposer + Ramasser" combined button.
 *
 * Tests:
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ─── BUG 1: No auto-pause with active work ───

test("auto-pause: brain idle pool NOT filtered by capacity", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  const idleIdx = brain.indexOf("const idleCapacityOk");
  const afterIdle = brain.substring(idleIdx, idleIdx + 200);
  // idleCapacityOk should be: manualFull ? [] : openRequests (no capacity filter)
  assert.doesNotMatch(afterIdle, /remainingCapacity/, "idle pool not filtered by remainingCapacity");
  assert.match(afterIdle, /openRequests/, "idle pool uses all openRequests when not manualFull");
});

test("auto-pause: en-route pool NOT filtered by capacity for floor selection", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  const geoIdx = brain.indexOf("const geographic = openPickupsTowardNextDropoff");
  const afterGeo = brain.substring(geoIdx, geoIdx + 300);
  // capacityOkAtPickup should be: manualFull ? [] : geographic (no capacity filter)
  assert.doesNotMatch(afterGeo, /remainingCapacity/, "en-route pool not filtered by remainingCapacity");
  assert.match(afterGeo, /geographic/, "en-route pool uses all geographic requests when not manualFull");
});

test("auto-pause: fitRequestsToCapacity still exists for boarding limits", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /function fitRequestsToCapacity/, "fitRequestsToCapacity still exists");
  assert.match(brain, /fittedAtFloor = fitRequestsToCapacity/, "fitRequestsToCapacity used for boarding");
});

// ─── BUG 2: Same-floor pickup + dropoff ───

test("same-floor: brain includes pickups in dropoff-at-current recommendation", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  const dropoffIdx = brain.indexOf("Dépose au palier courant");
  const afterDropoff = brain.substring(dropoffIdx, dropoffIdx + 1500);
  assert.match(afterDropoff, /sameFloorPickups/, "same-floor pickup detection");
  assert.match(afterDropoff, /from_sort_order.*currentSort/, "filters pickups at current floor");
  assert.match(afterDropoff, /fittedSameFloor/, "capacity-fitted same-floor pickups");
  assert.match(afterDropoff, /primaryPickup/, "primary pickup set in dropoff recommendation");
  assert.match(afterDropoff, /requestsToPickup: fittedSameFloor/, "pickups included in recommendation");
});

test("same-floor: UI shows combined button when both actions available", () => {
  const ui = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(ui, /sameFloorPickup/, "sameFloorPickup variable exists");
  assert.match(ui, /dropoffAndPickup/, "combined action function exists");
  assert.match(ui, /operator\.dropoffAndPickup/, "i18n key for combined label");
});

test("same-floor: i18n keys exist for dropoffAndPickup", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /operator\.dropoffAndPickup.*Déposer \+ Ramasser/, "FR key exists");
  assert.match(i18n, /operator\.dropoffAndPickup.*Drop off \+ Pickup/, "EN key exists");
});

test("same-floor: combined button gradient styling", () => {
  const ui = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  const btnIdx = ui.indexOf("sameFloorPickup ?");
  const afterBtn = ui.substring(btnIdx, btnIdx + 900);
  assert.match(afterBtn, /from-emerald.*to-sky/, "gradient from emerald to sky");
  assert.match(afterBtn, /DoorOpen/, "DoorOpen icon in combined button");
  assert.match(afterBtn, /UserCheck/, "UserCheck icon in combined button");
});

test("same-floor: dropoffAndPickup function calls both actions", () => {
  const ui = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  const fnIdx = ui.indexOf("function dropoffAndPickup");
  const fn = ui.substring(fnIdx, fnIdx + 300);
  assert.match(fn, /dropoff\(\)/, "calls dropoff()");
  assert.match(fn, /pickup\(\)/, "calls pickup()");
});

test("same-floor: manual_full excludes same-floor pickups", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  const dropoffIdx = brain.indexOf("Dépose au palier courant");
  const afterDropoff = brain.substring(dropoffIdx, dropoffIdx + 1200);
  assert.match(afterDropoff, /!manualFull/, "same-floor pickups excluded when manualFull");
});

test("auto-pause: operator with boarded passengers never gets idle_empty", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /hasBoardedPassengers/, "hasBoardedPassengers tracked");
  assert.match(dash, /hasOperatorWork.*activeQueue.*hasBoardedPassengers/, "work includes boarded passengers");
  // idle_empty only overrides when !hasOperatorWork
  const idleIdx = dash.indexOf("if (!hasOperatorWork)");
  const afterIdle = dash.substring(idleIdx, idleIdx + 200);
  assert.match(afterIdle, /idle_empty/, "idle_empty only when no operator work");
});
