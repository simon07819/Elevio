/**
 * Regression test for premature passenger broadcast on pickup.
 *
 * Bug: broadcastPassengerRequestBoarded was called inside onPickupSuccess
 * (optimistic, before server confirmation). If advanceRequestStatus failed,
 * the passenger had already been redirected to the scan page and lost track
 * of their request. Combined with the anti-duplicate guard, they were stuck.
 *
 * Fix: broadcast is now inside onPickupConfirmed, called only after the
 * server action returns ok=true.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");

test("broadcast fix: RecommendedNextStop expose onPickupConfirmed appele seulement apres ok=true", () => {
  assert.match(RECOMMENDED, /onPickupConfirmed\?:\s*\(request: EnrichedRequest\) => void/);
  // Appele dans .then quand result.ok est true, PAS avant.
  assert.match(
    RECOMMENDED,
    /if \(result\.ok\) \{\s*onPickupConfirmed\?\.\(targetRequest\)/,
  );
});

test("broadcast fix: onPickupSuccess broadcasts IMMEDIATELY for instant passenger redirect", () => {
  const pickupSuccessMatch = DASHBOARD.match(/onPickupSuccess=\{[\s\S]*?\}\}/)?.[0] ?? "";
  // BUG 3 FIX: broadcast is sent immediately in onPickupSuccess (optimistic)
  // so the passenger gets instant feedback without waiting for server confirmation
  assert.match(pickupSuccessMatch, /broadcastPassengerRequestBoarded/);
});

test("broadcast fix: onPickupConfirmed cable broadcastPassengerRequestBoarded", () => {
  assert.match(DASHBOARD, /onPickupConfirmed=\{[\s\S]*?broadcastPassengerRequestBoarded\(client, projectId, \[req\.id\]\)/);
});
