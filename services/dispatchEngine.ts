import {
  directionToward,
  effectiveServiceDirection,
  inferPickupPhaseDirection,
  isBetween,
  nextBoardedDropoffSortOrder,
  pickupFromSortOnSegmentToDropoff,
  targetForDirection,
} from "@/lib/elevatorRouting";
import { formatFloorLabel } from "@/lib/utils";
import type {
  ActivePassenger,
  CapacityWarning,
  Direction,
  DispatchInput,
  DispatchRecommendation,
  DispatchRequest,
  Floor,
} from "@/types/hoist";

type ScoredPickup = {
  request: DispatchRequest;
  score: number;
  warnings: CapacityWarning[];
  isCapacityValid: boolean;
  isOnRoute: boolean;
  detour: number;
};

const WAITING_STATUSES = new Set(["pending", "assigned", "arriving"]);

function minutesWaiting(request: DispatchRequest) {
  return Math.max(0, Math.floor((Date.now() - new Date(request.wait_started_at).getTime()) / 60000));
}

function getWarnings(request: DispatchRequest, capacity: number, remainingCapacity: number): CapacityWarning[] {
  const warnings: CapacityWarning[] = [];

  if (request.passenger_count > remainingCapacity) {
    warnings.push({
      requestId: request.id,
      type: "insufficient_remaining",
      message: "Capacite insuffisante - prochain passage",
    });
  }

  if (request.passenger_count > capacity) {
    warnings.push({
      requestId: request.id,
      type: "group_exceeds_total",
      message: "Groupe trop grand - plusieurs passages requis",
    });
  }

  if (request.split_required) {
    warnings.push({
      requestId: request.id,
      type: "split_required",
      message: "Prise partielle recommandee",
    });
  }

  return warnings;
}

function scoreRequest({
  request,
  currentSortOrder,
  direction,
  capacity,
  remainingCapacity,
  oldestSequence,
  routeLimit,
  prioritiesEnabled,
}: {
  request: DispatchRequest;
  currentSortOrder: number;
  direction: Direction;
  capacity: number;
  remainingCapacity: number;
  oldestSequence: number;
  routeLimit: number;
  prioritiesEnabled: boolean;
}): ScoredPickup {
  const sameDirection = direction !== "idle" && request.direction === direction;
  const onRoute =
    direction === "idle" ||
    (sameDirection && isBetween(request.from_sort_order, currentSortOrder, routeLimit));
  const capacityValid = request.passenger_count <= remainingCapacity;
  const detour = onRoute ? 0 : Math.abs(request.from_sort_order - currentSortOrder);
  const warnings = getWarnings(request, capacity, remainingCapacity);
  const newerSkippingOld = request.sequence_number > oldestSequence && !onRoute;

  let score = 0;
  score += prioritiesEnabled && request.priority ? 1000 : 0;
  score += minutesWaiting(request);
  score += sameDirection ? 200 : 0;
  score += onRoute ? 300 : 0;
  score += capacityValid ? 100 : -300;
  score += request.passenger_count > capacity || request.split_required ? -500 : 0;
  score -= detour * 100;
  score -= newerSkippingOld ? 250 : 0;
  /** Les derniers appels paliers ne doublonnent pas la priorité des attentes déjà en file (ordre naturel ascenseur). */
  const seqLag =
    oldestSequence === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, request.sequence_number - oldestSequence);
  score -= Math.min(130, seqLag * 13);

  return {
    request,
    score,
    warnings,
    isCapacityValid: capacityValid && request.passenger_count <= capacity,
    isOnRoute: onRoute,
    detour,
  };
}

function floorFromSortOrder(sortOrder: number): Floor {
  return {
    id: `virtual-floor-${sortOrder}`,
    project_id: "virtual",
    label: sortOrder === 0 ? "RDC" : String(sortOrder),
    sort_order: sortOrder,
    qr_token: "",
    access_code: "",
    active: true,
  };
}

function resolveFloorEntity(floors: Floor[] | undefined, sortOrder: number): Floor {
  const row = floors?.find((f) => Number(f.sort_order) === Number(sortOrder));
  return row ?? floorFromSortOrder(sortOrder);
}

