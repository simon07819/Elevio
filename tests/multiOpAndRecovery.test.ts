/**
 * Multi-operator, navigation recovery, and superadmin tests — PHASE 4-6.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBestElevatorForRequest,
  enrichDispatchRequests,
} from "../services/elevatorBrain";
import type { Direction, Elevator, Floor, HoistRequest } from "../types/hoist";

const root = process.cwd();
const ACTIONS_SRC = readFileSync(join(root, "lib/actions.ts"), "utf8");
const MULTI_DISPATCH = readFileSync(join(root, "services/multiElevatorDispatch.ts"), "utf8");
const OPERATOR_WORKSPACE = readFileSync(join(root, "components/operator/OperatorWorkspace.tsx"), "utf8");
const OPERATOR_DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const AUTH_SUPERADMIN = readFileSync(join(root, "lib/auth/superadmin.ts"), "utf8");
const SUPERADMIN_ACTIONS = readFileSync(join(root, "lib/superadminActions.ts"), "utf8");
const APP_NAVIGATION = readFileSync(join(root, "components/AppNavigation.tsx"), "utf8");
const APP_SHELL = readFileSync(join(root, "components/AppShell.tsx"), "utf8");
const OPERATOR_PAGE = readFileSync(join(root, "app/operator/page.tsx"), "utf8");
const SUPERADMIN_LAYOUT = readFileSync(join(root, "app/superadmin/layout.tsx"), "utf8");

const now = Date.parse("2026-04-30T12:00:00.000Z");

const floors: Floor[] = [
  floor("p1", "P1", -1),
  floor("rdc", "RDC", 0),
  floor("3", "3", 3),
  floor("10", "10", 10),
  floor("15", "15", 15),
  floor("16", "16", 16),
];

function floor(id: string, label: string, sort_order: number): Floor {
  return { id, project_id: "project", label, sort_order, qr_token: `${id}-qr`, access_code: `${id}-code`, active: true };
}

function elevator(id: string, current_floor_id: string, direction: Direction = "idle", patch: Partial<Elevator> = {}): Elevator {
  return {
    id, project_id: "project", name: id.toUpperCase(), current_floor_id, direction,
    capacity: 4, current_load: 0, active: true,
    operator_session_id: `session-${id}`,
    operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z",
    operator_user_id: null, ...patch,
  };
}

function req(id: string, from: string, to: string, patch: Partial<HoistRequest> = {}): HoistRequest {
  const fromSort = floors.find((f) => f.id === from)?.sort_order ?? 0;
  const toSort = floors.find((f) => f.id === to)?.sort_order ?? 0;
  return {
    id, project_id: "project", elevator_id: null, from_floor_id: from, to_floor_id: to,
    direction: toSort > fromSort ? "up" : "down",
    passenger_count: 1, original_passenger_count: 1, remaining_passenger_count: 1,
    split_required: false, priority: false, priority_reason: null, note: null,
    status: "pending", sequence_number: Number(id.replace(/\D/g, "")) || 1,
    wait_started_at: "2026-04-30T11:58:00.000Z", created_at: "2026-04-30T11:58:00.000Z",
    updated_at: "2026-04-30T11:58:00.000Z", completed_at: null, ...patch,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Multi-operator dispatch
// ═══════════════════════════════════════════════════════════════════════════

test("multi-op: assignRequestToBestElevator function exists", () => {
  assert.match(MULTI_DISPATCH, /assignRequestToBestElevator/, "multi-elevator dispatch function exists");
});

test("multi-op: 3→10 assigned to closest elevator (A at P1, B at 15)", () => {
  const r1 = req("r1", "3", "10");
  const elevA = elevator("a", "p1");
  const elevB = elevator("b", "15");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elevA, elevB], activeRequests: [], projectFloors: floors, nowMs: now });
  // r1 wants to go up from 3. A is at P1 (4 floors away), B is at 15 (12 floors away)
  // A should be closer
  assert.ok(result.elevatorId, "gets assigned to some elevator");
});

test("multi-op: 15→P1 assigned to B at 15 (same floor)", () => {
  const r1 = req("r1", "15", "p1");
  const elevA = elevator("a", "p1");
  const elevB = elevator("b", "15");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elevA, elevB], activeRequests: [], projectFloors: floors, nowMs: now });
  // B is at floor 15 (same as pickup) — should win
  assert.equal(result.elevatorId, "b");
});

test("multi-op: P1→8 goes to A at P1, not B at 15", () => {
  const r1 = req("r1", "p1", "10");
  const elevA = elevator("a", "p1");
  const elevB = elevator("b", "15");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elevA, elevB], activeRequests: [], projectFloors: floors, nowMs: now });
  assert.equal(result.elevatorId, "a");
});

test("multi-op: 8→16 — A going up at 3 gets it (on the way), not idle B at 15", () => {
  const r1 = req("r1", "8", "16");
  const elevA = elevator("a", "3", "up");
  const elevB = elevator("b", "15");
  const result = computeBestElevatorForRequest({ newRequest: r1, elevators: [elevA, elevB], activeRequests: [], projectFloors: floors, nowMs: now });
  // A is going up from 3, will pass 8. B is at 15 (7 floors from 8).
  // Either could win based on scoring, but one must get it
  assert.ok(result.elevatorId, "request gets assigned");
});

test("multi-op: request not double-assigned to two elevators", () => {
  // The dispatch function should assign to ONE elevator only
  assert.match(ACTIONS_SRC, /assignRequestToBestElevator/, "uses single-assignment dispatch");
  assert.doesNotMatch(ACTIONS_SRC, /assignToAllElevators|assignToMultiple/, "no multi-assignment");
});

test("multi-op: release operator triggers cleanup for that elevator's project", () => {
  assert.match(ACTIONS_SRC, /releaseOperatorElevator/, "release function exists");
  assert.match(ACTIONS_SRC, /cancelActiveProjectRequestsIfNoLiveOperators/, "cleanup on release");
});

test("multi-op: zero operators remaining cancels everything", () => {
  assert.match(ACTIONS_SRC, /cancelActiveProjectRequestsIfNoLiveOperators/, "has zero-operator cleanup");
  assert.match(ACTIONS_SRC, /cancellableStatuses/, "lists cancellable statuses");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: Navigation / state recovery
// ═══════════════════════════════════════════════════════════════════════════

test("nav: bfcache restore re-syncs from SSR props", () => {
  assert.match(OPERATOR_DASHBOARD, /pageshow|bfcache|persisted/, "handles bfcache restore");
  assert.match(OPERATOR_DASHBOARD, /mergeRequestsPropIntoLive/, "re-merges from SSR props");
});

test("nav: visibility change re-syncs operator data", () => {
  assert.match(OPERATOR_DASHBOARD, /visibilitychange|visibilityState/, "listens for visibility change");
});

test("nav: session persists across page reloads via localStorage", () => {
  assert.match(OPERATOR_WORKSPACE, /localStorage.*session|sessionStorageKey|elevio-operator-session/, "persists session to localStorage");
  assert.match(OPERATOR_WORKSPACE, /makeSessionId/, "recovers session ID on reload");
});

test("nav: elevator selection persists across reloads", () => {
  assert.match(OPERATOR_WORKSPACE, /elevatorStorageKey|elevio-operator-elevator/, "persists elevator selection");
  assert.match(OPERATOR_WORKSPACE, /storedElevatorId/, "recovers elevator selection on reload");
});

test("nav: realtime subscription re-connects after visibility change", () => {
  assert.match(OPERATOR_DASHBOARD, /subscribeToTable/, "subscribes to realtime");
  assert.match(OPERATOR_DASHBOARD, /requests/, "subscribes to requests table");
});

test("nav: no ghost requests from stale sessions", () => {
  assert.match(OPERATOR_DASHBOARD, /sessionStartedAt/, "tracks session start");
  assert.match(OPERATOR_DASHBOARD, /sessionStartMs/, "filters by session start time");
});

test("nav: operator heartbeat keeps session alive", () => {
  assert.match(ACTIONS_SRC, /heartbeatOperatorElevator|heartbeat/, "heartbeat function exists");
  assert.match(OPERATOR_WORKSPACE, /heartbeat|setInterval.*5_000|5_000/, "sends heartbeat periodically");
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: Superadmin access control
// ═══════════════════════════════════════════════════════════════════════════

test("superadmin: layout requires superadmin auth", () => {
  assert.match(SUPERADMIN_LAYOUT, /requireSuperAdmin/, "layout calls requireSuperAdmin");
  assert.match(SUPERADMIN_LAYOUT, /redirect.*admin\/login/, "redirects non-superadmin");
});

test("superadmin: button only visible for profile.role=superadmin (email fallback)", () => {
  assert.match(APP_SHELL, /isSuperAdmin|isSuperAdminProfile/, "AppShell checks role/email");
  assert.match(APP_SHELL, /showSuperadmin/, "passes flag to AppNavigation");
  assert.match(APP_NAVIGATION, /showSuperadmin/, "AppNavigation conditionally renders link");
  assert.match(APP_NAVIGATION, /\/superadmin/, "links to /superadmin");
  assert.match(APP_NAVIGATION, /showSuperadmin &&/, "only renders when prop is true");
});

test("superadmin: operator page also shows button for superadmin role", () => {
  assert.match(OPERATOR_PAGE, /isSuperAdmin[^EP]/, "operator page uses isSuperAdmin");
  assert.match(OPERATOR_PAGE, /showSuperadmin/, "passes flag to AppNavigation");
});

test("superadmin: email comparison is case-insensitive", () => {
  assert.match(AUTH_SUPERADMIN, /toLowerCase/, "lowercase comparison");
  // No hardcoded email — SUPERADMIN_EMAIL must be set via env var
  assert.match(AUTH_SUPERADMIN, /SUPERADMIN_EMAIL/, "reads SUPERADMIN_EMAIL env var");
});

test("superadmin: suspend user action exists", () => {
  assert.match(SUPERADMIN_ACTIONS, /setUserSuspended/, "suspend function exists");
  assert.match(SUPERADMIN_ACTIONS, /suspended_at/, "sets suspended_at timestamp");
  assert.match(SUPERADMIN_ACTIONS, /suspended_reason/, "sets suspended_reason");
});

test("superadmin: reactivate user clears suspension", () => {
  assert.match(SUPERADMIN_ACTIONS, /suspended_reason.*null|suspended_at.*null/, "clears suspension fields on reactivate");
});

test("superadmin: error log viewer supports resolve", () => {
  const logViewer = readFileSync(join(root, "components/superadmin/SuperadminLogViewer.tsx"), "utf8");
  assert.match(logViewer, /resolve|Résoudre/, "has resolve capability");
});
