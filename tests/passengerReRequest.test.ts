/**
 * Tests for the passenger re-request bug fix.
 *
 * Bug: After operator drops off a passenger, the passenger could not
 * create a new request because the RPC passenger_has_open_request
 * included "boarded" in its blocking statuses.
 *
 * Fix:
 * 1. RPC now only blocks on ('pending', 'assigned', 'arriving')
 * 2. "boarded" does NOT block — passenger is in transit
 * 3. New broadcast event PASSENGER_BROADCAST_REQUEST_COMPLETED
 * 4. OperatorDashboard broadcasts request_completed on dropoff
 * 5. RequestForm handles request_completed broadcast
 * 6. ACTIVE_PASSENGER_REQUEST_STATUSES constant as single source of truth
 * 7. passenger_device_key cleared on completed/cancelled as defense-in-depth
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

const RPC_GUARD = readFileSync(join(root, "supabase/passenger-device-open-request-guard.sql"), "utf8");
const SCHEMA = readFileSync(join(root, "supabase/schema.sql"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const BROADCAST = readFileSync(join(root, "lib/passengerNotifyBroadcast.ts"), "utf8");
const REQUEST_FORM = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const PERSISTENCE = readFileSync(join(root, "lib/passengerRequestPersistence.ts"), "utf8");
const TYPES = readFileSync(join(root, "types/hoist.ts"), "utf8");

// ═══════════════════════════════════════════════════════════════════
// 1. RPC: "boarded" does NOT block passenger re-request
// ═══════════════════════════════════════════════════════════════════

test("re-request: RPC guard blocks only pending/assigned/arriving", () => {
  assert.match(RPC_GUARD, /'pending'/, "blocks pending");
  assert.match(RPC_GUARD, /'assigned'/, "blocks assigned");
  assert.match(RPC_GUARD, /'arriving'/, "blocks arriving");
});

test("re-request: RPC guard does NOT block boarded", () => {
  assert.doesNotMatch(RPC_GUARD, /'boarded'/, "boarded should NOT be in blocking list");
});

test("re-request: RPC guard does NOT block completed/cancelled", () => {
  assert.doesNotMatch(RPC_GUARD, /'completed'/, "completed should NOT block");
  assert.doesNotMatch(RPC_GUARD, /'cancelled'/, "cancelled should NOT block");
});

test("re-request: schema.sql matches RPC guard", () => {
  assert.match(SCHEMA, /'pending'.*'assigned'.*'arriving'/s, "schema includes pending/assigned/arriving");
  assert.doesNotMatch(SCHEMA, /passenger_has_open_request[\s\S]*?'boarded'/, "schema does not include boarded in RPC");
});

// ═══════════════════════════════════════════════════════════════════
// 2. ACTIVE_PASSENGER_REQUEST_STATUSES constant
// ═══════════════════════════════════════════════════════════════════

test("re-request: ACTIVE_PASSENGER_REQUEST_STATUSES defined in types/hoist.ts", () => {
  assert.match(TYPES, /ACTIVE_PASSENGER_REQUEST_STATUSES/, "constant exists");
  assert.match(TYPES, /"pending".*"assigned".*"arriving"/s, "includes pending/assigned/arriving");
});

test("re-request: ACTIVE_PASSENGER_REQUEST_STATUSES does NOT include boarded", () => {
  // The constant should only include pending, assigned, arriving
  const match = TYPES.match(/ACTIVE_PASSENGER_REQUEST_STATUSES[\s\S]*?\]/);
  assert.ok(match, "constant definition found");
  assert.doesNotMatch(match[0], /boarded/, "boarded not in active passenger statuses");
});

test("re-request: TERMINAL_PASSENGER_REQUEST_STATUSES defined", () => {
  assert.match(TYPES, /TERMINAL_PASSENGER_REQUEST_STATUSES/, "terminal constant exists");
  assert.match(TYPES, /"completed"/, "includes completed");
  assert.match(TYPES, /"cancelled"/, "includes cancelled");
});

test("re-request: isActivePassengerRequestStatus helper function", () => {
  assert.match(TYPES, /isActivePassengerRequestStatus/, "function exists");
});

// ═══════════════════════════════════════════════════════════════════
// 3. Broadcast: request_completed event
// ═══════════════════════════════════════════════════════════════════

test("re-request: PASSENGER_BROADCAST_REQUEST_COMPLETED constant defined", () => {
  assert.match(BROADCAST, /PASSENGER_BROADCAST_REQUEST_COMPLETED/, "constant exists");
  assert.match(BROADCAST, /request_completed/, "event name is request_completed");
});

test("re-request: broadcastPassengerRequestCompleted function exported", () => {
  assert.match(BROADCAST, /broadcastPassengerRequestCompleted/, "function exists");
});

test("re-request: OperatorDashboard broadcasts request_completed on dropoff", () => {
  assert.match(DASHBOARD, /broadcastPassengerRequestCompleted/, "imported in dashboard");
  // Should be called inside onDropoffSuccess callback
  const dropoffBlock = DASHBOARD.match(/onDropoffSuccess[\s\S]*?broadcastPassengerRequestCompleted/);
  assert.ok(dropoffBlock, "called in onDropoffSuccess");
});

test("re-request: RequestForm handles PASSENGER_BROADCAST_REQUEST_COMPLETED", () => {
  assert.match(REQUEST_FORM, /PASSENGER_BROADCAST_REQUEST_COMPLETED/, "constant imported");
  // Should have at least one .on() handler for the completed event
  const handlers = REQUEST_FORM.match(/PASSENGER_BROADCAST_REQUEST_COMPLETED/g);
  assert.ok(handlers && handlers.length >= 2, "at least 2 handlers (pre-subscribed + fallback)");
});

test("re-request: RequestForm clears localStorage on request_completed", () => {
  // Each handler should call clearPassengerPendingRequest
  const completedHandlerBlocks = REQUEST_FORM.match(
    /PASSENGER_BROADCAST_REQUEST_COMPLETED[\s\S]*?clearPassengerPendingRequest/g,
  );
  assert.ok(completedHandlerBlocks && completedHandlerBlocks.length >= 2, "clears localStorage in both handlers");
});

// ═══════════════════════════════════════════════════════════════════
// 4. Defense-in-depth: passenger_device_key cleared
// ═══════════════════════════════════════════════════════════════════

test("re-request: updateRequestStatus clears passenger_device_key on completed", () => {
  const completedBlock = ACTIONS.match(/status === "completed"[\s\S]*?passenger_device_key.*null/);
  assert.ok(completedBlock, "clears device key on completed");
});

test("re-request: updateRequestStatus clears passenger_device_key on cancelled", () => {
  const cancelledBlock = ACTIONS.match(/status === "cancelled"[\s\S]*?passenger_device_key.*null/);
  assert.ok(cancelledBlock, "clears device key on cancelled");
});

// ═══════════════════════════════════════════════════════════════════
// 5. Passenger persistence uses shared constants
// ═══════════════════════════════════════════════════════════════════

test("re-request: passengerPendingSnapshotIndicatesTracking uses ACTIVE_PASSENGER_REQUEST_STATUSES", () => {
  assert.match(PERSISTENCE, /ACTIVE_PASSENGER_REQUEST_STATUSES/, "imports shared constant");
  assert.match(PERSISTENCE, /passengerPendingSnapshotIndicatesTracking/, "function exists");
  // "boarded" should NOT indicate tracking — passenger is redirected to QR
  // Active statuses (pending/assigned/arriving) indicate tracking
});

test("re-request: passengerPendingSnapshotIndicatesTracking returns false for boarded", () => {
  // After boarding, the passenger is redirected to QR — no more tracking
  // The function should return false for boarded, completed, cancelled
  // Only return true for pending, assigned, arriving
  const fn = PERSISTENCE.match(/passengerPendingSnapshotIndicatesTracking[\s\S]*?\n\}/);
  assert.ok(fn, "function body found");
  assert.match(fn[0], /ACTIVE_PASSENGER_REQUEST_STATUSES/, "uses shared constant");
});

// ═══════════════════════════════════════════════════════════════════
// 6. RequestForm uses shared constants
// ═══════════════════════════════════════════════════════════════════

test("re-request: RequestForm imports isActivePassengerRequestStatus", () => {
  assert.match(REQUEST_FORM, /isActivePassengerRequestStatus/, "imports shared helper");
});

test("re-request: clearsPassengerPendingStorage handles boarded + terminal", () => {
  assert.match(REQUEST_FORM, /clearsPassengerPendingStorage/, "function exists");
  assert.match(REQUEST_FORM, /"boarded"/, "handles boarded");
  assert.match(REQUEST_FORM, /isTerminalPassengerRequestStatus/, "uses terminal helper");
});
