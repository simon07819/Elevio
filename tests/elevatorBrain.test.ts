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
  floor("8", "8", 7),
  floor("13", "13", 13),
  floor("14", "14", 14),
  floor("16", "16", 15),
  floor("17", "17", 17),
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

test("capacite desactivee: un ascenseur plein peut encore recevoir une demande", () => {
  const result = computeBestElevatorForRequest({
    newRequest: request("r1", "2", "5", { passenger_count: 12 }),
    elevators: [elevator("full", "2", "idle", { current_load: 4, capacity: 4 })],
    activeRequests: [],
    projectFloors: floors,
    capacityEnabled: false,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "full");
  assert.equal(result.assignableChunk, 12);
});

test("bouton plein: la cabine ne recoit plus de nouveaux ramassages meme si capacite desactivee", () => {
  const result = computeBestElevatorForRequest({
    newRequest: request("r1", "2", "5", { passenger_count: 1 }),
    elevators: [
      elevator("full-manual", "2", "idle", { capacity: 10, current_load: 0, manual_full: true }),
      elevator("available", "3", "idle", { capacity: 10, current_load: 0 }),
    ],
    activeRequests: [],
    projectFloors: floors,
    capacityEnabled: false,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "available");
});

test("bouton plein: avec passagers a bord, l'operateur depose avant de reprendre des pickups", () => {
  const onboard = request("r21", "rdc", "5", { elevator_id: "e1", status: "boarded" });
  const onRoutePickup = request("r22", "2", "5", { elevator_id: "e1" });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "rdc", "up", { current_load: 1, manual_full: true }),
    assignedRequests: enrichDispatchRequests([onRoutePickup], floors),
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

  assert.equal(action.action, "dropoff");
  assert.equal(action.requestsToPickup.length, 0);
  assert.equal(action.requestsToDropoff[0]?.requestId, "r21");
});

test("un groupe de 40 avec deux cabines cap 15 est eligible pour une vague de 15 passagers", () => {
  const big = {
    from_floor_id: "rdc",
    to_floor_id: "5",
    direction: "up" as const,
    passenger_count: 40,
    priority: false,
    wait_started_at: "2026-04-30T11:58:00.000Z",
  };
  const result = computeBestElevatorForRequest({
    newRequest: big,
    elevators: [
      elevator("e1", "rdc", "idle", { capacity: 15 }),
      elevator("e2", "1", "idle", { capacity: 15 }),
    ],
    activeRequests: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.assignableChunk, 15);
  assert.ok(result.elevatorId === "e1" || result.elevatorId === "e2");
  assert.equal(result.candidates.filter((c) => c.eligible).length, 2);
});

test("un seul ascenseur cap 15 peut planifier plusieurs vagues pour un groupe de 40", () => {
  let remaining = 40;
  const e1 = elevator("e1", "rdc", "idle", { capacity: 15 });
  for (let wave = 0; wave < 3; wave++) {
    const result = computeBestElevatorForRequest({
      newRequest: {
        from_floor_id: "rdc",
        to_floor_id: "5",
        direction: "up",
        passenger_count: remaining,
        priority: false,
        wait_started_at: "2026-04-30T11:58:00.000Z",
      },
      elevators: [e1],
      activeRequests: [],
      projectFloors: floors,
      nowMs: now,
    });

    assert.equal(result.elevatorId, "e1");
    const expectedChunk = wave === 2 ? 10 : 15;
    assert.equal(result.assignableChunk, expectedChunk);
    remaining -= result.assignableChunk ?? 0;
  }
  assert.equal(remaining, 0);
});

test("un groupe qui depasse la capacite est reparti sur les autres operateurs actifs avant une nouvelle vague", () => {
  const elevators = [
    elevator("e1", "rdc", "idle", { capacity: 15 }),
    elevator("e2", "rdc", "idle", { capacity: 15 }),
  ];
  const assigned: Array<{ elevatorId: string; passengers: number }> = [];
  let syntheticReservations: HoistRequest[] = [];
  let remaining = 25;

  while (remaining > 0) {
    const result = computeBestElevatorForRequest({
      newRequest: {
        from_floor_id: "rdc",
        to_floor_id: "5",
        direction: "up",
        passenger_count: remaining,
        priority: false,
        wait_started_at: "2026-04-30T11:58:00.000Z",
      },
      elevators,
      activeRequests: syntheticReservations,
      projectFloors: floors,
      nowMs: now,
    });

    if (!result.elevatorId) {
      syntheticReservations = [];
      continue;
    }

    const passengers = result.assignableChunk ?? remaining;
    assigned.push({ elevatorId: result.elevatorId, passengers });
    syntheticReservations.push(
      request(`split-${assigned.length}`, "rdc", "5", {
        elevator_id: result.elevatorId,
        passenger_count: passengers,
        original_passenger_count: 25,
        remaining_passenger_count: Math.max(0, remaining - passengers),
        split_required: true,
        status: "assigned",
      }),
    );
    remaining -= passengers;
  }

  assert.deepEqual(assigned, [
    { elevatorId: "e1", passengers: 15 },
    { elevatorId: "e2", passengers: 10 },
  ]);
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

test("dispatch: une demande 5 vers 13 rejoint la route planifiee P1 vers 17", () => {
  const planned = request("r67", "p1", "17", { elevator_id: "route", sequence_number: 1 });
  const result = computeBestElevatorForRequest({
    newRequest: request("r68", "5", "13", { sequence_number: 2 }),
    elevators: [elevator("route", "rdc", "idle"), elevator("other", "13", "idle")],
    activeRequests: [planned],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(result.elevatorId, "route");
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

test("capacite desactivee: l'operateur peut ramasser un groupe qui depasse la capacite", () => {
  const oversized = request("r20", "rdc", "5", {
    elevator_id: "e1",
    passenger_count: 12,
    original_passenger_count: 12,
    remaining_passenger_count: 12,
  });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "rdc", "idle", { capacity: 4 }),
    assignedRequests: enrichDispatchRequests([oversized], floors),
    onboardPassengers: [],
    projectFloors: floors,
    capacityEnabled: false,
    nowMs: now,
  });

  assert.equal(action.action, "pickup");
  assert.equal(action.requestsToPickup[0]?.id, "r20");
  assert.equal(action.capacityWarnings.length, 0);
});

test("le message de pickup utilise le vrai libelle d'etage, pas le sort_order", () => {
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([request("r12", "rdc", "8", { elevator_id: "e1" })], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.match(action.reason, /vers 8/);
  assert.doesNotMatch(action.reason, /etage 7/);
});

test("en descente vers RDC, l'ascenseur ne depasse pas la depose pour ramasser P1", () => {
  const onboard = request("r13", "16", "rdc", { elevator_id: "e1", status: "boarded" });
  const p1Pickup = request("r14", "p1", "8", { elevator_id: "e1" });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "8", "down", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([p1Pickup], floors),
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

  assert.equal(action.action, "dropoff");
  assert.equal(action.nextFloor?.id, "rdc");
});

test("sans passager a bord, une direction stale ne force pas une montee inutile", () => {
  const p1Pickup = request("r15", "p1", "8", { elevator_id: "e1", sequence_number: 1 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "8", "up"),
    assignedRequests: enrichDispatchRequests([p1Pickup], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.primaryPickupRequestId, "r15");
  assert.equal(action.nextFloor?.id, "p1");
  assert.equal(action.suggestedDirection, "down");
});

test("cabine vide avec appels P1 et RDC vers le haut commence par P1 puis ramasse RDC en chemin", () => {
  const p1Pickup = request("r16", "p1", "8", { elevator_id: "e1", sequence_number: 2 });
  const rdcPickup = request("r17", "rdc", "16", { elevator_id: "e1", sequence_number: 1 });
  const first = computeNextOperatorAction({
    elevator: elevator("e1", "rdc", "idle"),
    assignedRequests: enrichDispatchRequests([rdcPickup, p1Pickup], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(first.primaryPickupRequestId, "r16");
  assert.equal(first.nextFloor?.id, "p1");

  const boardedP1 = enrichDispatchRequests([{ ...p1Pickup, status: "boarded" }], floors)[0];
  const second = computeNextOperatorAction({
    elevator: elevator("e1", "p1", "up", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([rdcPickup], floors),
    onboardPassengers: [
      {
        requestId: boardedP1.id,
        from_floor_id: boardedP1.from_floor_id,
        to_floor_id: boardedP1.to_floor_id,
        from_sort_order: boardedP1.from_sort_order,
        to_sort_order: boardedP1.to_sort_order,
        passenger_count: boardedP1.passenger_count,
      },
    ],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(second.primaryPickupRequestId, "r17");
  assert.equal(second.nextFloor?.id, "rdc");
});

test("cabine vide avec appels au-dessus vers le bas commence par le plus haut pickup", () => {
  const lower = request("r18", "5", "rdc", { elevator_id: "e1", sequence_number: 1 });
  const higher = request("r19", "8", "p1", { elevator_id: "e1", sequence_number: 2 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "5", "idle"),
    assignedRequests: enrichDispatchRequests([lower, higher], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.primaryPickupRequestId, "r19");
  assert.equal(action.nextFloor?.id, "8");
});

test("cabine vide : montée commence par le palier le plus bas puis collecte en montant", () => {
  const near = request("r51", "2", "5", { elevator_id: "e1", sequence_number: 10 });
  const far = request("r52", "5", "8", { elevator_id: "e1", sequence_number: 1 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([far, near], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.primaryPickupRequestId, "r51");
  assert.equal(action.nextFloor?.id, "2");
});

test("cabine vide : descente commence par le palier le plus haut puis collecte en descendant", () => {
  const higherBelow = request("r53", "5", "rdc", { elevator_id: "e1", sequence_number: 2 });
  const lowerBelow = request("r54", "2", "rdc", { elevator_id: "e1", sequence_number: 1 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "8", "idle"),
    assignedRequests: enrichDispatchRequests([lowerBelow, higherBelow], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.nextFloor?.id, "5");
});

test("cabine au-dessus de haltes montée : cible le plus bas (P1) avant RDC", () => {
  const rdcUp = request("r60", "rdc", "16", { elevator_id: "e1", sequence_number: 1 });
  const p1Up = request("r61", "p1", "8", { elevator_id: "e1", sequence_number: 2 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "8", "idle"),
    assignedRequests: enrichDispatchRequests([rdcUp, p1Up], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "p1");
  assert.equal(action.primaryPickupRequestId, "r61");
});

test("avec passagers en descente : ignore les appels montée sur le segment", () => {
  const onboard = request("r55", "16", "rdc", { elevator_id: "e1", status: "boarded" });
  const midPickup = request("r56", "4", "16", { elevator_id: "e1", sequence_number: 1 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "8", "down", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([midPickup], floors),
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

  assert.equal(action.action, "dropoff");
  assert.equal(action.nextFloor?.id, "rdc");
  assert.equal(action.primaryPickupRequestId, null);
});

test("avec passager vers 16 : ramasse une demande en chemin avant la depose", () => {
  const onboard = request("r63", "p1", "16", { elevator_id: "e1", status: "boarded" });
  const midPickup = request("r64", "5", "16", { elevator_id: "e1", sequence_number: 1 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "p1", "up", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([midPickup], floors),
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
  assert.equal(action.nextFloor?.id, "5");
  assert.equal(action.primaryPickupRequestId, "r64");
  assert.equal(action.requestsToDropoff.length, 0);
});

test("sequence chantier: P1 vers 17 puis 5 vers 13 fait P1, 5, 13, 17", () => {
  const firstPickup = request("r65", "p1", "17", { elevator_id: "e1", sequence_number: 1 });
  const secondPickup = request("r66", "5", "13", { elevator_id: "e1", sequence_number: 2 });

  const goToP1 = computeNextOperatorAction({
    elevator: elevator("e1", "rdc", "idle"),
    assignedRequests: enrichDispatchRequests([firstPickup, secondPickup], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(goToP1.action, "pickup");
  assert.equal(goToP1.nextFloor?.id, "p1");
  assert.equal(goToP1.primaryPickupRequestId, "r65");

  const goTo5 = computeNextOperatorAction({
    elevator: elevator("e1", "p1", "up", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([secondPickup], floors),
    onboardPassengers: enrichDispatchRequests([{ ...firstPickup, status: "boarded" }], floors).map((r) => ({
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

  assert.equal(goTo5.action, "pickup");
  assert.equal(goTo5.nextFloor?.id, "5");
  assert.equal(goTo5.primaryPickupRequestId, "r66");

  const goTo13 = computeNextOperatorAction({
    elevator: elevator("e1", "5", "up", { current_load: 2 }),
    assignedRequests: [],
    onboardPassengers: enrichDispatchRequests([
      { ...firstPickup, status: "boarded" },
      { ...secondPickup, status: "boarded" },
    ], floors).map((r) => ({
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

  assert.equal(goTo13.action, "dropoff");
  assert.equal(goTo13.nextFloor?.id, "13");

  const goTo17 = computeNextOperatorAction({
    elevator: elevator("e1", "13", "up", { current_load: 1 }),
    assignedRequests: [],
    onboardPassengers: enrichDispatchRequests([{ ...firstPickup, status: "boarded" }], floors).map((r) => ({
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

  assert.equal(goTo17.action, "dropoff");
  assert.equal(goTo17.nextFloor?.id, "17");
});

test("sequence chantier: P1 vers 16 puis 4 vers 14 fait P1, 4, 14, 16", () => {
  const firstPickup = request("r80", "p1", "16", { elevator_id: "e1", sequence_number: 1 });
  const secondPickup = request("r81", "4", "14", { elevator_id: "e1", sequence_number: 2 });

  const goToP1 = computeNextOperatorAction({
    elevator: elevator("e1", "rdc", "idle"),
    assignedRequests: enrichDispatchRequests([firstPickup, secondPickup], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(goToP1.action, "pickup");
  assert.equal(goToP1.nextFloor?.id, "p1");
  assert.equal(goToP1.primaryPickupRequestId, "r80");

  const goTo4 = computeNextOperatorAction({
    elevator: elevator("e1", "p1", "up", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([secondPickup], floors),
    onboardPassengers: enrichDispatchRequests([{ ...firstPickup, status: "boarded" }], floors).map((r) => ({
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

  assert.equal(goTo4.action, "pickup");
  assert.equal(goTo4.nextFloor?.id, "4");
  assert.equal(goTo4.primaryPickupRequestId, "r81");

  const goTo14 = computeNextOperatorAction({
    elevator: elevator("e1", "4", "up", { current_load: 2 }),
    assignedRequests: [],
    onboardPassengers: enrichDispatchRequests([
      { ...firstPickup, status: "boarded" },
      { ...secondPickup, status: "boarded" },
    ], floors).map((r) => ({
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

  assert.equal(goTo14.action, "dropoff");
  assert.equal(goTo14.nextFloor?.id, "14");

  const goTo16 = computeNextOperatorAction({
    elevator: elevator("e1", "14", "up", { current_load: 1 }),
    assignedRequests: [],
    onboardPassengers: enrichDispatchRequests([{ ...firstPickup, status: "boarded" }], floors).map((r) => ({
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

  assert.equal(goTo16.action, "dropoff");
  assert.equal(goTo16.nextFloor?.id, "16");
});

test("cabine vide : direction DB encore « up » ne bloque pas les appels en descente (sync retardée)", () => {
  const downLeg = request("r62", "4", "rdc", { elevator_id: "e1", sequence_number: 1 });
  const action = computeNextOperatorAction({
    elevator: elevator("e1", "8", "up"),
    assignedRequests: enrichDispatchRequests([downLeg], floors),
    onboardPassengers: [],
    projectFloors: floors,
    nowMs: now,
  });

  assert.equal(action.action, "pickup");
  assert.equal(action.primaryPickupRequestId, "r62");
  assert.equal(action.suggestedDirection, "down");
});
