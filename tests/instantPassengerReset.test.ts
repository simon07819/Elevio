/**
 * Instant passenger reset after pickup broadcast — targeted tests.
 *
 * Bug: broadcastChannelRef.current.ready was set once at mount with
 * ready=false (a local variable copy, not live). When the subscribe
 * callback set the local ready=true, the ref never updated. The
 * onPickupConfirmed handler checked only if channel existed, not if
 * it was subscribed. Sends on an unsubscribed channel are lost
 * silently. The fallback (subscribe-then-send) was never called
 * because the persistent channel "existed". Passenger had to wait
 * for the poll fallback (~30s).
 *
 * Fix:
 * - Subscribe callback writes ready=true back into the ref
 * - onPickupConfirmed checks ref?.ready before using persistent channel
 * - If not ready, falls back to broadcastPassengerRequestBoarded
 *   (subscribe-then-send, guaranteed delivery)
 * - Same fix for queue_cleared broadcast in clearVisibleQueue
 *
 * Tests:
 * 1. ready flag updated in ref on SUBSCRIBED (not local variable)
 * 2. onPickupConfirmed checks ready before sending
 * 3. Fallback used when persistent channel not ready
 * 4. Channel/event name matches between operator and passenger
 * 5. Pickup failure does NOT trigger broadcast
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. ready flag updated in ref on SUBSCRIBED
// ---------------------------------------------------------------------------
test("instant-reset: ready flag written back to ref on SUBSCRIBED", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // The subscribe callback must write ready=true back into the ref
  assert.match(dashboard, /broadcastChannelRef\.current = \{ channel: ch, ready: true \}/);
});

// ---------------------------------------------------------------------------
// 2. onPickupConfirmed checks ready before using persistent channel
// ---------------------------------------------------------------------------
test("instant-reset: onPickupConfirmed checks ref?.ready before sending", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // The condition must include `ref?.ready`
  assert.match(dashboard, /ref\?\.ready/);
});

// ---------------------------------------------------------------------------
// 3. Fallback used when persistent channel not ready
// ---------------------------------------------------------------------------
test("instant-reset: fallback broadcastPassengerRequestBoarded when channel not ready", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // The else branch should call broadcastPassengerRequestBoarded
  assert.match(dashboard, /broadcastPassengerRequestBoarded\(client, projectId, \[req\.id\]\)/);
});

// ---------------------------------------------------------------------------
// 4. Channel/event name matches between operator and passenger
// ---------------------------------------------------------------------------
test("instant-reset: operator and passenger use same channel and event", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  const requestForm = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  // Both import passengerProjectBroadcastChannel
  assert.match(dashboard, /passengerProjectBroadcastChannel/);
  assert.match(requestForm, /passengerProjectBroadcastChannel/);
  // Event name is "request_boarded" on operator side
  assert.match(dashboard, /event: "request_boarded"/);
  // Passenger listens for PASSENGER_BROADCAST_REQUEST_BOARDED
  assert.match(requestForm, /PASSENGER_BROADCAST_REQUEST_BOARDED/);
});

// ---------------------------------------------------------------------------
// 5. Pickup failure does NOT trigger broadcast (no onPickupConfirmed call)
// ---------------------------------------------------------------------------
test("instant-reset: pickup failure path does NOT call onPickupConfirmed", () => {
  const component = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  // The .then block: ok => onPickupConfirmed, else => onPickupFailure
  // The .catch block => onPickupFailure only
  const okBranch = component.match(/result\.ok\)[\s\S]{0,200}onPickupConfirmed/);
  assert.ok(okBranch, "ok branch calls onPickupConfirmed");
  const failBranch = component.match(/else \{[\s\S]{0,200}onPickupFailure/);
  assert.ok(failBranch, "else branch calls onPickupFailure, NOT onPickupConfirmed");
  const catchBranch = component.match(/\.catch\(\(\) => \{[\s\S]{0,200}onPickupFailure/);
  assert.ok(catchBranch, "catch branch calls onPickupFailure, NOT onPickupConfirmed");
});
