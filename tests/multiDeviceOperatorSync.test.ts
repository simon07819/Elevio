/**
 * BUG fix — operators shown active on other iPad when they are not.
 *
 * Root cause: mergeWithLocalClaim re-injected stale local session claim
 * even when the server had already cleared the session (released by another
 * device). The local claim was based on localStorage which persists across
 * page refreshes. After refresh, the claim was active for 15 seconds,
 * during which the operator appeared "active" on this iPad even though
 * the server showed no session.
 *
 * Also: no broadcast sent on activation, so iPad B didn't know iPad A
 * had activated an operator until the 250ms poll caught it.
 *
 * Fixes:
 * 1. mergeWithLocalClaim invalidates stale claims immediately when server
 *    shows a different session (or null) on the claimed elevator
 * 2. Broadcast on activation: OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED
 * 3. iPad B listens for ACTIVATED broadcast and refetches elevator data
 * 4. flushSync to clear stale claim before next render
 *
 * Tests:
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("multi-device: mergeWithLocalClaim invalidates stale claim when server shows different session", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const mergeIdx = ws.indexOf("mergeWithLocalClaim = useCallback");
  const mergeFn = ws.substring(mergeIdx, mergeIdx + 1500);
  assert.match(mergeFn, /claimed\.operator_session_id.*!==.*sessionId/, "detects when server has different session");
  assert.match(mergeFn, /setLocalSessionClaim.*elevatorId: null/, "clears stale claim");
  assert.match(mergeFn, /localStorage\.removeItem/, "clears localStorage on stale claim");
});

test("multi-device: stale claim invalidation uses flushSync for immediate render", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const mergeIdx = ws.indexOf("mergeWithLocalClaim = useCallback");
  const mergeFn = ws.substring(mergeIdx, mergeIdx + 2000);
  // flushSync should be called when invalidating stale claim
  const staleCheck = mergeFn.indexOf("claimed.operator_session_id && claimed.operator_session_id !== sessionId");
  if (staleCheck >= 0) {
    const afterCheck = mergeFn.substring(staleCheck, staleCheck + 400);
    assert.match(afterCheck, /flushSync/, "uses flushSync for immediate state update");
  } else {
    // Check that flushSync appears in the merge function
    assert.match(mergeFn, /flushSync/, "flushSync used in mergeWithLocalClaim");
  }
});

test("multi-device: broadcast on activation event exists", () => {
  const broadcast = readFileSync(join(root, "lib/operatorNotifyBroadcast.ts"), "utf8");
  assert.match(broadcast, /OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED/, "activation broadcast constant exists");
  assert.match(broadcast, /broadcastOperatorElevatorSessionActivated/, "activation broadcast function exists");
});

test("multi-device: activation broadcast sent after successful activation", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const activateIdx = ws.indexOf("function handleActivate");
  const activateFn = ws.substring(activateIdx, activateIdx + 4000);
  assert.match(activateFn, /broadcastOperatorElevatorSessionActivated/, "sends activation broadcast");
  assert.match(activateFn, /result\.ok/, "only sends on success");
});

test("multi-device: iPad B listens for ACTIVATED broadcast", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED/, "imported constant");
  // Just verify the file contains both broadcast events in the channel setup
  assert.match(ws, /OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED[\s\S]{0,2000}from\("elevators"\)/, "ACTIVATED listener refetches elevators");
});

test("multi-device: ACTIVATED broadcast listener refetches elevator data", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  const activatedIdx = ws.indexOf("OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED");
  // Skip past the import line to find the .on() handler
  const secondActivated = ws.indexOf("OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED", activatedIdx + 100);
  if (secondActivated >= 0) {
    const afterActivated = ws.substring(secondActivated, secondActivated + 2000);
    assert.match(afterActivated, /from\("elevators"\)/, "refetches elevator data");
    assert.match(afterActivated, /mergeWithLocalClaim/, "merges with local claim after refetch");
  } else {
    // Fallback: just verify the broadcast constant is used in a .on() handler
    assert.match(ws, /\.on\([\s\S]{0,500}OPERATOR_BROADCAST_ELEVATOR_SESSION_ACTIVATED/, "has .on() handler for ACTIVATED");
  }
});

test("multi-device: CLEARED broadcast still exists for release/deactivate", () => {
  const ws = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
  assert.match(ws, /OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED/, "cleared broadcast constant imported");
  assert.match(ws, /clearOperatorSessionFields/, "clears session fields on cleared broadcast");
});
