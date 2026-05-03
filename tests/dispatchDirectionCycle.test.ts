/**
 * Dispatch direction cycle fix — targeted tests.
 *
 * Bug: effectiveServiceDirection blindly returns the DB elevator direction
 * even when it contradicts onboard passenger destinations. When the DB
 * direction is stale (e.g. "down" but all dropoffs are above), the brain
 * picks the wrong dropoff order and serves the cycle in reverse.
 *
 * Fix: when no dropoffs are ahead in the DB direction, infer the real
 * direction from onboard passengers (turnaround).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { effectiveServiceDirection } from "../lib/elevatorRouting";

type AP = { requestId: string; from_floor_id: string; to_floor_id: string; from_sort_order: number; to_sort_order: number; passenger_count: number };

function ap(toSort: number, count = 1): AP {
  return { requestId: `p${toSort}`, from_floor_id: "x", to_floor_id: "y", from_sort_order: 0, to_sort_order: toSort, passenger_count: count };
}

// ---------------------------------------------------------------------------
// 1. DB says "down" but all dropoffs are above → must infer "up" (turnaround)
// ---------------------------------------------------------------------------
test("direction cycle: DB down + dropoffs only above → effective direction is up", () => {
  const dir = effectiveServiceDirection(7, "down", [ap(13), ap(15)]);
  assert.equal(dir, "up");
});

// ---------------------------------------------------------------------------
// 2. DB says "up" but all dropoffs are below → must infer "down" (turnaround)
// ---------------------------------------------------------------------------
test("direction cycle: DB up + dropoffs only below → effective direction is down", () => {
  const dir = effectiveServiceDirection(13, "up", [ap(3), ap(5)]);
  assert.equal(dir, "down");
});

// ---------------------------------------------------------------------------
// 3. DB direction has dropoffs ahead → trust DB (no turnaround yet)
// ---------------------------------------------------------------------------
test("direction cycle: DB up + dropoffs above and below → trust up (continue cycle)", () => {
  const dir = effectiveServiceDirection(7, "up", [ap(13), ap(3)]);
  assert.equal(dir, "up");
});

test("direction cycle: DB down + dropoffs above and below → trust down (continue cycle)", () => {
  const dir = effectiveServiceDirection(7, "down", [ap(13), ap(3)]);
  assert.equal(dir, "down");
});

// ---------------------------------------------------------------------------
// 4. No passengers → DB direction passthrough unchanged
// ---------------------------------------------------------------------------
test("direction cycle: no passengers → passthrough DB direction", () => {
  assert.equal(effectiveServiceDirection(7, "up", []), "up");
  assert.equal(effectiveServiceDirection(7, "down", []), "down");
  assert.equal(effectiveServiceDirection(7, "idle", []), "idle");
});
