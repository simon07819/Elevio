/**
 * Baseline behavioral tests for lib/elevatorRouting.ts.
 *
 * These pure functions back the dispatch / brain decisions. The tests lock the
 * CURRENT behavior — including any quirks — so any future change to routing
 * logic surfaces immediately as a test failure.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  directionToward,
  effectiveServiceDirection,
  estimateFloorsToReachPickup,
  hoistQueueToActivePassengersBoarded,
  hoistQueueToShaftRequests,
  inferPickupPhaseDirection,
  isBetween,
  nearestEligiblePickupFloorSCAN,
  nextBoardedDropoffSortOrder,
  openPickupsTowardNextDropoff,
  pendingBoardedDestinations,
  pickupFromSortOnSegmentToDropoff,
  routeLimitForElevator,
  targetForDirection,
} from "../lib/elevatorRouting";
import type { ActivePassenger, HoistRequest } from "../types/hoist";

function passenger(
  requestId: string,
  fromSort: number,
  toSort: number,
  count = 1,
): ActivePassenger {
  return {
    requestId,
    from_floor_id: `f${fromSort}`,
    to_floor_id: `f${toSort}`,
    from_sort_order: fromSort,
    to_sort_order: toSort,
    passenger_count: count,
  };
}

// ---------------------------------------------------------------------------
// isBetween
// ---------------------------------------------------------------------------

test("baseline routing: isBetween - inclusif sur les bornes (asc)", () => {
  assert.equal(isBetween(2, 1, 3), true);
  assert.equal(isBetween(1, 1, 3), true);
  assert.equal(isBetween(3, 1, 3), true);
});

test("baseline routing: isBetween - false hors bornes", () => {
  assert.equal(isBetween(0, 1, 3), false);
  assert.equal(isBetween(4, 1, 3), false);
});

test("baseline routing: isBetween - normalise les bornes inversees", () => {
  assert.equal(isBetween(2, 3, 1), true);
});

// ---------------------------------------------------------------------------
// pendingBoardedDestinations
// ---------------------------------------------------------------------------

test("baseline routing: pendingBoardedDestinations - vide quand pas de passagers", () => {
  assert.deepEqual(pendingBoardedDestinations(0, []), []);
});

test("baseline routing: pendingBoardedDestinations - exclut les destinations egales au palier courant", () => {
  const list = pendingBoardedDestinations(5, [
    passenger("a", 0, 5),
    passenger("b", 0, 8),
  ]);
  assert.deepEqual(list, [8]);
});

test("baseline routing: pendingBoardedDestinations - dedupe les destinations identiques", () => {
  const list = pendingBoardedDestinations(0, [
    passenger("a", 0, 5),
    passenger("b", 0, 5),
  ]);
  assert.deepEqual(list, [5]);
});

// ---------------------------------------------------------------------------
// effectiveServiceDirection
// ---------------------------------------------------------------------------

test("baseline routing: effectiveServiceDirection - retourne la direction explicite quand non-idle", () => {
  assert.equal(effectiveServiceDirection(0, "up", []), "up");
  assert.equal(effectiveServiceDirection(0, "down", []), "down");
});

test("baseline routing: effectiveServiceDirection - idle sans passager reste idle", () => {
  assert.equal(effectiveServiceDirection(0, "idle", []), "idle");
});

test("baseline routing: effectiveServiceDirection - idle avec passager au-dessus -> up", () => {
  assert.equal(effectiveServiceDirection(0, "idle", [passenger("a", 0, 5)]), "up");
});

test("baseline routing: effectiveServiceDirection - idle avec passager en-dessous -> down", () => {
  assert.equal(
    effectiveServiceDirection(5, "idle", [passenger("a", 5, 0)]),
    "down",
  );
});

test("baseline routing: effectiveServiceDirection - idle, passagers au-dessus ET en-dessous -> nearest", () => {
  // au cur=5 : 8 distance 3, 2 distance 3 -> tie. reduce conserve le 1er candidat.
  const dirA = effectiveServiceDirection(5, "idle", [
    passenger("a", 0, 8),
    passenger("b", 0, 2),
  ]);
  // 8 arrive en premier dans la liste, distance(8) === distance(2), donc 8 reste -> up.
  assert.equal(dirA, "up");

  const dirB = effectiveServiceDirection(5, "idle", [
    passenger("b", 0, 2),
    passenger("a", 0, 8),
  ]);
  assert.equal(dirB, "down");
});

// ---------------------------------------------------------------------------
// nextBoardedDropoffSortOrder
// ---------------------------------------------------------------------------

test("baseline routing: nextBoardedDropoffSortOrder - null sans passager", () => {
  assert.equal(nextBoardedDropoffSortOrder(0, "up", []), null);
});

test("baseline routing: nextBoardedDropoffSortOrder - idle : nearest absolu", () => {
  const drop = nextBoardedDropoffSortOrder(5, "idle", [
    passenger("a", 0, 12),
    passenger("b", 0, 2),
  ]);
  // distance(12)=7, distance(2)=3 -> 2 plus proche.
  assert.equal(drop, 2);
});

test("baseline routing: nextBoardedDropoffSortOrder - up : prend le min des destinations au-dessus", () => {
  const drop = nextBoardedDropoffSortOrder(0, "up", [
    passenger("a", 0, 8),
    passenger("b", 0, 5),
    passenger("c", 0, 12),
  ]);
  assert.equal(drop, 5);
});

test("baseline routing: nextBoardedDropoffSortOrder - up sans destination au-dessus : retourne max en-dessous", () => {
  const drop = nextBoardedDropoffSortOrder(10, "up", [
    passenger("a", 0, 5),
    passenger("b", 0, 2),
  ]);
  assert.equal(drop, 5);
});

test("baseline routing: nextBoardedDropoffSortOrder - down : prend le max des destinations en-dessous", () => {
  const drop = nextBoardedDropoffSortOrder(10, "down", [
    passenger("a", 0, 8),
    passenger("b", 0, 5),
    passenger("c", 0, 2),
  ]);
  assert.equal(drop, 8);
});

test("baseline routing: nextBoardedDropoffSortOrder - down sans destination en-dessous : retourne min au-dessus", () => {
  const drop = nextBoardedDropoffSortOrder(0, "down", [
    passenger("a", 0, 8),
    passenger("b", 0, 5),
  ]);
  assert.equal(drop, 5);
});

// ---------------------------------------------------------------------------
// directionToward
// ---------------------------------------------------------------------------

test("baseline routing: directionToward - up/down/idle", () => {
  assert.equal(directionToward(0, 5), "up");
  assert.equal(directionToward(5, 0), "down");
  assert.equal(directionToward(5, 5), "idle");
});

// ---------------------------------------------------------------------------
// inferPickupPhaseDirection
// ---------------------------------------------------------------------------

test("baseline routing: inferPickupPhaseDirection - retourne la direction explicite quand non-idle", () => {
  assert.equal(inferPickupPhaseDirection(0, "up", []), "up");
  assert.equal(inferPickupPhaseDirection(0, "down", []), "down");
});

test("baseline routing: inferPickupPhaseDirection - idle sans demande -> idle", () => {
  assert.equal(inferPickupPhaseDirection(0, "idle", []), "idle");
});

test("baseline routing: inferPickupPhaseDirection - idle, demande au-dessus same dir -> up", () => {
  assert.equal(
    inferPickupPhaseDirection(0, "idle", [{ from_sort_order: 5, direction: "up" }]),
    "up",
  );
});

test("baseline routing: inferPickupPhaseDirection - idle, geo down mais aucune demande down -> opposite up", () => {
  assert.equal(
    inferPickupPhaseDirection(5, "idle", [{ from_sort_order: 2, direction: "up" }]),
    "up",
  );
});

test("baseline routing: inferPickupPhaseDirection - idle, demande au palier courant -> idle", () => {
  assert.equal(
    inferPickupPhaseDirection(0, "idle", [{ from_sort_order: 0, direction: "up" }]),
    "idle",
  );
});

// ---------------------------------------------------------------------------
// pickupFromSortOnSegmentToDropoff
// ---------------------------------------------------------------------------

test("baseline routing: pickupFromSortOnSegmentToDropoff - up : strictement entre cur et drop", () => {
  assert.equal(pickupFromSortOnSegmentToDropoff(3, 0, 5), true);
  assert.equal(pickupFromSortOnSegmentToDropoff(0, 0, 5), false);
  assert.equal(pickupFromSortOnSegmentToDropoff(5, 0, 5), false);
});

test("baseline routing: pickupFromSortOnSegmentToDropoff - down : strictement entre cur et drop", () => {
  assert.equal(pickupFromSortOnSegmentToDropoff(3, 5, 0), true);
  assert.equal(pickupFromSortOnSegmentToDropoff(0, 5, 0), false);
});

test("baseline routing: pickupFromSortOnSegmentToDropoff - idle (cur==drop) -> false", () => {
  assert.equal(pickupFromSortOnSegmentToDropoff(3, 5, 5), false);
});

// ---------------------------------------------------------------------------
// nearestEligiblePickupFloorSCAN
// ---------------------------------------------------------------------------

test("baseline routing: nearestEligiblePickupFloorSCAN - aucun candidat -> null", () => {
  assert.equal(nearestEligiblePickupFloorSCAN(0, "up", []), null);
});

test("baseline routing: nearestEligiblePickupFloorSCAN - candidat au palier courant : palier courant gagne", () => {
  assert.equal(
    nearestEligiblePickupFloorSCAN(3, "up", [
      { from_sort_order: 3, sequence_number: 9 },
      { from_sort_order: 5, sequence_number: 1 },
    ]),
    3,
  );
});

test("baseline routing: nearestEligiblePickupFloorSCAN - phase up : plus bas au-dessus", () => {
  assert.equal(
    nearestEligiblePickupFloorSCAN(0, "up", [
      { from_sort_order: 5, sequence_number: 1 },
      { from_sort_order: 2, sequence_number: 9 },
      { from_sort_order: 8, sequence_number: 5 },
    ]),
    2,
  );
});

test("baseline routing: nearestEligiblePickupFloorSCAN - phase up sans candidat au-dessus -> null", () => {
  assert.equal(
    nearestEligiblePickupFloorSCAN(10, "up", [
      { from_sort_order: 5, sequence_number: 1 },
      { from_sort_order: 2, sequence_number: 9 },
    ]),
    null,
  );
});

test("baseline routing: nearestEligiblePickupFloorSCAN - phase down : plus haut en-dessous", () => {
  assert.equal(
    nearestEligiblePickupFloorSCAN(10, "down", [
      { from_sort_order: 5, sequence_number: 1 },
      { from_sort_order: 8, sequence_number: 9 },
      { from_sort_order: 2, sequence_number: 5 },
    ]),
    8,
  );
});

test("baseline routing: nearestEligiblePickupFloorSCAN - idle : plus proche distance, tie-break sort, puis seq", () => {
  // cur=5 ; candidats : 8 (d=3, seq=10), 2 (d=3, seq=2) -> tie distance, seq=2 plus bas...
  // Code : si distance egale, le plus PETIT sort gagne (sa < sb).
  assert.equal(
    nearestEligiblePickupFloorSCAN(5, "idle", [
      { from_sort_order: 8, sequence_number: 10 },
      { from_sort_order: 2, sequence_number: 2 },
    ]),
    2,
  );
});

// ---------------------------------------------------------------------------
// openPickupsTowardNextDropoff
// ---------------------------------------------------------------------------

test("baseline routing: openPickupsTowardNextDropoff - up : inclut cur et entre cur/drop exclus", () => {
  const reqs = [
    { id: "a", from_sort_order: 0 }, // cur
    { id: "b", from_sort_order: 3 }, // entre 0 et 5
    { id: "c", from_sort_order: 5 }, // = drop, exclu
    { id: "d", from_sort_order: 7 }, // > drop, exclu
  ];
  const filtered = openPickupsTowardNextDropoff(reqs, 0, 5);
  assert.deepEqual(
    filtered.map((r) => r.id),
    ["a", "b"],
  );
});

test("baseline routing: openPickupsTowardNextDropoff - travel idle (cur==drop) : seul cur passe", () => {
  const reqs = [
    { id: "a", from_sort_order: 5 },
    { id: "b", from_sort_order: 6 },
  ];
  const filtered = openPickupsTowardNextDropoff(reqs, 5, 5);
  assert.deepEqual(
    filtered.map((r) => r.id),
    ["a"],
  );
});

// ---------------------------------------------------------------------------
// targetForDirection
// ---------------------------------------------------------------------------

test("baseline routing: targetForDirection - up : max stop >= cur", () => {
  const limit = targetForDirection(
    2,
    "up",
    [{ from_sort_order: 5, to_sort_order: 8 }],
    [],
  );
  assert.equal(limit, 8);
});

test("baseline routing: targetForDirection - down : min stop <= cur", () => {
  const limit = targetForDirection(
    8,
    "down",
    [{ from_sort_order: 5, to_sort_order: 2 }],
    [],
  );
  assert.equal(limit, 2);
});

test("baseline routing: targetForDirection - idle : retourne cur", () => {
  assert.equal(targetForDirection(3, "idle", [], []), 3);
});

test("baseline routing: targetForDirection - inclut destinations passagers a bord", () => {
  const limit = targetForDirection(2, "up", [], [passenger("p", 0, 7)]);
  assert.equal(limit, 7);
});

// ---------------------------------------------------------------------------
// routeLimitForElevator
// ---------------------------------------------------------------------------

test("baseline routing: routeLimitForElevator - direction idle ou stops vide -> currentSort", () => {
  assert.equal(routeLimitForElevator(3, "idle", [5, 8]), 3);
  assert.equal(routeLimitForElevator(3, "up", []), 3);
});

test("baseline routing: routeLimitForElevator - up : max stop >= cur", () => {
  assert.equal(routeLimitForElevator(2, "up", [5, 8, 1]), 8);
});

test("baseline routing: routeLimitForElevator - down : min stop <= cur", () => {
  assert.equal(routeLimitForElevator(8, "down", [5, 2, 10]), 2);
});

// ---------------------------------------------------------------------------
// hoistQueueToActivePassengersBoarded / hoistQueueToShaftRequests
// ---------------------------------------------------------------------------

test("baseline routing: hoistQueueToActivePassengersBoarded - ne garde que status='boarded' et expose les sort_order", () => {
  const queue = [
    {
      id: "r1",
      from_floor_id: "rdc",
      to_floor_id: "5",
      passenger_count: 2,
      status: "boarded",
      updated_at: "2026-04-30T11:58:00.000Z",
    },
    {
      id: "r2",
      from_floor_id: "rdc",
      to_floor_id: "5",
      passenger_count: 1,
      status: "pending",
      updated_at: "2026-04-30T11:58:00.000Z",
    },
  ] as unknown as HoistRequest[];
  const sortMap: Record<string, number> = { rdc: 0, "5": 5 };
  const list = hoistQueueToActivePassengersBoarded(queue, (id) => sortMap[id] ?? 0);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.requestId, "r1");
  assert.equal(list[0]?.from_sort_order, 0);
  assert.equal(list[0]?.to_sort_order, 5);
  assert.equal(list[0]?.passenger_count, 2);
});

test("baseline routing: hoistQueueToShaftRequests - mappe from/to_floor_id en sort_order", () => {
  const queue = [
    {
      id: "r1",
      from_floor_id: "rdc",
      to_floor_id: "5",
      status: "pending",
    },
  ] as unknown as HoistRequest[];
  const sortMap: Record<string, number> = { rdc: 0, "5": 5 };
  const stops = hoistQueueToShaftRequests(queue, (id) => sortMap[id] ?? 0);
  assert.deepEqual(stops, [{ from_sort_order: 0, to_sort_order: 5 }]);
});

// ---------------------------------------------------------------------------
// estimateFloorsToReachPickup
// ---------------------------------------------------------------------------

test("baseline routing: estimateFloorsToReachPickup - sans passager : distance directe vers le pickup", () => {
  assert.equal(estimateFloorsToReachPickup(0, "idle", [], 5), 5);
  assert.equal(estimateFloorsToReachPickup(5, "idle", [], 0), 5);
});

test("baseline routing: estimateFloorsToReachPickup - avec passager a deposer en chemin : ajoute le detour", () => {
  // cabine au 0, passager pour 8, pickup demande au 12. Trajet : 0 -> 8 (drop) -> 12.
  // Cout = 8 + 4 = 12.
  const cost = estimateFloorsToReachPickup(0, "up", [passenger("p", 0, 8)], 12);
  assert.equal(cost, 12);
});

test("baseline routing: estimateFloorsToReachPickup - pickup en dessous mais passager au dessus : detour total", () => {
  // cabine au 5, passager pour 10, pickup demande au 0.
  // Trajet : 5 -> 10 (drop) -> 0. Cout = 5 + 10 = 15.
  const cost = estimateFloorsToReachPickup(5, "up", [passenger("p", 5, 10)], 0);
  assert.equal(cost, 15);
});
