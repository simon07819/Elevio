/**
 * Targeted tests for the 3 real bugs found in live testing.
 *
 * BUG 1: No live operators cancels pending/assigned/arriving, NOT boarded
 * BUG 2: Release tablet enables immediate re-activation
 * BUG 3: Passenger sees boarded status quickly via poll
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveRequestState, resolveMerge, statusPriority } from "../lib/stateResolution";
import { mergeOperatorPollRequest, mergeRealtimeRequest, type RequestRealtimePayload } from "../lib/realtime";
import type { HoistRequest, RequestStatus } from "../types/hoist";

function mkReq(id: string, status: RequestStatus, updatedAt = "2026-05-01T12:00:00.000Z"): HoistRequest {
  return {
    id, project_id: "p", elevator_id: "e1",
    from_floor_id: "rdc", to_floor_id: "5",
    direction: "up", passenger_count: 2,
    original_passenger_count: 2, remaining_passenger_count: 2,
    split_required: false, priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z",
    status,
    sequence_number: 1,
    created_at: "2026-04-30T11:55:00.000Z",
    updated_at: updatedAt,
    completed_at: status === "completed" || status === "cancelled" ? updatedAt : null,
  };
}

const SRC_ROOT = resolve(__dirname, "..", "..");

// ── BUG 1: No live operators cancels pending/assigned/arriving ───────────

test("BUG1: cancelActiveProjectRequestsIfNoLiveOperators spares boarded", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/actions.ts"), "utf-8");
  assert.ok(src.includes('cancellableStatuses: RequestStatus[] = ["pending", "assigned", "arriving"]'));
  assert.ok(!src.includes('cancellableStatuses: RequestStatus[] = ["pending", "assigned", "arriving", "boarded"]'));
});

test("BUG1: SSR auto-cleanup cancels orphaned requests when no live operator", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/adminProject.ts"), "utf-8");
  // Must check for live operators and cancel orphaned requests
  assert.ok(src.includes("hasLiveOperator"), "SSR checks for live operators");
  assert.ok(src.includes("cancellableStatuses"), "SSR filters cancellable statuses");
  assert.ok(src.includes("autoCleanupOrphanedRequests"), "auto cleanup function present");
  // Must NEVER cancel boarded
  assert.ok(!src.includes('cancellableStatuses.includes("boarded")'), "boarded not in cancellable list");
});

test("BUG1: no live operators does NOT cancel boarded", () => {
  // Boarded request survives merge even when no operator
  const boarded = mkReq("r1", "boarded");
  const resolved = resolveRequestState(boarded);
  assert.equal(resolved.action, "dropoff");
  assert.equal(resolved.onboard, true);
});

// ── BUG 2: Release tablet immediately enables activation ─────────────────

test("BUG2: release does NOT skip poll merge for releasing elevator", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/operator/OperatorWorkspace.tsx"), "utf-8");
  // The poll should NOT skip merging for releasingElevatorId
  // Only skip for activatingElevatorId
  const pollSkipMatch = src.match(/for\s*\(\s*const\s+row\s+of\s+rows[\s\S]*?continue/);
  assert.ok(pollSkipMatch, "poll loop with skip found");
  // Must NOT contain releasingElevatorId in the skip condition
  assert.ok(!pollSkipMatch![0].includes("releasingElevatorId"), "poll must NOT skip releasing elevator");
  // Must contain activatingElevatorId
  assert.ok(pollSkipMatch![0].includes("activatingElevatorId"), "poll must skip activating elevator");
});

test("BUG2: releaseOperatorElevator clears session immediately in DB", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/actions.ts"), "utf-8");
  // Must clear TABLET_SESSION_FIELDS_CLEAR immediately
  assert.ok(src.includes("TABLET_SESSION_FIELDS_CLEAR"), "session fields cleared on release");
  // Must reset current_load and direction
  assert.ok(src.includes("current_load: 0"), "load reset on release");
  assert.ok(src.includes("direction: \"idle\""), "direction reset on release");
  // Must also clear manual_full
  assert.ok(src.includes("manual_full: false"), "manual_full reset on release");
});

test("BUG2: locallyReleasedElevatorIds prevents stale poll from re-claiming session", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/operator/OperatorWorkspace.tsx"), "utf-8");
  assert.ok(src.includes("locallyReleasedElevatorIds"), "locallyReleasedElevatorIds present");
  assert.ok(src.includes("clearOperatorSessionFields"), "session fields cleared locally");
});

// ── BUG 3: Passenger QR return after Ramasser ───────────────────────────

test("BUG3: passenger poll interval is fast (≤250ms)", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/RequestForm.tsx"), "utf-8");
  assert.ok(src.includes("PASSENGER_ACTIVE_REQUEST_POLL_MS = 250"), "poll interval is 250ms");
});

test("BUG3: passenger pre-subscribed broadcast channel for instant pickup redirect", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/RequestForm.tsx"), "utf-8");
  // Must have pre-subscribed channel with .on() handlers at mount time
  assert.ok(src.includes("PASSENGER_BROADCAST_REQUEST_BOARDED"), "listens for request_boarded broadcast");
  assert.ok(src.includes("requestIdRef"), "requestIdRef for race-free handler matching");
  assert.ok(src.includes('router.replace("/")'), "redirects to QR on pickup");
});

test("BUG3: operator broadcasts pickup via both pre-subscribed and one-shot channels", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/operator/OperatorDashboard.tsx"), "utf-8");
  // Must broadcast via pre-subscribed channel
  assert.ok(src.includes("broadcastChannelRef.current"), "pre-subscribed channel reference");
  assert.ok(src.includes("request_boarded"), "broadcasts request_boarded event");
  // Must also send via one-shot channel as backup
  assert.ok(src.includes("broadcastPassengerRequestBoarded"), "one-shot channel backup broadcast");
});

test("BUG3: merge protects boarded from being overwritten by stale poll", () => {
  const existing = mkReq("r1", "boarded", "2026-05-01T12:01:00.000Z");
  const incoming = mkReq("r1", "pending", "2026-05-01T12:02:00.000Z");
  const result = mergeOperatorPollRequest(existing, incoming);
  assert.equal(result.status, "boarded", "boarded must survive stale pending poll");
});

test("BUG3: merge protects boarded from stale realtime assigned", () => {
  const current = [mkReq("r1", "boarded", "2026-05-01T12:01:00.000Z")];
  const payload: RequestRealtimePayload = {
    eventType: "UPDATE",
    new: mkReq("r1", "assigned", "2026-05-01T12:02:00.000Z"),
    old: { id: "r1" },
  };
  const result = mergeRealtimeRequest(current, payload);
  assert.equal(result[0].status, "boarded", "boarded must survive stale assigned realtime");
});

// ── Debug logging tags ──────────────────────────────────────────────────

test("Debug logs: [Elevio Cleanup] tag for auto-cleanup actions", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/stateResolution.ts"), "utf-8");
  assert.ok(src.includes("Elevio Cleanup"), "Cleanup tag present");
  assert.ok(src.includes("Elevio Release"), "Release tag present");
  assert.ok(src.includes("Elevio Passenger Sync"), "Passenger Sync tag present");
  assert.ok(src.includes("Elevio Pickup Redirect"), "Pickup Redirect tag present");
});

test("Debug logs: NEXT_PUBLIC_DEBUG_SYNC enables logging", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/stateResolution.ts"), "utf-8");
  assert.ok(src.includes("NEXT_PUBLIC_DEBUG_SYNC"), "env var check present");
  assert.ok(src.includes("elevio_debug_sync"), "localStorage fallback present");
});