function resolveFloorLabel(floors: Floor[] | undefined, floorId: string, sortOrder: number): string {
  const row = floors?.find((f) => f.id === floorId);
  return formatFloorLabel(row ?? floorFromSortOrder(sortOrder));
}

function buildDropoffReason(dropoffs: ActivePassenger[], nextDropSort: number, floors?: Floor[]) {
  const total = dropoffs.reduce((sum, passenger) => sum + passenger.passenger_count, 0);
  const label = formatFloorLabel(resolveFloorEntity(floors, nextDropSort));
  return `Depose ${total} personne${total > 1 ? "s" : ""} a ${label} (arret cabine). Les appels paliers attendront la fin de cette sequence.`;
}

function buildReason(
  currentFloor: Floor,
  winner: ScoredPickup | null,
  dropoffs: ActivePassenger[],
  prioritiesEnabled: boolean,
  floors?: Floor[],
  nextDropSort?: number,
) {
  if (dropoffs.length > 0 && nextDropSort !== undefined) {
    return buildDropoffReason(dropoffs, nextDropSort, floors);
  }

  if (dropoffs.length > 0) {
    const total = dropoffs.reduce((sum, passenger) => sum + passenger.passenger_count, 0);
    return `Depose ${total} personne${total > 1 ? "s" : ""} avant de reprendre des demandes, ce qui libere de la capacite.`;
  }

  if (!winner) {
    return "Aucune demande maintenant.";
  }

  const req = winner.request;
  const atPickup = Number(currentFloor.sort_order) === Number(req.from_sort_order);
  const pickupLabel = resolveFloorLabel(floors, req.from_floor_id, req.from_sort_order);
  const destLabel = resolveFloorLabel(floors, req.to_floor_id, req.to_sort_order);
  const count = req.passenger_count;
  const tripDir = req.direction;
  const peoplePhrase =
    count === 1
      ? tripDir === "up"
        ? "1 personne monte"
        : "1 personne descend"
      : tripDir === "up"
        ? `${count} personnes montent`
        : `${count} personnes descendent`;
  const priorityText = prioritiesEnabled && req.priority ? " Priorite active justifiee." : "";

  if (atPickup) {
    return `${peoplePhrase} vers ${destLabel}.${priorityText}`;
  }

  return `Arrete a ${pickupLabel} avant ${destLabel}, car ${peoplePhrase} vers ${destLabel}.${priorityText}`;
}

/** Hall calls en attente mais aucune place pour les prendre maintenant (cab pleine ou groupes trop gros). */
function buildDeferredHallCallReason(remainingCapacity: number, openHallCallCount: number): string {
  if (openHallCallCount <= 0) {
    return "Aucune demande maintenant.";
  }
  if (remainingCapacity === 0) {
    return "Cabine pleine : deposer d'abord aux etages prevus. Les appels aux paliers attendent un passage suivant — comme un ascenseur reel, ils ne sont pas prioritaires sur la sequence en cours ; une autre cabine peut les prendre si elle a la place.";
  }
  return "Pas assez de place pour les groupes en attente aux paliers. Poursuivez les depots ou des passages partiels ; ils seront repris ensuite sans priorite artificielle sur les derniers appels.";
}

