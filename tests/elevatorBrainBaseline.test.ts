/**
 * Baseline behavioral tests for services/elevatorBrain.ts.
 *
 * Goal: lock the CURRENT behavior, including any quirks. These tests must fail only
 * when behavior changes. They do not assert what the brain *should* do; they assert
 * what it *currently does*.
 *
 * Categories covered (per .ai-team/PR_PLAN.md PR 1):
 *  1. Insertion / ajout de demande (computeBestElevatorForRequest)
 *  2. Separation up/down
 *  3. Ordre des demandes au palier (tie-break)
 *  4. Cycle UP -> DOWN (transition)
 *  5. Gestion capacite (plein vs attente)
 *  6. Etat des listes operateur (requestsToPickup / requestsToDropoff / capacityWarnings)
 *  7. Cas edge (vide, requetes opposees, overflow, current floor, etc.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBestElevatorForRequest,
  computeNextOperatorAction,
  enrichDispatchRequests,
  floorSortOrder,
} from "../services/elevatorBrain";
import type {
  ActivePassenger,
  Direction,
  Elevator,
  Floor,
  HoistRequest,
} from "../types/hoist";

const NOW = Date.parse("2026-04-30T12:00:00.000Z");

const FLOORS: Floor[] = [
  mkFloor("p2", "P2", -2),
  mkFloor("p1", "P1", -1),
  mkFloor("rdc", "RDC", 0),
  mkFloor("1", "1", 1),
  mkFloor("2", "2", 2),
  mkFloor("3", "3", 3),
  mkFloor("4", "4", 4),
  mkFloor("5", "5", 5),
  mkFloor("6", "6", 6),
  mkFloor("8", "8", 8),
  mkFloor("10", "10", 10),
  mkFloor("12", "12", 12),
  mkFloor("14", "14", 14),
  mkFloor("16", "16", 16),
];

function mkFloor(id: string, label: string, sort_order: number): Floor {
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

function mkElevator(
  id: string,
  current_floor_id: string,
  direction: Direction = "idle",
  patch: Partial<Elevator> = {},
): Elevator {
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

function mkRequest(
  id: string,
  from_floor_id: string,
  to_floor_id: string,
  patch: Partial<HoistRequest> = {},
): HoistRequest {
  const fromSort = FLOORS.find((f) => f.id === from_floor_id)?.sort_order ?? 0;
  const toSort = FLOORS.find((f) => f.id === to_floor_id)?.sort_order ?? 0;
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

function boardedActive(req: HoistRequest): ActivePassenger {
  return {
    requestId: req.id,
    from_floor_id: req.from_floor_id,
    to_floor_id: req.to_floor_id,
    from_sort_order: FLOORS.find((f) => f.id === req.from_floor_id)?.sort_order ?? 0,
    to_sort_order: FLOORS.find((f) => f.id === req.to_floor_id)?.sort_order ?? 0,
    passenger_count: req.passenger_count,
  };
}

// ---------------------------------------------------------------------------
// 1. Insertion / ajout de demande
// ---------------------------------------------------------------------------

test("baseline: insertion - idle simple up est assignee a l'unique cabine", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5"),
    elevators: [mkElevator("e1", "rdc")],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, "e1");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.eligible, true);
  assert.equal(result.assignableChunk, 1);
});

test("baseline: insertion - idle simple down est assignee a l'unique cabine", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "8", "rdc"),
    elevators: [mkElevator("e1", "8")],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, "e1");
  assert.equal(result.candidates[0]?.effectiveDirection, "idle");
});

test("baseline: insertion - liste de cabines vide retourne elevatorId null", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5"),
    elevators: [],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, null);
  assert.equal(result.candidates.length, 0);
  assert.match(result.reason, /Aucun ascenseur disponible/);
});

test("baseline: insertion - toutes cabines inactives -> elevatorId null", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5"),
    elevators: [
      mkElevator("e1", "rdc", "idle", { active: false }),
      mkElevator("e2", "5", "idle", { active: false }),
    ],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, null);
  assert.equal(result.candidates.every((c) => !c.eligible), true);
});

test("baseline: insertion - toutes cabines online=false -> elevatorId null", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5"),
    elevators: [
      { ...mkElevator("e1", "rdc"), online: false },
      { ...mkElevator("e2", "3"), online: false },
    ],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, null);
});

test("baseline: insertion - toutes cabines manual_full -> elevatorId null", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5"),
    elevators: [
      mkElevator("e1", "rdc", "idle", { manual_full: true }),
      mkElevator("e2", "3", "idle", { manual_full: true }),
    ],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, null);
});

test("baseline: insertion - cabine capacite=0 est ineligible", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5"),
    elevators: [mkElevator("e1", "rdc", "idle", { capacity: 0 })],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, null);
  assert.equal(result.candidates[0]?.assignableChunk, 0);
});

test("baseline: insertion - demande deja assignee retourne le meme ascenseur (short-circuit)", () => {
  const existing = mkRequest("r1", "2", "5", { elevator_id: "e1", status: "assigned" });
  const result = computeBestElevatorForRequest({
    newRequest: { ...existing },
    elevators: [mkElevator("e1", "rdc"), mkElevator("e2", "2")],
    activeRequests: [existing],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, "e1");
  assert.equal(result.score, Number.NEGATIVE_INFINITY);
  assert.equal(result.candidates.length, 0);
});

test("baseline: insertion - prioritiesEnabled=false neutralise le bonus priorite", () => {
  const noPrioBonus = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5", { priority: true }),
    elevators: [mkElevator("e1", "rdc")],
    activeRequests: [],
    projectFloors: FLOORS,
    prioritiesEnabled: false,
    nowMs: NOW,
  });
  const withPrioBonus = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5", { priority: true }),
    elevators: [mkElevator("e1", "rdc")],
    activeRequests: [],
    projectFloors: FLOORS,
    prioritiesEnabled: true,
    nowMs: NOW,
  });
  assert.equal(noPrioBonus.candidates[0]?.bonuses.priority, 0);
  assert.equal(withPrioBonus.candidates[0]?.bonuses.priority, 180);
});

test("baseline: insertion - capacityEnabled=false : assignableChunk = passenger_count meme si > capacite", () => {
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "rdc", "5", { passenger_count: 99 }),
    elevators: [mkElevator("e1", "rdc", "idle", { capacity: 4 })],
    activeRequests: [],
    projectFloors: FLOORS,
    capacityEnabled: false,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, "e1");
  assert.equal(result.assignableChunk, 99);
});

// ---------------------------------------------------------------------------
// 2. Separation up / down
// ---------------------------------------------------------------------------

test("baseline: up/down - idle au RDC, deux appels up (P1 et 5) -> commence par P1 (SCAN cycle UP)", () => {
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle"),
    assignedRequests: enrichDispatchRequests(
      [
        mkRequest("r1", "5", "8", { elevator_id: "e1", sequence_number: 1 }),
        mkRequest("r2", "p1", "5", { elevator_id: "e1", sequence_number: 2 }),
      ],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "p1");
  assert.equal(action.suggestedDirection, "down");
});

test("baseline: up/down - idle au RDC, mix up (5) + down (P1 vers P2) -> wave la plus dense ou la plus proche gagne", () => {
  // collectivePickupWave compare deux groupes : up{5} vs down{p1}.
  // Distance(5) = 5, distance(p1) = 1. Score: 1*90 - distance*28 - oldestSeq*0.5 - oldestWait/...
  // up: 90 - 140 = -50, down: 90 - 28 = 62. Down gagne.
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle"),
    assignedRequests: enrichDispatchRequests(
      [
        mkRequest("rUp", "5", "8", { elevator_id: "e1", sequence_number: 1 }),
        mkRequest("rDown", "p1", "p2", { elevator_id: "e1", sequence_number: 2 }),
      ],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "p1");
  assert.equal(action.primaryPickupRequestId, "rDown");
});

test("baseline: up/down - meme palier avec up+down: brain choisit selon collectivePickupWave", () => {
  // Une demande up et une down depuis le palier courant (rdc). Aucun passager a bord.
  // collectivePickupWave : pool up = [r1 rdc->5], pool down = [r2 rdc->p1].
  // targetFloor pour up = min(0) = 0 ; pour down = max(0) = 0. Distance = 0 pour les deux.
  // score = 1*90 - 0*28 - seq*0.5 - wait. Egal sur seq si seq egal ; sinon plus petit seq gagne via tie-break.
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle"),
    assignedRequests: enrichDispatchRequests(
      [
        mkRequest("rUp", "rdc", "5", { elevator_id: "e1", sequence_number: 1 }),
        mkRequest("rDown", "rdc", "p1", { elevator_id: "e1", sequence_number: 2 }),
      ],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  // Les deux waves sont a egalite de score : tie-break par oldestSequence (asc) => up gagne.
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "rdc");
  assert.equal(action.primaryPickupRequestId, "rUp");
});

test("baseline: up/down - cabine en service direction up sans passager: les appels DOWN ne sont PAS bloques", () => {
  // Sans passager a bord, la phase est inferee depuis les requetes (pas la direction stale).
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "8", "up"),
    assignedRequests: enrichDispatchRequests(
      [mkRequest("r1", "5", "rdc", { elevator_id: "e1", sequence_number: 1 })],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "5");
  assert.equal(action.suggestedDirection, "down");
});

// ---------------------------------------------------------------------------
// 3. Ordre des demandes au palier (tie-break)
// ---------------------------------------------------------------------------

test("baseline: ordre - meme palier prio + non-prio : brain garde uniquement la prioritaire dans le pool", () => {
  // filterPriorityPickupPool : si prioritiesEnabled=true et au moins une demande prio,
  // le pool ne retient QUE les prioritaires. Les non-prio ne figurent donc pas dans
  // requestsToPickup ni dans le scan SCAN d'idle. Comportement actuel verrouille.
  const normal = mkRequest("rN", "rdc", "5", {
    elevator_id: "e1",
    sequence_number: 1,
  });
  const prio = mkRequest("rP", "rdc", "8", {
    elevator_id: "e1",
    sequence_number: 2,
    priority: true,
    priority_reason: "U",
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([normal, prio], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "rdc");
  assert.equal(action.requestsToPickup.length, 1);
  assert.equal(action.requestsToPickup[0]?.id, "rP");
  assert.equal(action.primaryPickupRequestId, "rP");
});

test("baseline: ordre - meme palier, meme priorite : sequence_number ascendant dans requestsToPickup", () => {
  const a = mkRequest("rA", "rdc", "5", { elevator_id: "e1", sequence_number: 7 });
  const b = mkRequest("rB", "rdc", "8", { elevator_id: "e1", sequence_number: 2 });
  const c = mkRequest("rC", "rdc", "6", { elevator_id: "e1", sequence_number: 5 });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([a, b, c], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.deepEqual(
    action.requestsToPickup.map((r) => r.id),
    ["rB", "rC", "rA"],
  );
  assert.equal(action.primaryPickupRequestId, "rB");
});

test("baseline: ordre - prioritiesEnabled=false : la priorite ne reordonne plus requestsToPickup", () => {
  const normal = mkRequest("rN", "rdc", "5", { elevator_id: "e1", sequence_number: 1 });
  const prio = mkRequest("rP", "rdc", "8", {
    elevator_id: "e1",
    sequence_number: 2,
    priority: true,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([normal, prio], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    prioritiesEnabled: false,
    nowMs: NOW,
  });
  // Avec prioritiesEnabled=false la fonction de tri reste `priority desc, seq asc`.
  // Le brain trie tout de meme via `Number(b.priority) - Number(a.priority)`, donc rP reste 1er.
  // Ce test verrouille ce comportement actuel : prioritiesEnabled affecte le scoring/score
  // multi-cabines mais pas l'ordre `sortPickupsAtFloor`.
  assert.equal(action.requestsToPickup[0]?.id, "rP");
});

// ---------------------------------------------------------------------------
// 4. Cycle UP -> DOWN (transition apres dropoff complet)
// ---------------------------------------------------------------------------

test("baseline: cycle - apres tous les dropoffs UP, la cabine vide bascule vers les appels DOWN", () => {
  // Cabine au sommet, vide, avec un appel DOWN seulement.
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "16", "up"),
    assignedRequests: enrichDispatchRequests(
      [mkRequest("r1", "12", "rdc", { elevator_id: "e1", sequence_number: 1 })],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "12");
  assert.equal(action.suggestedDirection, "down");
});

test("baseline: cycle - cabine UP avec passager, dernier dropoff au top, puis appel DOWN -> dropoff d'abord", () => {
  const onboard = mkRequest("rB", "rdc", "8", { elevator_id: "e1", status: "boarded" });
  const downCall = mkRequest("rD", "5", "rdc", { elevator_id: "e1", sequence_number: 2 });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "up", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([downCall], FLOORS),
    onboardPassengers: [boardedActive(onboard)],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "dropoff");
  assert.equal(action.nextFloor?.id, "8");
});

// ---------------------------------------------------------------------------
// 5. Capacite (plein vs attente)
// ---------------------------------------------------------------------------

test("baseline: capacite - cabine pleine sans dropoff a faire -> wait + idle_blocked", () => {
  // current_load=4, capacity=4, pas de boarded onboard, un appel pending.
  // remainingCapacity=0 => idleCapacityOk vide => idleTargetFloor null => wait/idle_blocked.
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", { capacity: 4, current_load: 4 }),
    assignedRequests: enrichDispatchRequests(
      [mkRequest("r1", "rdc", "5", { elevator_id: "e1" })],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "wait");
  assert.equal(action.reasonDetail?.kind, "idle_blocked");
});

test("baseline: capacite - manual_full + capacityEnabled=false : pickups bloques (manual_full prevaut)", () => {
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", {
      capacity: 10,
      current_load: 0,
      manual_full: true,
    }),
    assignedRequests: enrichDispatchRequests(
      [mkRequest("r1", "rdc", "5", { elevator_id: "e1" })],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    capacityEnabled: false,
    nowMs: NOW,
  });
  assert.equal(action.action, "wait");
  assert.equal(action.reasonDetail?.kind, "idle_blocked");
});

test("baseline: capacite - groupe trop grand : warning group_exceeds_total emis", () => {
  const big = mkRequest("r1", "rdc", "5", {
    elevator_id: "e1",
    passenger_count: 10,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", { capacity: 4 }),
    assignedRequests: enrichDispatchRequests([big], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  // Groupe 10 > capacite 4 ET > remainingCapacity 4 -> deux warnings au moins.
  // Le brain bloque le pickup (idleCapacityOk filter passenger_count <= remainingCapacity)
  // donc on tombe en idle_blocked, mais les warnings sont calcules sur openRequests.
  assert.equal(action.action, "wait");
  assert.equal(action.reasonDetail?.kind, "idle_blocked");
  const types = new Set(action.capacityWarnings.map((w) => w.type));
  assert.ok(types.has("insufficient_remaining"));
  assert.ok(types.has("group_exceeds_total"));
});

test("baseline: capacite - split_required true emet bien le warning split_required", () => {
  const split = mkRequest("r1", "rdc", "5", {
    elevator_id: "e1",
    passenger_count: 2,
    original_passenger_count: 6,
    remaining_passenger_count: 2,
    split_required: true,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", { capacity: 4 }),
    assignedRequests: enrichDispatchRequests([split], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  const types = action.capacityWarnings.map((w) => w.type);
  assert.ok(types.includes("split_required"));
});

test("baseline: capacite - capacityEnabled=false n'emet aucun warning", () => {
  const big = mkRequest("r1", "rdc", "5", {
    elevator_id: "e1",
    passenger_count: 99,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", { capacity: 4 }),
    assignedRequests: enrichDispatchRequests([big], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    capacityEnabled: false,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.capacityWarnings.length, 0);
});

test("baseline: capacite - current_load > capacity n'inverse pas remainingCapacity (clamp 0)", () => {
  // Bug-as-feature : current_load=9 sur capacity=4 -> remainingCapacity = max(0, -5) = 0.
  // Ce test verrouille ce clamp.
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", { capacity: 4, current_load: 9 }),
    assignedRequests: enrichDispatchRequests(
      [mkRequest("r1", "rdc", "5", { elevator_id: "e1" })],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "wait");
  assert.equal(action.reasonDetail?.kind, "idle_blocked");
});

// ---------------------------------------------------------------------------
// 6. Etat des listes operateur
// ---------------------------------------------------------------------------

test("baseline: listes - requestsToDropoff ne contient que les passagers du palier vise", () => {
  // Cabine montant, 2 passagers : un pour 5, un pour 8. A 5, requestsToDropoff = [r5] seul.
  const r5 = mkRequest("r5", "rdc", "5", { elevator_id: "e1", status: "boarded" });
  const r8 = mkRequest("r8", "rdc", "8", { elevator_id: "e1", status: "boarded" });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "5", "up", { current_load: 2 }),
    assignedRequests: [],
    onboardPassengers: [boardedActive(r5), boardedActive(r8)],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "dropoff");
  assert.equal(action.nextFloor?.id, "5");
  assert.equal(action.requestsToDropoff.length, 1);
  assert.equal(action.requestsToDropoff[0]?.requestId, "r5");
});

test("baseline: listes - capacityWarnings : chaque warning expose requestId, type et message", () => {
  const big = mkRequest("rBig", "rdc", "5", {
    elevator_id: "e1",
    passenger_count: 10,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle", { capacity: 4 }),
    assignedRequests: enrichDispatchRequests([big], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  for (const w of action.capacityWarnings) {
    assert.equal(w.requestId, "rBig");
    assert.ok(typeof w.type === "string");
    assert.ok(typeof w.message === "string" && w.message.length > 0);
  }
});

test("baseline: listes - requestsToPickup vide si l'action est dropoff", () => {
  const onboard = mkRequest("r1", "rdc", "5", { elevator_id: "e1", status: "boarded" });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "5", "up", { current_load: 1 }),
    assignedRequests: [],
    onboardPassengers: [boardedActive(onboard)],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "dropoff");
  assert.equal(action.requestsToPickup.length, 0);
});

test("baseline: listes - wait : requestsToPickup et requestsToDropoff sont vides, suggestedDirection idle", () => {
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: [],
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "wait");
  assert.equal(action.requestsToPickup.length, 0);
  assert.equal(action.requestsToDropoff.length, 0);
  assert.equal(action.suggestedDirection, "idle");
  assert.equal(action.nextFloor, null);
  assert.equal(action.nextFloorSortOrder, null);
});

// ---------------------------------------------------------------------------
// 7. Edge cases
// ---------------------------------------------------------------------------

test("baseline: edge - aucune demande, aucun passager : wait + idle_empty + reason vide", () => {
  // formatDispatchRecommendationReason("idle_empty", ...) renvoie "" (chaine vide).
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: [],
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "wait");
  assert.equal(action.reasonDetail?.kind, "idle_empty");
  assert.equal(action.reason, "");
});

test("baseline: edge - demande au palier courant : pickup, suggestedDirection = idle", () => {
  const r = mkRequest("r1", "rdc", "5", { elevator_id: "e1" });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([r], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "rdc");
  assert.equal(action.suggestedDirection, "idle");
});

test("baseline: edge - passager dont la destination est le palier courant -> dropoff prioritaire sur les pickups en attente", () => {
  const onboard = mkRequest("rOn", "rdc", "8", {
    elevator_id: "e1",
    status: "boarded",
  });
  const pendingPickup = mkRequest("rP", "8", "16", {
    elevator_id: "e1",
    sequence_number: 2,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "8", "up", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([pendingPickup], FLOORS),
    onboardPassengers: [boardedActive(onboard)],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "dropoff");
  assert.equal(action.nextFloor?.id, "8");
  assert.equal(action.requestsToDropoff[0]?.requestId, "rOn");
  // Les pickups au meme palier sont reportes a la prochaine iteration.
  assert.equal(action.requestsToPickup.length, 0);
});

test("baseline: edge - current_floor_id inconnu -> sort_order fallback 0", () => {
  // floorSortOrder retourne 0 quand l'id est introuvable. Ce test verrouille ce fallback.
  assert.equal(floorSortOrder(FLOORS, "ghost-floor"), 0);
  assert.equal(floorSortOrder(FLOORS, null), 0);
  assert.equal(floorSortOrder(FLOORS, undefined), 0);
});

test("baseline: edge - projectFloors vide : computeNextOperatorAction utilise sort 0 implicite", () => {
  const r = mkRequest("rGhost", "p1", "5", { elevator_id: "e1" });
  // Sans floors connus, tous les sort_order tombent a 0 -> direction du request reste calculee
  // par mkRequest (basee sur FLOORS) mais enrichDispatchRequests avec floors=[] mettra
  // from_sort_order=0 et to_sort_order=0.
  const enriched = enrichDispatchRequests([r], []);
  assert.equal(enriched[0]?.from_sort_order, 0);
  assert.equal(enriched[0]?.to_sort_order, 0);

  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc", "idle"),
    assignedRequests: enriched,
    onboardPassengers: [],
    projectFloors: [],
    nowMs: NOW,
  });
  // Avec tout a 0, le palier vise est l'etage virtuel sort_order 0 (id virtual-floor-0).
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloorSortOrder, 0);
});

test("baseline: edge - groupe enorme (1000) capacite 4 : dispatch attribue chunk = capacite cabine", () => {
  const result = computeBestElevatorForRequest({
    newRequest: {
      from_floor_id: "rdc",
      to_floor_id: "5",
      direction: "up",
      passenger_count: 1000,
      priority: false,
      wait_started_at: "2026-04-30T11:58:00.000Z",
    },
    elevators: [mkElevator("e1", "rdc", "idle", { capacity: 4 })],
    activeRequests: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, "e1");
  assert.equal(result.assignableChunk, 4);
});

test("baseline: edge - deux demandes meme sequence_number : ordre stable (insertion-conserve)", () => {
  // Le tri sortPickupsAtFloor : Number(b.priority) - Number(a.priority) || a.seq - b.seq.
  // En cas d'egalite (memes seq, memes priorites), Array.prototype.sort est stable depuis ES2019.
  const a = mkRequest("rA", "rdc", "5", { elevator_id: "e1", sequence_number: 5 });
  const b = mkRequest("rB", "rdc", "8", { elevator_id: "e1", sequence_number: 5 });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests([a, b], FLOORS),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.deepEqual(
    action.requestsToPickup.map((r) => r.id),
    ["rA", "rB"],
  );
});

test("baseline: edge - cabine au sommet sans appels au-dessus, appels en bas + passager pour RDC: dropoff d'abord", () => {
  const onboard = mkRequest("rOn", "16", "rdc", {
    elevator_id: "e1",
    status: "boarded",
  });
  const lowerPickup = mkRequest("rL", "5", "rdc", {
    elevator_id: "e1",
    sequence_number: 2,
  });
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "16", "down", { current_load: 1 }),
    assignedRequests: enrichDispatchRequests([lowerPickup], FLOORS),
    onboardPassengers: [boardedActive(onboard)],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  // Pickup en chemin (5 entre 16 et rdc) -> brain ramasse 5 avant de continuer vers rdc.
  assert.equal(action.action, "pickup");
  assert.equal(action.nextFloor?.id, "5");
});

test("baseline: edge - enrichDispatchRequests propage from/to sort_order depuis FLOORS", () => {
  const enriched = enrichDispatchRequests(
    [mkRequest("r1", "p1", "16", { elevator_id: "e1" })],
    FLOORS,
  );
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0]?.from_sort_order, -1);
  assert.equal(enriched[0]?.to_sort_order, 16);
});

test("baseline: edge - une cabine occupee (load > 0) avec appel en sens oppose et idle disponible : preference idle", () => {
  // r1: appel descendant (5 -> rdc). Cabines: moving up avec passager r0 (rdc -> 8), idle au 3.
  // L'idle bat la moving via penalites direction + offRoute.
  const onboard = mkRequest("r0", "rdc", "8", {
    elevator_id: "moving",
    status: "boarded",
  });
  const result = computeBestElevatorForRequest({
    newRequest: mkRequest("r1", "5", "rdc"),
    elevators: [
      mkElevator("moving", "1", "up", { current_load: 1 }),
      mkElevator("idleBox", "3", "idle"),
    ],
    activeRequests: [onboard],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(result.elevatorId, "idleBox");
});

test("baseline: edge - reason d'un pickup utilise le format 'Ramasser a l'etage'", () => {
  // Verrouille le format de message actuel (sans accent sur 'a' ; bug-as-feature documente).
  const action = computeNextOperatorAction({
    elevator: mkElevator("e1", "rdc"),
    assignedRequests: enrichDispatchRequests(
      [mkRequest("r1", "5", "8", { elevator_id: "e1" })],
      FLOORS,
    ),
    onboardPassengers: [],
    projectFloors: FLOORS,
    nowMs: NOW,
  });
  assert.equal(action.action, "pickup");
  assert.match(action.reason, /Ramasser a l'etage 5/);
});
