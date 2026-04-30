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

function isBetween(target: number, start: number, end: number) {
  return target >= Math.min(start, end) && target <= Math.max(start, end);
}

function targetForDirection(current: number, direction: Direction, requests: DispatchRequest[], active: ActivePassenger[]) {
  const requestStops = requests.flatMap((request) => [request.from_sort_order, request.to_sort_order]);
  const passengerStops = active.map((passenger) => passenger.to_sort_order);
  const allStops = [...requestStops, ...passengerStops];

  if (direction === "up") {
    return Math.max(current, ...allStops.filter((floor) => floor >= current));
  }

  if (direction === "down") {
    return Math.min(current, ...allStops.filter((floor) => floor <= current));
  }

  return current;
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

function buildReason(
  currentFloor: Floor,
  winner: ScoredPickup | null,
  dropoffs: ActivePassenger[],
  prioritiesEnabled: boolean,
  floors?: Floor[],
) {
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
  const currentSortOrder = currentFloor.sort_order;
  const openRequests = requests
    .filter((request) => WAITING_STATUSES.has(request.status))
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const oldestSequence = openRequests[0]?.sequence_number ?? Number.MAX_SAFE_INTEGER;
  const routeLimit = targetForDirection(currentSortOrder, direction, openRequests, activePassengers);

  const requestsToDropoff = activePassengers.filter((passenger) => {
    const target = passenger.to_sort_order;
    return target === currentSortOrder || (direction !== "idle" && isBetween(target, currentSortOrder, routeLimit));
  });

  if (requestsToDropoff.length > 0) {
    const nextDropoffSort = requestsToDropoff
      .map((passenger) => passenger.to_sort_order)
      .sort((a, b) => Math.abs(a - currentSortOrder) - Math.abs(b - currentSortOrder))[0];

    return {
      nextFloor: resolveFloorEntity(floors, nextDropoffSort),
      nextFloorSortOrder: nextDropoffSort,
      primaryPickupRequestId: null,
      reason: buildReason(currentFloor, null, requestsToDropoff, prioritiesEnabled, floors),
      requestsToPickup: [],
      requestsToDropoff,
      suggestedDirection: nextDropoffSort > currentSortOrder ? "up" : nextDropoffSort < currentSortOrder ? "down" : "idle",
      capacityWarnings: [],
    };
  }

  const scored = openRequests.map((request) =>
    scoreRequest({
      request,
      currentSortOrder,
      direction,
      capacity,
      remainingCapacity,
      oldestSequence,
      routeLimit,
      prioritiesEnabled,
    }),
  );

  const capacityWarnings = scored.flatMap((item) => item.warnings);
  const viable = scored
    .filter((item) => item.isCapacityValid)
    .sort((a, b) => b.score - a.score || a.request.sequence_number - b.request.sequence_number);

  const winner = viable[0] ?? null;

  if (!winner) {
    return {
      nextFloor: null,
      nextFloorSortOrder: null,
      primaryPickupRequestId: null,
      reason: buildReason(currentFloor, null, [], prioritiesEnabled, floors),
      requestsToPickup: [],
      requestsToDropoff: [],
      suggestedDirection: "idle",
      capacityWarnings,
    };
  }

  const nextSortOrder = winner.request.from_sort_order;
  /** Sens pour rejoindre le prochain arrêt — pas le trajet passager après embarquement (évite « monter » alors qu’on est déjà à l’étage). */
  const suggestedDirection =
    nextSortOrder > currentSortOrder ? "up" : nextSortOrder < currentSortOrder ? "down" : "idle";
  const pickupAtSameStop = viable
    .filter((item) => item.request.from_sort_order === nextSortOrder)
    .map((item) => item.request);

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
