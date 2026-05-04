/**
 * State synchronization hardening tests.
 *
 * Validates:
 * 1. resolveRequestState: boarded => dropoff (never pickup)
 * 2. resolveRequestState: pending/assigned/arriving => pickup
 * 3. resolveRequestState: completed/cancelled => none
 * 4. statusPriority: boarded > pending/assigned/arriving
 * 5. merge: poll pending cannot overwrite boarded
 * 6. merge: realtime assigned cannot overwrite boarded
 * 7. boarded NEVER displays Ramasser/pickup
 * 8. completed/cancelled displays no button
 * 9. Libérer never deletes boarded/onboard
 * 10. PLEIN never deletes boarded/onboard
 * 11. clearVisibleQueue spares boarded requests
 * 12. Back/forward re-syncs from DB (pageshow)
 * 13. Ramasser then refresh => bouton Déposer
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  statusPriority,
  isTerminalStatus,
  isOnboard,
  isAwaitingPickup,
  resolveRequestState,
  resolveOperatorAction,
  resolveMerge,
} from "../lib/stateResolution";
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

// ── 1. resolveRequestState: boarded => dropoff ────────────────────────────
test("resolveRequestState: boarded => dropoff (never pickup)", () => {
  const r = resolveRequestState(mkReq("r1", "boarded"));
  assert.equal(r.action, "dropoff");
  assert.equal(r.onboard, true);
  assert.equal(r.terminal, false);
  assert.equal(r.active, true);
});

// ── 2. resolveRequestState: pending/assigned/arriving => pickup ──────────
test("resolveRequestState: pending => pickup", () => {
  assert.equal(resolveRequestState(mkReq("r1", "pending")).action, "pickup");
  assert.equal(resolveRequestState(mkReq("r1", "assigned")).action, "pickup");
  assert.equal(resolveRequestState(mkReq("r1", "arriving")).action, "pickup");
});

// ── 3. resolveRequestState: completed/cancelled => none ──────────────────
test("resolveRequestState: completed/cancelled => none", () => {
  assert.equal(resolveRequestState(mkReq("r1", "completed")).action, "none");
  assert.equal(resolveRequestState(mkReq("r1", "cancelled")).action, "none");
  assert.equal(resolveRequestState(mkReq("r1", "completed")).terminal, true);
  assert.equal(resolveRequestState(mkReq("r1", "cancelled")).terminal, true);
  assert.equal(resolveRequestState(mkReq("r1", "completed")).active, false);
  assert.equal(resolveRequestState(mkReq("r1", "cancelled")).active, false);
});

// ── 4. statusPriority: boarded > pending/assigned/arriving ──────────────
test("statusPriority: boarded (3) > assigned (2) > pending (1)", () => {
  assert.ok(statusPriority("boarded") > statusPriority("arriving"));
  assert.ok(statusPriority("boarded") > statusPriority("assigned"));
  assert.ok(statusPriority("boarded") > statusPriority("pending"));
  assert.ok(statusPriority("assigned") >= statusPriority("arriving"));
  assert.ok(statusPriority("completed") === statusPriority("cancelled"));
  assert.ok(statusPriority("completed") > statusPriority("boarded"));
});

// ── 5. merge: poll pending cannot overwrite boarded ─────────────────────
test("merge: poll pending cannot overwrite boarded", () => {
  const existing = mkReq("r1", "boarded", "2026-05-01T12:01:00.000Z");
  const incoming = mkReq("r1", "pending", "2026-05-01T12:02:00.000Z");
  const result = mergeOperatorPollRequest(existing, incoming);
  assert.equal(result.status, "boarded");
});

// ── 6. merge: realtime assigned cannot overwrite boarded ────────────────
test("merge: realtime assigned cannot overwrite boarded", () => {
  const current = [mkReq("r1", "boarded", "2026-05-01T12:01:00.000Z")];
  const payload: RequestRealtimePayload = {
    eventType: "UPDATE",
    new: mkReq("r1", "assigned", "2026-05-01T12:02:00.000Z"),
    old: { id: "r1" },
  };
  const result = mergeRealtimeRequest(current, payload);
  assert.equal(result[0].status, "boarded");
});

// ── 7. boarded NEVER displays Ramasser/pickup ───────────────────────────
test("resolveRequestState: boarded never shows pickup action", () => {
  const statuses: RequestStatus[] = ["pending", "assigned", "arriving", "boarded", "completed", "cancelled"];
  for (const status of statuses) {
    const resolved = resolveRequestState(mkReq("r1", status));
    if (status === "boarded") {
      assert.notEqual(resolved.action, "pickup", `boarded must never show pickup, got ${resolved.action}`);
      assert.equal(resolved.action, "dropoff", `boarded must show dropoff`);
    }
  }
});

// ── 8. completed/cancelled displays no button ───────────────────────────
test("resolveOperatorAction: completed/cancelled => none", () => {
  assert.equal(resolveOperatorAction([{ status: "completed" }]), "none");
  assert.equal(resolveOperatorAction([{ status: "cancelled" }]), "none");
  assert.equal(resolveOperatorAction([]), "none");
});

// ── 9. Libérer: zero operators cancels ALL including boarded ──────────────────────
test("Libérer: cancelActiveProjectRequestsIfNoLiveOperators cancels ALL including boarded", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/actions.ts"), "utf-8");
  // When no operators are active, ALL non-terminal requests are cancelled,
  // including boarded — because boarded passengers can't be dropped off without an operator.
  assert.ok(src.includes('cancellableStatuses: RequestStatus[] = ["pending", "assigned", "arriving", "boarded"]'));
  // Must reset ALL elevators when no operators are active
  assert.ok(src.includes("from(\"elevators\").update(fullReset).eq(\"project_id\", projectId)"), "all elevators reset on zero operators");
});

// ── 10. PLEIN never deletes boarded/onboard ─────────────────────────────
test("PLEIN: setElevatorManualFull does not modify request status", () => {
  const src = readFileSync(resolve(SRC_ROOT, "lib/actions.ts"), "utf-8");
  // setElevatorManualFull only updates elevators.manual_full
  const fullFn = src.match(/export async function setElevatorManualFull[\s\S]*?^}/m);
  assert.ok(fullFn, "setElevatorManualFull function found");
  const fnBody = fullFn[0];
  // Must NOT touch requests table
  assert.ok(!fnBody.includes('from("requests"'), "PLEIN must not touch requests table");
  // Must NOT set status to cancelled/completed
  assert.ok(!fnBody.includes("cancelled"), "PLEIN must not cancel requests");
});

// ── 11. clearVisibleQueue spares boarded requests ───────────────────────
test("clearVisibleQueue: spares boarded requests in client state and DB update", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/operator/OperatorDashboard.tsx"), "utf-8");
  // Client-side filter: must NOT include "boarded"
  const filterMatch = src.match(/request\.elevator_id === elevator\.id &&[\s\S]*?\(([^)]+)\)/g);
  assert.ok(filterMatch, "clearVisibleQueue filter found");
  const relevantFilter = filterMatch.find(m => m.includes("pending") && m.includes("assigned") && m.includes("arriving"));
  assert.ok(relevantFilter, "filter includes pending/assigned/arriving");
  assert.ok(!relevantFilter?.includes("boarded") || relevantFilter?.includes("!boarded"), "filter must NOT include boarded status");
  // DB update: must NOT include "boarded" in .in("status", [...])
  const dbUpdateMatch = src.match(/\.in\("status", \[([^\]]+)\]\)/g);
  assert.ok(dbUpdateMatch, "DB update .in() found");
  // Find the clearVisibleQueue DB update specifically
  const clearDbUpdate = src.match(/clearVisibleQueue[\s\S]*?\.in\("status", \[([^\]]+)\]\)/);
  assert.ok(clearDbUpdate, "clearVisibleQueue DB update found");
  assert.ok(!clearDbUpdate[1].includes("boarded"), "DB update must NOT include boarded");
});

// ── 12. Back/forward re-syncs from DB (pageshow handler) ───────────────
test("Back/forward: pageshow handler re-syncs from SSR props", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/operator/OperatorDashboard.tsx"), "utf-8");
  assert.ok(src.includes("pageshow"), "pageshow event listener present");
  assert.ok(src.includes("event.persisted"), "bfcache check present");
  assert.ok(src.includes("mergeRequestsPropIntoLive"), "re-merge from props on bfcache");
});

test("Back/forward: visibilitychange handler re-syncs from SSR props", () => {
  const src = readFileSync(resolve(SRC_ROOT, "components/operator/OperatorDashboard.tsx"), "utf-8");
  assert.ok(src.includes("visibilitychange"), "visibilitychange event listener present");
  assert.ok(src.includes('visibilityState === "visible"'), "visibility check present");
});

// ── 13. Ramasser then refresh => bouton Déposer ─────────────────────────
test("Ramasser+refresh: resolveRequestState confirms boarded => dropoff", () => {
  // After Ramasser, request status = "boarded" in DB
  // After refresh, SSR returns "boarded" status
  // resolveRequestState must return "dropoff"
  const afterPickup = mkReq("r1", "boarded");
  const resolved = resolveRequestState(afterPickup);
  assert.equal(resolved.action, "dropoff");
  assert.equal(resolved.onboard, true);
  // Must NOT be pickup
  assert.notEqual(resolved.action, "pickup");
});

// ── Additional: resolveMerge respects priority ──────────────────────────
test("resolveMerge: higher priority status always wins", () => {
  // boarded > assigned
  const r1 = resolveMerge(mkReq("r1", "assigned"), mkReq("r1", "boarded"));
  assert.equal(r1.status, "boarded");

  // boarded > pending (even if pending has newer timestamp)
  const r2 = resolveMerge(
    mkReq("r1", "boarded", "2026-05-01T12:01:00.000Z"),
    mkReq("r1", "pending", "2026-05-01T12:02:00.000Z"),
  );
  assert.equal(r2.status, "boarded");

  // completed > boarded (terminal wins over non-terminal)
  const r3 = resolveMerge(
    mkReq("r1", "boarded", "2026-05-01T12:01:00.000Z"),
    mkReq("r1", "completed", "2026-05-01T12:00:00.000Z"),
  );
  assert.equal(r3.status, "completed");

  // pending < arriving (same priority group, newer timestamp wins)
  const r4 = resolveMerge(
    mkReq("r1", "pending", "2026-05-01T12:00:00.000Z"),
    mkReq("r1", "assigned", "2026-05-01T12:01:00.000Z"),
  );
  assert.equal(r4.status, "assigned");
});

// ── Additional: resolveMerge for undefined existing ─────────────────────
test("resolveMerge: undefined existing returns incoming", () => {
  const incoming = mkReq("r1", "pending");
  const result = resolveMerge(undefined, incoming);
  assert.equal(result.status, "pending");
});

// ── Additional: isOnboard, isAwaitingPickup, isTerminalStatus ───────────
test("isOnboard/isAwaitingPickup/isTerminalStatus: all statuses classified", () => {
  assert.ok(isOnboard("boarded"));
  assert.ok(!isOnboard("pending"));
  assert.ok(!isOnboard("completed"));

  assert.ok(isAwaitingPickup("pending"));
  assert.ok(isAwaitingPickup("assigned"));
  assert.ok(isAwaitingPickup("arriving"));
  assert.ok(!isAwaitingPickup("boarded"));
  assert.ok(!isAwaitingPickup("completed"));

  assert.ok(isTerminalStatus("completed"));
  assert.ok(isTerminalStatus("cancelled"));
  assert.ok(!isTerminalStatus("boarded"));
  assert.ok(!isTerminalStatus("pending"));
});

// ── Additional: resolveOperatorAction prefers dropoff over pickup ───────
test("resolveOperatorAction: dropoff takes priority when both boarded and pending exist", () => {
  const action = resolveOperatorAction([
    { status: "pending" },
    { status: "boarded" },
  ]);
  assert.equal(action, "dropoff", "when boarded passengers exist, action must be dropoff");
});