export function getRecommendedNextStop({
  currentFloor,
  direction,
  requests,
  capacity,
  currentLoad,
  activePassengers,
  floors,
  prioritiesEnabled = true,
}: DispatchInput): DispatchRecommendation {
  const remainingCapacity = Math.max(0, capacity - currentLoad);
  const currentSortOrder = Number(currentFloor.sort_order);
  const openRequests = requests
    .filter((request) => WAITING_STATUSES.has(request.status))
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const oldestSequence = openRequests[0]?.sequence_number ?? Number.MAX_SAFE_INTEGER;

  const serviceDir = effectiveServiceDirection(currentSortOrder, direction, activePassengers);
  const nextDropSort = nextBoardedDropoffSortOrder(currentSortOrder, serviceDir, activePassengers);

  if (nextDropSort !== null) {
    const travelDir = directionToward(currentSortOrder, nextDropSort);
    const segmentRouteLimit = nextDropSort;

    const enRouteCandidates = openRequests.filter((request) =>
      pickupFromSortOnSegmentToDropoff(request.from_sort_order, currentSortOrder, nextDropSort),
    );

    if (enRouteCandidates.length > 0 && travelDir !== "idle") {
      const scoredEnRoute = enRouteCandidates.map((request) =>
        scoreRequest({
          request,
          currentSortOrder,
          direction: travelDir,
          capacity,
          remainingCapacity,
          oldestSequence,
          routeLimit: segmentRouteLimit,
          prioritiesEnabled,
        }),
      );
      const viableEnRoute = scoredEnRoute
        .filter((item) => item.isCapacityValid)
        .sort((a, b) => b.score - a.score || a.request.sequence_number - b.request.sequence_number);

      const enRouteWinner = viableEnRoute[0];
      if (enRouteWinner) {
        const ns = enRouteWinner.request.from_sort_order;
        const pickupAtSameStop = viableEnRoute
          .filter((item) => item.request.from_sort_order === ns)
          .map((item) => item.request);
        const capacityWarnings = scoredEnRoute.flatMap((item) => item.warnings);
        return {
          nextFloor: resolveFloorEntity(floors, ns),
          nextFloorSortOrder: ns,
          primaryPickupRequestId: enRouteWinner.request.id,
          reason: buildReason(currentFloor, enRouteWinner, [], prioritiesEnabled, floors),
          requestsToPickup: pickupAtSameStop,
          requestsToDropoff: [],
          suggestedDirection: ns > currentSortOrder ? "up" : ns < currentSortOrder ? "down" : "idle",
          capacityWarnings,
        };
      }
    }

    const passengersDebarkingHere = activePassengers.filter(
      (passenger) => Number(passenger.to_sort_order) === Number(nextDropSort),
    );

    return {
      nextFloor: resolveFloorEntity(floors, nextDropSort),
      nextFloorSortOrder: nextDropSort,
      primaryPickupRequestId: null,
      reason: buildReason(currentFloor, null, passengersDebarkingHere, prioritiesEnabled, floors, nextDropSort),
      requestsToPickup: [],
      requestsToDropoff: passengersDebarkingHere,
      suggestedDirection:
        nextDropSort > currentSortOrder ? "up" : nextDropSort < currentSortOrder ? "down" : "idle",
      capacityWarnings: [],
    };
  }

  const pickupPhaseDirection = inferPickupPhaseDirection(currentSortOrder, direction, openRequests);
  const routeLimit = targetForDirection(currentSortOrder, pickupPhaseDirection, openRequests, activePassengers);

  const scored = openRequests.map((request) =>
    scoreRequest({
      request,
      currentSortOrder,
      direction: pickupPhaseDirection,
      capacity,
      remainingCapacity,
      oldestSequence,
      routeLimit,
      prioritiesEnabled,
    }),
  );

  const capacityWarnings = scored.flatMap((item) => item.warnings);
  const scoredSorted = [...scored].sort(
    (a, b) => b.score - a.score || a.request.sequence_number - b.request.sequence_number,
  );
  const viable = scoredSorted.filter((item) => item.isCapacityValid);
  const winner = viable[0] ?? null;

  if (!winner) {
    return {
      nextFloor: null,
      nextFloorSortOrder: null,
      primaryPickupRequestId: null,
      reason:
        openRequests.length === 0
          ? buildReason(currentFloor, null, [], prioritiesEnabled, floors)
          : buildDeferredHallCallReason(remainingCapacity, openRequests.length),
      requestsToPickup: [],
      requestsToDropoff: [],
      suggestedDirection: "idle",
      capacityWarnings,
    };
  }

  const nextSortOrder = winner.request.from_sort_order;
  const suggestedDirection =
    nextSortOrder > currentSortOrder ? "up" : nextSortOrder < currentSortOrder ? "down" : "idle";
  const pickupAtSameStop = viable.filter((item) => item.request.from_sort_order === nextSortOrder).map((item) => item.request);

  return {
    nextFloor: resolveFloorEntity(floors, nextSortOrder),
    nextFloorSortOrder: nextSortOrder,
    primaryPickupRequestId: winner.request.id,
    reason: buildReason(currentFloor, winner, [], prioritiesEnabled, floors),
    requestsToPickup: pickupAtSameStop,
    requestsToDropoff: [],
    suggestedDirection,
    capacityWarnings,
  };
}
