/**
 * BUG 1 — PLEIN blocks dropoff fix
 * BUG 2 — Cancel movement resets passenger fix
 *
 * Targeted tests:
 * 1. idle_manual_full is a distinct reason from idle_blocked
 * 2. idle_manual_full has specific FR/EN message
 * 3. Brain returns idle_manual_full when manualFull + open requests
 * 4. Brain returns dropoff (not idle_manual_full) when passengers onboard
 * 5. UI shows PLEIN info banner (not disabled button) for idle_manual_full
 * 6. UI shows dropoff button even when PLEIN is active (onboard passengers)
 * 7. Cancel broadcasts request_cancelled to passenger
 * 8. Passenger listens for request_cancelled broadcast
 * 9. i18n keys exist for cancelledByOperator
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// BUG 1 tests
test("bug1: idle_manual_full is a distinct reason kind in types", () => {
  const types = readFileSync(join(root, "types/hoist.ts"), "utf8");
  assert.match(types, /idle_manual_full/, "idle_manual_full variant exists");
  assert.doesNotMatch(types, /idle_manual_full.*idle_blocked/s, "distinct from idle_blocked");
});

test("bug1: idle_manual_full has specific FR/EN message", () => {
  const reason = readFileSync(join(root, "lib/recommendationReason.ts"), "utf8");
  assert.match(reason, /idle_manual_full/, "case handled");
  assert.match(reason, /PLEIN.*actif|Mode PLEIN/, "FR message mentions PLEIN");
  assert.match(reason, /PLEIN mode active|pickups blocked/, "EN message mentions PLEIN");
});

test("bug1: brain returns idle_manual_full when manualFull + open requests", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // First occurrence in idle section
  const firstMatch = brain.indexOf("idle_manual_full");
  assert.ok(firstMatch > -1, "idle_manual_full returned in first idle branch");
  // Second occurrence
  const secondMatch = brain.indexOf("idle_manual_full", firstMatch + 1);
  assert.ok(secondMatch > -1, "idle_manual_full returned in second idle branch");
  // Check manualFull guard
  assert.match(brain, /manualFull.*idle_manual_full|idle_manual_full.*manualFull/s, "manualFull guards idle_manual_full");
});

test("bug1: UI shows PLEIN info banner for idle_manual_full (not disabled button)", () => {
  const ui = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(ui, /idle_manual_full/, "idle_manual_full handled in UI");
  assert.match(ui, /Ban/, "Ban icon used for PLEIN banner");
  // idle_manual_full JSX render section should not have disabled (it's a <div>, not a <button>)
  // Use the LAST occurrence (JSX), not the first (variable declaration)
  const lastManualFullIdx = ui.lastIndexOf("idle_manual_full");
  const nextBranch = ui.indexOf("idle_blocked", lastManualFullIdx);
  const section = ui.substring(lastManualFullIdx, nextBranch > lastManualFullIdx ? nextBranch : lastManualFullIdx + 500);
  assert.doesNotMatch(section, /disabled/, "PLEIN banner section has no disabled attribute");
});

test("bug1: idle_manual_full included in idleBlockedMessage check", () => {
  const ui = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(ui, /idle_manual_full.*idle_blocked|idle_blocked.*idle_manual_full/s, "idle_manual_full included in idleBlockedMessage");
});

test("bug1: fallback pickup skips idle_manual_full", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /idle_manual_full/, "idle_manual_full checked in fallback condition");
});

// BUG 2 tests
test("bug2: PASSENGER_BROADCAST_REQUEST_CANCELLED constant exists", () => {
  const broadcast = readFileSync(join(root, "lib/passengerNotifyBroadcast.ts"), "utf8");
  assert.match(broadcast, /PASSENGER_BROADCAST_REQUEST_CANCELLED/, "constant exists");
  assert.match(broadcast, /request_cancelled/, "event name is request_cancelled");
});

test("bug2: broadcastPassengerRequestCancelled function exists", () => {
  const broadcast = readFileSync(join(root, "lib/passengerNotifyBroadcast.ts"), "utf8");
  assert.match(broadcast, /broadcastPassengerRequestCancelled/, "function exists");
});

test("bug2: operator cancelMovementRequest broadcasts to passenger", () => {
  const dash = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  assert.match(dash, /broadcastPassengerRequestCancelled/, "broadcast called on cancel");
  assert.match(dash, /broadcastPassengerRequestCancelled.*projectId/, "projectId passed");
  assert.match(dash, /broadcastPassengerRequestCancelled.*request\.id/, "request.id passed");
});

test("bug2: passenger RequestForm listens for request_cancelled broadcast", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  assert.match(form, /PASSENGER_BROADCAST_REQUEST_CANCELLED/, "import exists");
  assert.match(form, /clearPassengerPendingRequest/, "clears pending storage somewhere");
  assert.match(form, /cancelledByOperator/, "shows cancelledByOperator message");
});

test("bug2: i18n keys for cancelledByOperator exist FR+EN", () => {
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8");
  assert.match(i18n, /request\.cancelledByOperator/, "key exists");
  assert.match(i18n, /annul.*op.*rateur|op.*rateur.*annul/i, "FR message mentions operator");
  assert.match(i18n, /cancelled by operator/i, "EN message mentions operator");
});
