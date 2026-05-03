/**
 * Operator UI lag fix — targeted tests.
 *
 * Bug 1: syncRequests creates a new array on every 400ms poll even when
 * the DB data is identical, causing unnecessary re-renders and expensive
 * dispatch recomputation.
 *
 * Fix 1: return the current array reference when polled data matches
 * (same length, same IDs in same order, same status, same elevator_id).
 *
 * Bug 2: recommendation (dispatch brain) recomputes on every render
 * even when inputs are unchanged.
 *
 * Fix 2: wrap recommendation in useMemo with proper dependencies.
 *
 * These tests lock the structural guarantees via readFileSync.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");

// ---------------------------------------------------------------------------
// 1. syncRequests returns current array when data is unchanged
// ---------------------------------------------------------------------------
test("operator ui lag: syncRequests short-circuits when polled data matches current", () => {
  // The equality check must exist inside the setLiveRequests callback.
  const syncBlock = DASHBOARD.match(/setLiveRequests\(\(current\) => \{[\s\S]*?return next;[\s\S]*?\}\)/)?.[0] ?? "";
  assert.match(syncBlock, /if \(next\.length === current\.length/);
  assert.match(syncBlock, /return current/);
});

// ---------------------------------------------------------------------------
// 2. Equality check covers id, status, elevator_id (not deep equality)
// ---------------------------------------------------------------------------
test("operator ui lag: equality check covers id + status + elevator_id", () => {
  const syncBlock = DASHBOARD.match(/setLiveRequests\(\(current\) => \{[\s\S]*?return next;[\s\S]*?\}\)/)?.[0] ?? "";
  assert.match(syncBlock, /r\.id === current\[i\]\?\.id/);
  assert.match(syncBlock, /r\.status === current\[i\]\?\.status/);
  assert.match(syncBlock, /r\.elevator_id === current\[i\]\?\.elevator_id/);
});

// ---------------------------------------------------------------------------
// 3. recommendation is memoized with useMemo
// ---------------------------------------------------------------------------
test("operator ui lag: recommendation wrapped in useMemo", () => {
  assert.match(DASHBOARD, /const recommendation = useMemo\(/);
  // Must depend on the key inputs
  assert.match(DASHBOARD, /const recommendation = useMemo[\s\S]*?dispatchRequests[\s\S]*?liveActivePassengers[\s\S]*?currentFloor/);
});

// ---------------------------------------------------------------------------
// 4. useMemo dependencies include currentLoad (prevents stale recommendation)
// ---------------------------------------------------------------------------
test("operator ui lag: recommendation useMemo depends on currentLoad", () => {
  const useMemBlock = DASHBOARD.match(/const recommendation = useMemo[\s\S]*?\],[\s\S]*?\]/)?.[0] ?? "";
  assert.match(useMemBlock, /effectiveElevator\.current_load/);
  assert.match(useMemBlock, /effectiveElevator\.manual_full/);
});
