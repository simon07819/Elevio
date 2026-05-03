/**
 * Operator buttons state — targeted tests.
 *
 * Verifies that operator action buttons show the correct state:
 * - Dropoff always appears when boarded passengers have destinations
 * - Pickup hidden during pending pickup (double-click guard)
 * - Dropoff hidden during pending dropoff (double-click guard)
 * - Manual full still allows dropoff
 * - Cancel unavailable for boarded passengers
 * - Brain recommends dropoff at current floor (dropoffsAtCurrent)
 * - effectiveCompletedDropoffIds race guard works
 * - Action button fallback when brain has no next floor
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const MOVEMENT = readFileSync(join(root, "components/operator/MovementBoard.tsx"), "utf8");

// ---------------------------------------------------------------------------
// 1. Dropoff button shows when boarded passengers exist (not hidden by idle)
// ---------------------------------------------------------------------------
test("buttons state: showDropoff depends on dropoffIds and dropFloorId", () => {
  assert.match(RECOMMENDED, /const showDropoff = dropoffIds\.length > 0 && dropFloorId !== ""/);
});

// ---------------------------------------------------------------------------
// 2. Pickup hidden when dropoff is shown (priority)
// ---------------------------------------------------------------------------
test("buttons state: showPickup only when !showDropoff", () => {
  assert.match(RECOMMENDED, /const showPickup = !showDropoff && actionRequest !== null/);
});

// ---------------------------------------------------------------------------
// 3. Pending pickup guard (double-click)
// ---------------------------------------------------------------------------
test("buttons state: actionRequest excludes pendingPickupIds", () => {
  assert.match(RECOMMENDED, /!pendingPickupIds\.has\(request\.id\)/);
  assert.match(RECOMMENDED, /if \(pendingPickupIds\.has\(requestId\)\) return/);
});

// ---------------------------------------------------------------------------
// 4. Pending dropoff guard (double-click)
// ---------------------------------------------------------------------------
test("buttons state: dropoff checks alreadyPending before action", () => {
  assert.match(RECOMMENDED, /const alreadyPending = ids\.some\(\(id\) => pendingDropoffIds\.has\(id\)\)/);
  assert.match(RECOMMENDED, /if \(alreadyPending\) return/);
});

// ---------------------------------------------------------------------------
// 5. Cancel button hidden for boarded passengers
// ---------------------------------------------------------------------------
test("buttons state: cancel button hidden when status is boarded", () => {
  assert.match(MOVEMENT, /request\.status === "boarded" \|\| !onCancelRequest \? null :/);
});

// ---------------------------------------------------------------------------
// 6. Manual full does not prevent dropoff (brain still recommends)
// ---------------------------------------------------------------------------
test("buttons state: manualFull only filters pickups, not dropoffs", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // In the nextDropSort section, capacityOkAtPickup is empty when manualFull
  assert.match(brain, /const capacityOkAtPickup = manualFull[\s\S]*?\[\]/);
  // Dropoffs are NOT gated by manualFull
  assert.match(brain, /const dropoffsAtCurrent = onboardPassengers\.filter/);
});

// ---------------------------------------------------------------------------
// 7. effectiveCompletedDropoffIds race guard (dropoff reappears if brain still wants it)
// ---------------------------------------------------------------------------
test("buttons state: effectiveCompletedDropoffIds excludes IDs the brain still wants", () => {
  assert.match(RECOMMENDED, /const activeDropIds = new Set\(recommendation\.requestsToDropoff\.map/);
  assert.match(RECOMMENDED, /if \(!activeDropIds\.has\(id\)\) \{[\s\S]*?next\.add\(id\)/);
});

// ---------------------------------------------------------------------------
// 8. Fallback pickup when brain has no next floor but fallback exists
// ---------------------------------------------------------------------------
test("buttons state: fallback pickup shown when brain has no next floor", () => {
  assert.match(DASHBOARD, /fallbackPickup/);
  assert.match(DASHBOARD, /visibleRecommendation = \{[\s\S]*?primaryPickupRequestId: fallbackPickup\.id/);
});

// ---------------------------------------------------------------------------
// 9. Dropoff at current floor always prioritized (dropoffsAtCurrent in brain)
// ---------------------------------------------------------------------------
test("buttons state: brain always recommends dropoff when passengers at current floor", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /const dropoffsAtCurrent = onboardPassengers\.filter/);
  assert.match(brain, /if \(dropoffsAtCurrent\.length > 0\) \{[\s\S]*?action: "dropoff"/);
});
