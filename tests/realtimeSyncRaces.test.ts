/**
 * Realtime sync race conditions — targeted tests.
 *
 * Verifies that merge functions respect terminal statuses and updated_at
 * timestamps, preventing stale data from overwriting live state:
 * 1. mergeRealtimeRequest: completed request NOT reverted by late UPDATE
 * 2. mergeRealtimeRequest: cancelled request NOT reopened by stale realtime
 * 3. mergeRealtimeRequest: newer non-terminal update still applies
 * 4. mergeServerRequestsWithLive: stale server "boarded" does NOT overwrite local "completed"
 * 5. mergeServerRequestsWithLive: live-only rows (not in server) are preserved
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeRealtimeRequest, mergeServerRequestsWithLive, type RequestRealtimePayload } from "../lib/realtime";
import type { HoistRequest } from "../types/hoist";

function mkReq(id: string, status: string, updatedAt: string): HoistRequest {
  return {
    id, project_id: "p", elevator_id: "e1",
    from_floor_id: "rdc", to_floor_id: "5",
    direction: "up", passenger_count: 2,
    original_passenger_count: 2, remaining_passenger_count: 2,
    split_required: false, priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    status: status as HoistRequest["status"],
    sequence_number: 1,
    created_at: "2026-04-30T11:55:00.000Z",
    updated_at: updatedAt, completed_at: null,
  };
}

// ---------------------------------------------------------------------------
// 1. mergeRealtimeRequest: completed NOT reverted by late UPDATE
// ---------------------------------------------------------------------------
test("realtime: completed request NOT reverted by late realtime UPDATE", () => {
  const current = [mkReq("r1", "completed", "2026-04-30T12:01:00.000Z")];
  const payload: RequestRealtimePayload = {
    eventType: "UPDATE",
    new: mkReq("r1", "boarded", "2026-04-30T12:00:30.000Z"),
    old: { id: "r1" },
  };
  const result = mergeRealtimeRequest(current, payload);
  assert.equal(result[0].status, "completed");
});

// ---------------------------------------------------------------------------
// 2. mergeRealtimeRequest: cancelled NOT reopened by stale realtime
// ---------------------------------------------------------------------------
test("realtime: cancelled request NOT reopened by stale realtime", () => {
  const current = [mkReq("r1", "cancelled", "2026-04-30T12:02:00.000Z")];
  const payload: RequestRealtimePayload = {
    eventType: "UPDATE",
    new: mkReq("r1", "assigned", "2026-04-30T12:00:00.000Z"),
    old: { id: "r1" },
  };
  const result = mergeRealtimeRequest(current, payload);
  assert.equal(result[0].status, "cancelled");
});

// ---------------------------------------------------------------------------
// 3. mergeRealtimeRequest: newer non-terminal update still applies
// ---------------------------------------------------------------------------
test("realtime: newer non-terminal update still applies over older non-terminal", () => {
  const current = [mkReq("r1", "assigned", "2026-04-30T12:00:00.000Z")];
  const payload: RequestRealtimePayload = {
    eventType: "UPDATE",
    new: mkReq("r1", "boarded", "2026-04-30T12:01:00.000Z"),
    old: { id: "r1" },
  };
  const result = mergeRealtimeRequest(current, payload);
  assert.equal(result[0].status, "boarded");
});

// ---------------------------------------------------------------------------
// 4. mergeServerRequestsWithLive: stale server "boarded" does NOT overwrite local "completed"
// ---------------------------------------------------------------------------
test("realtime: stale server data does NOT overwrite local terminal status", () => {
  const live = [mkReq("r1", "completed", "2026-04-30T12:01:00.000Z")];
  const server = [mkReq("r1", "boarded", "2026-04-30T12:00:30.000Z")];
  const result = mergeServerRequestsWithLive(live, server);
  assert.equal(result[0].status, "completed");
});

// ---------------------------------------------------------------------------
// 5. mergeServerRequestsWithLive: live-only rows preserved
// ---------------------------------------------------------------------------
test("realtime: live-only rows (not in server snapshot) are preserved", () => {
  const live = [
    mkReq("r1", "assigned", "2026-04-30T12:00:00.000Z"),
    mkReq("r2", "assigned", "2026-04-30T12:01:00.000Z"),
  ];
  const server = [mkReq("r1", "assigned", "2026-04-30T12:00:00.000Z")];
  const result = mergeServerRequestsWithLive(live, server);
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.id === "r2"), "live-only r2 preserved");
});
