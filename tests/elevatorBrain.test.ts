import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBestElevatorForRequest,
  computeNextOperatorAction,
  enrichDispatchRequests,
} from "../services/elevatorBrain";
import type { Direction, Elevator, Floor, HoistRequest } from "../types/hoist";

const now = Date.parse("2026-04-30T12:00:00.000Z");

const floors: Floor[] = [
  floor("p1", "P1", -1),
  floor("rdc", "RDC", 0),
  floor("1", "1", 1),
  floor("2", "2", 2),
  floor("3", "3", 3),
  floor("4", "4", 4),
  floor("4-5", "4.5", 4.5),
  floor("5", "5", 5),
  floor("5-5", "5.5", 5.5),
  floor("6", "6", 6),
];

function floor(id: string, label: string, sort_order: number): Floor {
  return {
    id,
    project_id: "project",
    label,
    sort_order,
    qr_token: `${id}-qr`,
    access_code: `${id}-code`,
    active: true,
  };
}

function elevator(id: string, current_floor_id: string, direction: Direction = "idle", patch: Partial<Elevator> = {}): Elevator {
  return {
    id,
    project_id: "project",
    name: id.toUpperCase(),
    current_floor_id,
    direction,
    capacity: 4,
    current_load: 0,
    active: true,
    operator_session_id: `session-${id}`,
    operator_session_started_at: "2026-04-30T11:00:00.000Z",
    operator_session_heartbeat_at: "2026-04-30T11:59:30.000Z",
    operator_user_id: null,
    ...patch,
  };
}

function request(
  id: string,
  from_floor_id: string,
  to_floor_id: string,
  patch: Partial<HoistRequest> = {},
): HoistRequest {
  const fromSort = floors.find((f) => f.id === from_floor_id)?.sort_order ?? 0;
  const toSort = floors.find((f) => f.id === to_floor_id)?.sort_order ?? 0;
  return {
    id,
    project_id: "project",
    elevator_id: null,
    from_floor_id,
    to_floor_id,
    direction: toSort > fromSort ? "up" : "down",
    passenger_count: 1,
    original_passenger_count: 1,
    remaining_passenger_count: 1,
    split_required: false,
    priority: false,
    priority_reason: null,
    note: null,
    status: "pending",
    sequence_number: Number(id.replace(/\D/g, "")) || 1,
    wait_started_at: "2026-04-30T11:58:00.000Z",
    created_at: "2026-04-30T11:58:00.000Z",
    updated_at: "2026-04-30T11:58:00.000Z",
    completed_at: null,
    ...patch,
  };
}

test("un ascenseur idle recoit une demande simple", () => {
  const result = computeBestElevatorForRequest({
    newRequest: request("r1", "rdc", "4"),
    elevators: [elevator("e1", "rdc")],
    activeRequests: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "e1");
});

test("un ascenseur qui monte ramasse une demande sur son chemin", () => {
  const lift = elevator("e1", "rdc", "up", { current_load: 1 });
  const onboard = request("r1", "rdc", "5", { elevator_id: "e1", status: "boarded" });
  const pickup = request("r2", "2", "4", { elevator_id: "e1" });
  const action = computeNextOperatorAction({
    elevator: lift,
    assignedRequests: enrichDispatchRequests([pickup], floors),
    onboardPassengers: enrichDispatchRequests([onboard], floors).map((r) => ({
      requestId: r.id,
      from_floor_id: r.from_floor_id,
      to_floor_id: r.to_floor_id,
      from_sort_order: r.from_sort_order,
      to_sort_order: r.to_sort_order,
      passenger_count: r.passenger_count,
    })),
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r2");
});

test("un ascenseur qui monte ignore une demande en sens inverse si un idle est meilleur", () => {
  const result = computeBestElevatorForRequest({
    newRequest: request("r1", "3", "rdc"),
    elevators: [elevator("moving", "2", "up"), elevator("idle", "3", "idle")],
    activeRequests: [request("r2", "rdc", "5", { elevator_id: "moving", status: "boarded" })],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "idle");
});

test("un ascenseur plein ne prend plus de nouveaux passagers", () => {
  const result = computeBestElevatorForRequest({
    newRequest: request("r1", "2", "5"),
    elevators: [elevator("full", "2", "idle", { current_load: 4, capacity: 4 })],
    activeRequests: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, null);
});

test("deux ascenseurs disponibles choisissent le meilleur", () => {
  const result = computeBestElevatorForRequest({
    newRequest: request("r1", "5", "rdc"),
    elevators: [elevator("far", "rdc"), elevator("near", "5")],
    activeRequests: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "near");
});

test("deux ascenseurs: un en route sur le chemin bat un idle plus loin", () => {
  const onboard = request("r1", "rdc", "6", { elevator_id: "moving", status: "boarded" });
  const result = computeBestElevatorForRequest({
    newRequest: request("r2", "3", "5"),
    elevators: [elevator("moving", "2", "up", { current_load: 1 }), elevator("idle", "p1")],
    activeRequests: [onboard],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "moving");
});

test("une demande plus ancienne n'est pas oubliee hors chemin", () => {
  const oldReq = request("r1", "1", "5", {
    elevator_id: "e1",
    sequence_number: 1,
    wait_started_at: "2026-04-30T11:40:00.000Z",
  });
  const newer = request("r2", "6", "rdc", {
    elevator_id: "e1",
    sequence_number: 20,
    wait_started_at: "2026-04-30T11:59:00.000Z",
  });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([newer, oldReq], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.primaryPickupRequestId, "r1");
});

test("les etages .5 sont compares correctement", () => {
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "4"),
    assignedRequests: enrichDispatchRequests([request("r1", "4-5", "5-5")], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.nextFloorSortOrder, 4.5);
  assert.equal(action.suggestedDirection, "up");
});

test("la priorite existante influence le choix sans casser la capacite", () => {
  const normal = request("r1", "2", "5", { elevator_id: "e1", sequence_number: 1 });
  const priority = request("r2", "3", "6", {
    elevator_id: "e1",
    sequence_number: 2,
    priority: true,
    priority_reason: "Urgent",
  });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([normal, priority], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.primaryPickupRequestId, "r2");
});

test("une demande deja assignee n'est pas reprise par un autre ascenseur", () => {
  const existing = request("r9", "2", "5", { elevator_id: "e1" });
  const result = computeBestElevatorForRequest({
    newRequest: { ...existing },
    elevators: [elevator("e1", "rdc"), elevator("e2", "2")],
    activeRequests: [existing],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "e1");
});

test("les places reservees par des demandes assignees comptent dans la capacite multi-ascenseurs", () => {
  const reserved = request("r10", "rdc", "5", {
    elevator_id: "e1",
    passenger_count: 4,
    original_passenger_count: 4,
    remaining_passenger_count: 4,
    status: "assigned",
  });
  const result = computeBestElevatorForRequest({
    newRequest: request("r11", "1", "4"),
    elevators: [elevator("e1", "rdc", "idle", { capacity: 4 }), elevator("e2", "1", "idle", { capacity: 4 })],
    activeRequests: [reserved],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "e2");
});
