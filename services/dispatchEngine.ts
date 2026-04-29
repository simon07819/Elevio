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
}: {
  request: DispatchRequest;
  currentSortOrder: number;
  direction: Direction;
  capacity: number;
  remainingCapacity: number;
  oldestSequence: number;
  routeLimit: number;
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
  score += request.priority ? 1000 : 0;
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

function buildReason(
  currentFloor: Floor,
  winner: ScoredPickup | null,
  dropoffs: ActivePassenger[],
  remainingCapacity: number,
  suggestedDirection: Direction,
) {
  if (dropoffs.length > 0) {
    const total = dropoffs.reduce((sum, passenger) => sum + passenger.passenger_count, 0);
    return `Depose ${total} personne${total > 1 ? "s" : ""} avant de reprendre des demandes, ce qui libere de la capacite.`;
  }

  if (!winner) {
    return "Aucune demande maintenant.";
  }

  const target = winner.request.from_sort_order;
  const destination = winner.request.to_sort_order;
  const count = winner.request.passenger_count;
  const directionText = suggestedDirection === "up" ? "montent" : "descendent";
  const capacityText = remainingCapacity > 0 ? `il reste ${remainingCapacity} place${remainingCapacity > 1 ? "s" : ""}` : "la cabine est pleine";
  const routeText = winner.isOnRoute ? "c'est sur le chemin" : `detour limite de ${winner.detour} etage${winner.detour > 1 ? "s" : ""}`;
  const priorityText = winner.request.priority ? " Priorite active justifiee." : "";

  return `Arrete au ${target} avant le ${destination}, car ${count} personne${count > 1 ? "s" : ""} ${directionText} vers le ${destination}, ${routeText} et ${capacityText}.${priorityText}`;
}

export function getRecommendedNextStop({
  currentFloor,
  direction,
  requests,
  capacity,
  currentLoad,
  activePassengers,
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
      nextFloor: floorFromSortOrder(nextDropoffSort),
      nextFloorSortOrder: nextDropoffSort,
      reason: buildReason(currentFloor, null, requestsToDropoff, remainingCapacity, direction),
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
      reason: buildReason(currentFloor, null, [], remainingCapacity, direction),
      requestsToPickup: [],
      requestsToDropoff: [],
      suggestedDirection: "idle",
      capacityWarnings,
    };
  }

  const nextSortOrder = winner.request.from_sort_order;
  const suggestedDirection = nextSortOrder > currentSortOrder ? "up" : nextSortOrder < currentSortOrder ? "down" : winner.request.direction;
  const pickupAtSameStop = viable
    .filter((item) => item.request.from_sort_order === nextSortOrder)
    .map((item) => item.request);

  return {
    nextFloor: floorFromSortOrder(nextSortOrder),
    nextFloorSortOrder: nextSortOrder,
    reason: buildReason(currentFloor, winner, [], remainingCapacity, suggestedDirection),
    requestsToPickup: pickupAtSameStop,
    requestsToDropoff: [],
    suggestedDirection,
    capacityWarnings,
  };
}
