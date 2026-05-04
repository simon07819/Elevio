/**
 * Non-regression tests for: Déposer + Ramasser combined button at same floor.
 *
 * Bug: When dropoff and pickup are at the same floor (e.g., A: 5→P1, B: P1→5),
 * operator had to click two buttons separately at P1: "Déposer" then "Ramasser".
 *
 * Fix: Combined "Déposer + Ramasser" button appears when both actions
 * are at the same floor. One click completes both.
 *
 * Also: Strengthened PAUSE INTERDICT guard with optimistic boarded check,
 * added debug diagnostics at Ramasser, PAUSE, and poll merge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED BUTTON
// ═══════════════════════════════════════════════════════════════════════════

test("combined-button: showCombined computed when dropoff floor = pickup floor", () => {
  const comp = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(comp, /showCombined/, "showCombined flag exists");
  assert.match(comp, /pickupAtDropFloor/, "pickupAtDropFloor computed");
  assert.match(comp, /pickupCandidateAtDropFloor/, "pickupCandidateAtDropFloor searches actionRequests independently");
  assert.match(comp, /from_floor_id === dropFloorId/, "checks pickup floor matches dropoff floor");
});

test("combined-button: dropoffAndPickup function does both actions", () => {
  const comp = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(comp, /function dropoffAndPickup/, "combined function exists");
  // Calls both advanceRequestStatus for completed and boarded
  assert.match(comp, /advanceRequestStatus\(requestId, .completed.\)/, "dropoff completes requests");
  assert.match(comp, /advanceRequestStatus\(targetRequest\.id, .boarded./, "pickup boards requests");
  // Both fired in parallel
  assert.match(comp, /Promise\.all/, "both actions fired in parallel");
  // On success: onPickupConfirmed called (broadcast to passenger)
  assert.match(comp, /onPickupConfirmed/, "pickup confirmed callback called");
  // On dropoff success: onDropoffSuccess called
  assert.match(comp, /onDropoffSuccess/, "dropoff success callback called");
});

test("combined-button: combined button rendered with gradient style", () => {
  const comp = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(comp, /showCombined/, "combined button condition");
  assert.match(comp, /dropoffAndPickup/, "combined button onClick");
  assert.match(comp, /from-emerald.*via-teal.*to-sky/, "gradient style for combined button");
  assert.match(comp, /DoorOpen/, "door icon in combined button");
  assert.match(comp, /UserCheck/, "user check icon in combined button");
});

test("combined-button: i18n keys for dropoffAndPickup", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /operator\.dropoffAndPickup.*Déposer \+ Ramasser/, "French key exists");
  assert.match(i18n, /operator\.dropoffAndPickup.*Drop off \+ Pickup/, "English key exists");
});

// ═══════════════════════════════════════════════════════════════════════════
// STRENGTHENED PAUSE INTERDICT (optimistic boarded check)
// ═══════════════════════════════════════════════════════════════════════════

test("pause-interdict-v2: guard checks optimistic boarded requests", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /hasOptimisticBoardedRequests/, "hasOptimisticBoardedRequests function exists");
  assert.match(dash, /hasAnyBoardedWork/, "hasAnyBoardedWork combines live + optimistic");
  // Used in both PAUSE guards
  assert.match(dash, /!recommendation\.nextFloor.*hasAnyBoardedWork/s, "brain guard uses hasAnyBoardedWork");
  assert.match(dash, /realHasOperatorWork.*hasAnyBoardedWork/, "hasOperatorWork guard uses hasAnyBoardedWork");
});

test("pause-interdict-v2: reconstructs passengers from optimistic when live state overwritten", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // When liveActivePassengers is empty but optimistic has boarded, reconstruct from ref
  assert.match(dash, /optimisticRequestsRef\.current\.values\(\)/, "reads from optimistic ref");
  assert.match(dash, /boardedSource.*liveActivePassengers.*optimisticRequestsRef/s, "falls back to optimistic data");
});

test("pause-interdict-v2: kept filter protects optimistic boarded from poll discard", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /optimisticRequestsRef\.current\.has\(request\.id\)/, "optimistic check in kept filter");
});

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

test("debug-diag: Ramasser click logs performance (pickup_click_to_ui)", () => {
  const comp = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(comp, /pickup_click_to_ui/, "pickup performance event name");
  assert.match(comp, /pickupClickTimeRef/, "click time ref for performance logging");
  assert.match(comp, /target: "<200ms"/, "200ms target logged");
  assert.match(comp, /onPickupSuccess/, "optimistic success callback");
});

test("debug-diag: PAUSE computation logs reason, boarded count, session info", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /\[PAUSE-DIAG\]/, "PAUSE diagnostic tag");
  assert.match(dash, /activeQueueLen/, "logs activeQueue length");
  assert.match(dash, /hasBoardedPassengers/, "logs hasBoardedPassengers");
  assert.match(dash, /hasOptimisticBoarded/, "logs hasOptimisticBoarded");
  assert.match(dash, /elevatorDir/, "logs elevator direction");
  assert.match(dash, /sessionId/, "logs session ID");
});

test("debug-diag: poll merge logs when boarded count changes", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /\[POLL-MERGE\]/, "POLL-MERGE diagnostic tag");
  assert.match(dash, /prevBoarded/, "logs prevBoarded count");
  assert.match(dash, /nextBoarded/, "logs nextBoarded count");
  assert.match(dash, /droppedIds/, "logs dropped IDs");
});
