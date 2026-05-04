/**
 * Critical operator/request flow fix - regression tests.
 *
 * Bug: when advanceRequestStatus(boarded|completed) returned ok=false (or threw),
 * the optimistic local state in OperatorDashboard kept the request marked as
 * boarded/completed, while the DB still had it as pending/boarded. The brain
 * recomputed without the request, the operator saw it disappear from the queue,
 * and the passenger stayed stuck.
 *
 * Fix: RecommendedNextStop now exposes onPickupFailure / onDropoffFailure props
 * that the parent (OperatorDashboard) wires to revert the optimistic update.
 *
 * These tests use the existing static-content pattern (readFileSync) — same as
 * tests/passengerRequestUi.test.ts and tests/passengerFlowSmoke.test.ts. No DOM
 * render, no extra deps. They lock the wiring so any future change that drops
 * the rollback path surfaces immediately.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const RECOMMENDED = read("components/operator/RecommendedNextStop.tsx");
const DASHBOARD = read("components/operator/OperatorDashboard.tsx");

test("operator flow fix: RecommendedNextStop expose les props onPickupFailure et onDropoffFailure", () => {
  assert.match(RECOMMENDED, /onPickupFailure\?:\s*\(request: EnrichedRequest\) => void/);
  assert.match(
    RECOMMENDED,
    /onDropoffFailure\?:\s*\(payload: \{ requestIds: string\[\] \}\) => void/,
  );
});

test("operator flow fix: pickup() appelle onPickupFailure quand advanceRequestStatus retourne ok=false", () => {
  // Branche `then` : si result.ok -> onPickupConfirmed + analytics, else -> setActionError + captureError + onPickupFailure.
  assert.match(
    RECOMMENDED,
    /if \(result\.ok\) \{[\s\S]*?onPickupConfirmed\?\.\(targetRequest\);[\s\S]*?\} else \{[\s\S]*?setActionError[\s\S]*?onPickupFailure\?\.\(targetRequest\);/,
  );
});

test("operator flow fix: pickup() appelle onPickupFailure aussi dans le catch (network throw)", () => {
  assert.match(
    RECOMMENDED,
    /\.catch\([\s\S]*?setActionError\("Action impossible[\s\S]*?"\);[\s\S]*?onPickupFailure\?\.\(targetRequest\);/,
  );
});

test("operator flow fix: dropoff() appelle onDropoffFailure dans then et catch", () => {
  // Then : if (failed) -> setActionError + setCompletedDropoffIds.delete + onDropoffFailure.
  assert.match(
    RECOMMENDED,
    /if \(failed\) \{[\s\S]*?onDropoffFailure\?\.\(\{ requestIds: ids \}\);/,
  );
  // Catch : setActionError + setCompletedDropoffIds.delete + onDropoffFailure.
  assert.match(
    RECOMMENDED,
    /\.catch\([\s\S]*?onDropoffFailure\?\.\(\{ requestIds: ids \}\);/,
  );
});

test("operator flow fix: OperatorDashboard cable onPickupFailure pour restaurer le statut original", () => {
  assert.match(DASHBOARD, /onPickupFailure=\{\(req\) => \{/);
  // Le handler doit (1) supprimer l'entree optimiste, (2) restaurer status/elevator_id depuis le snapshot.
  assert.match(
    DASHBOARD,
    /onPickupFailure=\{\(req\) => \{[\s\S]*?optimisticRequestsRef\.current\.delete\(req\.id\)/,
  );
  assert.match(
    DASHBOARD,
    /onPickupFailure=\{\(req\) => \{[\s\S]*?status: req\.status,\s*updated_at: req\.updated_at,\s*elevator_id: req\.elevator_id/,
  );
});

test("operator flow fix: OperatorDashboard cable onDropoffFailure pour restaurer status=boarded", () => {
  assert.match(DASHBOARD, /onDropoffFailure=\{\(\{ requestIds \}\) => \{/);
  // Le handler doit remettre status='boarded' et clear completed_at sur les ids concernes.
  assert.match(
    DASHBOARD,
    /onDropoffFailure=\{\(\{ requestIds \}\) => \{[\s\S]*?requestIds\.includes\(r\.id\) && r\.status === "completed"[\s\S]*?status: "boarded" as const,\s*completed_at: null/,
  );
});

test("operator flow fix: rollback recalcule current_load a partir des passagers boarded restants", () => {
  // Pickup failure : recalcul boardedLoad et notif onElevatorPatch.
  const pickupBlock = DASHBOARD.match(/onPickupFailure=\{\(req\) => \{[\s\S]*?\}\}/)?.[0] ?? "";
  assert.match(pickupBlock, /boardedLoad/);
  assert.match(pickupBlock, /onElevatorPatch\?\.\(elevator\.id, \{\s*current_load: boardedLoad/);
  // Dropoff failure : meme chose.
  const dropoffBlock = DASHBOARD.match(/onDropoffFailure=\{\(\{ requestIds \}\) => \{[\s\S]*?\}\}/)?.[0] ?? "";
  assert.match(dropoffBlock, /boardedLoad/);
  assert.match(dropoffBlock, /onElevatorPatch\?\.\(elevator\.id, \{\s*current_load: boardedLoad/);
});
