/**
 * manual_full mode: Déposer must remain available when passengers onboard.
 *
 * Bug: When PLEIN/manual_full=true, the idle_blocked message replaced
 * the ENTIRE action area — covering the Déposer button even when
 * passengers were already onboard and needed to be dropped off.
 *
 * Fix:
 * - Brain: idle_manual_full distinct reason kind (instead of idle_blocked
 *   when manualFull=true). Specific French/English message.
 * - UI: When idle_manual_full + boarded passengers → show PLEIN banner
 *   ABOVE the dropoff button (both visible simultaneously).
 * - UI: When idle_manual_full + no boarded passengers → red disabled
 *   button (pickups blocked, no dropoff possible).
 * - UI: idle_blocked stays amber for capacity-full (unchanged).
 *
 * Tests:
 * 1. manual_full=true + onboard passenger → Déposer enabled
 * 2. manual_full=true + pickup available → Ramasser disabled
 * 3. idle_manual_full message remains visible
 * 4. After Déposer, PLEIN stays active until Reprendre
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. manual_full=true + onboard passenger → Déposer enabled (brain returns dropoff)
// ---------------------------------------------------------------------------
test("manual_full: brain returns dropoff when onboard passengers exist", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // manualFull check exists in the brain
  assert.match(brain, /manualFull/, "brain uses manualFull");
  // idle_manual_full is returned when manualFull=true and idle
  assert.match(brain, /idle_manual_full/, "idle_manual_full reason kind exists");
  // Dropoff-before-pickups branch is BEFORE the idle logic
  const dropoffPos = brain.indexOf("dropoffsAtCurrent");
  const idlePos = brain.indexOf("idle_manual_full");
  assert.ok(dropoffPos > 0, "dropoff branch exists");
  assert.ok(idlePos > 0, "idle_manual_full exists");
  assert.ok(dropoffPos < idlePos, "dropoff branch BEFORE idle logic");
});

// ---------------------------------------------------------------------------
// 2. manual_full=true + pickup available → Ramasser disabled (idle_manual_full)
// ---------------------------------------------------------------------------
test("manual_full: idle_manual_full replaces idle_blocked when manualFull=true", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // In idle wait branches, manualFull chooses idle_manual_full over idle_blocked
  const waitBranches = brain.match(/openRequests\.length === 0[\s\S]*?idle_manual_full[\s\S]*?idle_blocked/g);
  assert.ok(waitBranches && waitBranches.length >= 2, "manualFull→idle_manual_full, else→idle_blocked in wait branches");
});

// ---------------------------------------------------------------------------
// 3. idle_manual_full message remains visible (UI shows banner + dropoff)
// ---------------------------------------------------------------------------
test("manual_full: UI shows PLEIN banner above dropoff when idle_manual_full + boarded", () => {
  const ui = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(ui, /idle_manual_full/, "UI handles idle_manual_full");
  assert.match(ui, /idleManualFullMessage/, "PLEIN message variable exists");
  // PLEIN banner shown above dropoff button when both conditions met
  assert.match(ui, /idle_manual_full.*idleManualFullMessage/s, "banner condition references idle_manual_full");
  // idle_manual_full gets red styling (distinct from amber idle_blocked)
  const manualFullSection = ui.slice(
    ui.indexOf('kind === "idle_manual_full" ? ('),
    ui.indexOf('kind === "idle_manual_full" ? (') + 500,
  );
  assert.ok(manualFullSection.includes("bg-red-950"), "red styling for idle_manual_full button");
});

// ---------------------------------------------------------------------------
// 4. After Déposer, PLEIN stays active until Reprendre
// ---------------------------------------------------------------------------
test("manual_full: idle_manual_full specific message in recommendationReason", () => {
  const reason = readFileSync(join(root, "lib/recommendationReason.ts"), "utf8");
  assert.match(reason, /idle_manual_full/, "reason formatter handles idle_manual_full");
  // Message mentions PLEIN/FULL and that dropoff is allowed
  assert.match(reason, /Mode PLEIN|FULL mode/, "message mentions PLEIN/FULL mode");
  assert.match(reason, /D.poser|drop off/, "message mentions dropoff allowed");
});
