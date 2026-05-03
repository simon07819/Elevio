/**
 * Manual full dropoff allowed — targeted tests.
 *
 * Bug: when manual_full=ON and no boarded passengers, the brain returned
 * idle_blocked with the message "Cabine pleine ou groupe trop grand :
 * déposer d'abord". This was misleading — the elevator might be empty
 * (0 passengers), the operator is "full" because of material/tools/garbage.
 * The operator thought dropoffs were also blocked.
 *
 * In reality, dropoffs ARE allowed when boarded passengers exist — the
 * brain correctly recommends them. The issue was only the misleading
 * message in the wait state.
 *
 * Fix: add idle_manual_full reason kind, distinct from idle_blocked.
 * When manual_full=ON and there are open requests but no pickups possible,
 * return idle_manual_full instead of idle_blocked. The UI shows a specific
 * message: "Mode PLEIN actif : ramassages suspendus. Déposer les
 * passagers embarqués, puis cliquer Reprendre pour reprendre les
 * ramassages."
 *
 * Tests:
 * 1. manual_full ON -> no pickup recommended
 * 2. manual_full ON with boarded -> dropoff still recommended
 * 3. manual_full ON, no boarded -> idle_manual_full (not idle_blocked)
 * 4. After Reprendre (manual_full OFF) -> pickups resume
 * 5. Boarded passengers remain visible during manual_full
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

function mkElev(floorId: string, dir: Direction, load: number, cap: number, mf: boolean) {
  return {
    id: "e1", project_id: "p", name: "E1", current_floor_id: floorId,
    direction: dir, capacity: cap, current_load: load, active: true,
    operator_session_id: "s1", operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z", operator_user_id: null,
    manual_full: mf,
  };
}

// ---------------------------------------------------------------------------
// 1. manual_full ON -> no pickup recommended
// ---------------------------------------------------------------------------
test("full-dropoff: manual_full ON blocks all pickups", () => {
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", "idle", 0, 15, true),
    assignedRequests: enrichDispatchRequests([mkReq("r1", "5", "13", 5, 1)], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.requestsToPickup.length, 0, "no pickups when manual_full ON");
  assert.equal(result.primaryPickupRequestId, null);
});

// ---------------------------------------------------------------------------
// 2. manual_full ON with boarded -> dropoff still recommended
// ---------------------------------------------------------------------------
test("full-dropoff: dropoff recommended when boarded passengers exist", () => {
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
  assert.ok(result.requestsToDropoff.length > 0, "at least one dropoff");
  assert.equal(result.requestsToPickup.length, 0, "no pickups");
});

// ---------------------------------------------------------------------------
// 3. manual_full ON, no boarded -> idle_manual_full (not idle_blocked)
// ---------------------------------------------------------------------------
test("full-dropoff: idle_manual_full reason when manual_full ON without boarded", () => {
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", "idle", 0, 15, true),
    assignedRequests: enrichDispatchRequests([mkReq("r1", "5", "13", 5, 1)], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.reasonDetail?.kind, "idle_manual_full", "not idle_blocked when manual_full ON");
  assert.equal(result.action, "wait");
});

// ---------------------------------------------------------------------------
// 4. After Reprendre (manual_full OFF) -> pickups resume
// ---------------------------------------------------------------------------
test("full-dropoff: pickups resume when manual_full OFF", () => {
  const result = computeNextOperatorAction({
    elevator: mkElev("rdc", "idle", 0, 15, false),
    assignedRequests: enrichDispatchRequests([mkReq("r1", "5", "13", 5, 1)], floors),
    onboardPassengers: [],
    projectFloors: floors,
  });
  assert.equal(result.action, "pickup", "pickup recommended when manual_full OFF");
  assert.ok(result.primaryPickupRequestId !== null);
});

// ---------------------------------------------------------------------------
// 5. Boarded passengers remain visible during manual_full (type check)
// ---------------------------------------------------------------------------
test("full-dropoff: idle_manual_full exists in DispatchRecommendationReason type", () => {
  const types = readFileSync(join(root, "types/hoist.ts"), "utf8");
  assert.match(types, /idle_manual_full/);
  // UI handles idle_manual_full distinctly from idle_blocked
  const component = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
  assert.match(component, /idle_manual_full/);
});
