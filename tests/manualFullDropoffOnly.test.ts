/**
 * Manual full as dropoff-only mode — targeted tests.
 *
 * Product rule: "Plein" (manual_full) is NOT about passenger count.
 * It's a manual override meaning "I can't pick up anyone (material,
 * tools, garbage in the elevator), but I can still drop off people
 * already aboard."
 *
 * Expected:
 * - manual_full ON: accept new demands, show them, block ALL pickups,
 *   recommend only dropoffs, mode stays ON after dropoff
 * - manual_full OFF: pickups resume for pending demands
 * - Demands created during manual_full don't disappear
 *
 * Tests:
 * 1. manual_full ON → new demand accepted (brain sees it)
 * 2. manual_full ON → demand visible in terminal (no filter on visibility)
 * 3. manual_full ON → no pickup recommended (idleCapacityOk empty)
 * 4. manual_full ON → pickup button blocked (fallback blocked by manual_full)
 * 5. manual_full ON → dropoff still recommended/available
 * 6. manual_full stays ON after dropoff
 * 7. manual_full OFF → pickups resume for pending demands
 * 8. Demands created during manual_full don't disappear
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { computeNextOperatorAction, enrichDispatchRequests } from "../services/elevatorBrain";
import type { Direction, RequestStatus } from "../types/hoist";

const root = process.cwd();

const floors = [
  { id: "rdc", project_id: "p", label: "RDC", sort_order: 0, qr_token: "x", access_code: "x", active: true },
  { id: "5", project_id: "p", label: "5", sort_order: 5, qr_token: "x", access_code: "x", active: true },
  { id: "13", project_id: "p", label: "13", sort_order: 13, qr_token: "x", access_code: "x", active: true },
];

function mkReq(id: string, from: string, to: string, count: number, seq: number, status?: string) {
  const fromSort = floors.find((f) => f.id === from)!.sort_order;
  const toSort = floors.find((f) => f.id === to)!.sort_order;
  return {
    id, project_id: "p", elevator_id: "e1", from_floor_id: from, to_floor_id: to,
    direction: (toSort > fromSort ? "up" : "down") as "up" | "down", passenger_count: count,
    original_passenger_count: count, remaining_passenger_count: count,
    split_required: false, priority: false, priority_reason: null, note: null,
    wait_started_at: "2026-04-30T11:55:00.000Z", status: (status || "assigned") as RequestStatus,
    sequence_number: seq, created_at: "2026-04-30T11:55:00.000Z",
    updated_at: "2026-04-30T11:55:00.000Z", completed_at: null,
  };
}

function mkElev(floorId: string, dir: Direction, load: number, cap: number, manualFull: boolean) {
  return {
    id: "e1", project_id: "p", name: "E1", current_floor_id: floorId,
    direction: dir, capacity: cap, current_load: load, active: true,
    operator_session_id: "s1", operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z", operator_user_id: null,
    manual_full: manualFull,
  };
}

// ---------------------------------------------------------------------------
// 1. manual_full ON → new demand accepted (brain sees it)
// ---------------------------------------------------------------------------
test("manual-full: brain still sees assigned requests when manual_full ON", () => {
  const assigned = enrichDispatchRequests([mkReq("r1", "rdc", "13", 5, 1)], floors);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15, true),
    assignedRequests: assigned,
    onboardPassengers: [],
    projectFloors: floors,
  });
  // Brain should NOT recommend pickup, but it should still see the requests
  assert.equal(result.requestsToPickup.length, 0, "no pickups when manual_full ON");
  // The request was enriched (not filtered out)
  assert.equal(assigned.length, 1, "request still exists in assigned list");
});

// ---------------------------------------------------------------------------
// 2. manual_full ON → demand visible in terminal (no filter on visibility)
// ---------------------------------------------------------------------------
test("manual-full: dashboard does NOT filter liveRequests by manual_full", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // elevatorRequests = liveRequests.filter(elevator_id match) — no manual_full check
  const filterLine = dashboard.match(/liveRequests\.filter\([^)]*\)/g);
  assert.ok(filterLine, "liveRequests filtered");
  // None of the filter expressions should mention manual_full
  for (const f of filterLine) {
    assert.ok(!f.includes("manual_full"), "liveRequests filter does NOT check manual_full: " + f);
  }
});

// ---------------------------------------------------------------------------
// 3. manual_full ON → no pickup recommended (idleCapacityOk empty, scoreElevator penalty)
// ---------------------------------------------------------------------------
test("manual-full: scoreElevator penalizes 5000 and marks ineligible", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  assert.match(brain, /manual_full === true \? 5000 : 0/);
  assert.match(brain, /manual_full !== true/);
});

test("manual-full: idleCapacityOk empty when manual_full ON", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // idleCapacityOk = manualFull ? [] : ...
  assert.match(brain, /idleCapacityOk = manualFull\s*\n?\s*\? \[\]/);
});

// ---------------------------------------------------------------------------
// 4. manual_full ON → pickup button blocked (fallback blocked by manual_full)
// ---------------------------------------------------------------------------
test("manual-full: fallback pickup blocked when manual_full ON in dashboard", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  // The fallback pickup condition must include !effectiveElevator.manual_full
  const fallbackMatch = dashboard.match(
    /recommendation\.requestsToDropoff\.length === 0[\s\S]{0,200}fallbackPickup[\s\S]{0,200}\)/
  );
  assert.ok(fallbackMatch, "fallback pickup condition exists");
  assert.ok(
    fallbackMatch![0].includes("!effectiveElevator.manual_full"),
    "fallback blocked by manual_full"
  );
});

// ---------------------------------------------------------------------------
// 5. manual_full ON → dropoff still recommended/available
// ---------------------------------------------------------------------------
test("manual-full: dropoff recommended when boarded passengers exist", () => {
  const boarded = enrichDispatchRequests([mkReq("b1", "rdc", "5", 4, 0, "boarded")], floors).map(
    (r) => ({
      requestId: r.id, from_floor_id: r.from_floor_id, to_floor_id: r.to_floor_id,
      from_sort_order: r.from_sort_order, to_sort_order: r.to_sort_order,
      passenger_count: r.passenger_count,
    })
  );
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "up", 4, 15, true),
    assignedRequests: enrichDispatchRequests([mkReq("r1", "rdc", "13", 5, 1)], floors),
    onboardPassengers: boarded,
    projectFloors: floors,
  });
  assert.equal(result.action, "dropoff", "dropoff recommended with manual_full ON");
  assert.ok(result.requestsToDropoff.length > 0, "at least one dropoff request");
});

// ---------------------------------------------------------------------------
// 6. manual_full stays ON after dropoff
// ---------------------------------------------------------------------------
test("manual-full: manual_full not auto-cleared by brain after dropoff", () => {
  const brain = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");
  // brain should never set manual_full=false — it only reads the field
  assert.ok(!brain.includes("manual_full = false"), "brain never sets manual_full=false");
  assert.ok(!brain.includes("manual_full=false"), "brain never sets manual_full=false");
});

// ---------------------------------------------------------------------------
// 7. manual_full OFF → pickups resume for pending demands
// ---------------------------------------------------------------------------
test("manual-full: pickups resume when manual_full OFF", () => {
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15, false),
    assignedRequests: enrichDispatchRequests([mkReq("r1", "rdc", "13", 5, 1)], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.action, "pickup", "pickup recommended when manual_full OFF");
  assert.ok(result.primaryPickupRequestId !== null, "primary pickup assigned");
});

// ---------------------------------------------------------------------------
// 8. Demands created during manual_full don't disappear
// ---------------------------------------------------------------------------
test("manual-full: new request during manual_full is visible and not picked up", () => {
  const newReq = mkReq("r3", "5", "rdc", 2, 3);
  const assigned = enrichDispatchRequests([mkReq("r1", "rdc", "13", 5, 1), newReq], floors);
  const result = computeNextOperatorAction({
    elevator: mkElev("5", "idle", 0, 15, true),
    assignedRequests: assigned,
    onboardPassengers: [],
    projectFloors: floors,
  });
  // Request still exists in assigned list
  assert.equal(assigned.length, 2, "both requests visible");
  assert.ok(assigned.some((r) => r.id === "r3"), "new request r3 still visible");
  // But no pickups recommended
  assert.equal(result.requestsToPickup.length, 0, "no pickups for new request during manual_full");
});
