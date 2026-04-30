import {
  directionToward,
  effectiveServiceDirection,
  estimateFloorsToReachPickup,
  hoistQueueToActivePassengersBoarded,
  hoistQueueToShaftRequests,
  isBetween,
  nextBoardedDropoffSortOrder,
  pickupFromSortOnSegmentToDropoff,
  routeLimitForElevator,
} from "../lib/elevatorRouting";
import { formatDispatchRecommendationReason } from "../lib/recommendationReason";
import type {
  ActivePassenger,
  Direction,
  DispatchRecommendationReason,
  DispatchRequest,
  Elevator,
  Floor,
  HoistRequest,
  RequestStatus,
} from "../types/hoist";

export type BrainRequest = Pick<
  HoistRequest,
  | "id"
  | "elevator_id"
  | "from_floor_id"
  | "to_floor_id"
  | "direction"
  | "passenger_count"
  | "priority"
  | "wait_started_at"
  | "status"
  | "sequence_number"
>;

export type NewBrainRequest = Pick<
  HoistRequest,
  "from_floor_id" | "to_floor_id" | "direction" | "passenger_count" | "priority" | "wait_started_at"
> & {
  id?: string;
  sequence_number?: number;
};

export type BrainElevator = Elevator & {
  current_sort_order?: number;
  queue?: BrainRequest[];
  online?: boolean;
};

export type ElevatorScoreBreakdown = {
  elevatorId: string;
  elevatorName: string;
  score: number;
  eligible: boolean;
  reason: string;
  etaFloors: number;
  remainingCapacity: number;
  onRoute: boolean;
  sameDirection: boolean;
  effectiveDirection: Direction;
  penalties: Record<string, number>;
  bonuses: Record<string, number>;
};

export type BestElevatorResult = {
  elevatorId: string | null;
  score: number;
  reason: string;
  candidates: ElevatorScoreBreakdown[];
};

export type OperatorAction =
  | "pickup"
  | "dropoff"
  | "wait";

export type OperatorActionResult = {
  action: OperatorAction;
  nextFloor: Floor | null;
  nextFloorSortOrder: number | null;
  primaryPickupRequestId: string | null;
  reason: string;
  reasonDetail?: DispatchRecommendationReason;
  requestsToPickup: DispatchRequest[];
  requestsToDropoff: ActivePassenger[];
  suggestedDirection: Direction;
  capacityWarnings: Array<{
    requestId: string;
    type: "insufficient_remaining" | "group_exceeds_total" | "split_required";
    message: string;
  }>;
};

const WAITING_STATUSES = new Set<RequestStatus>(["pending", "assigned", "arriving"]);
const ACTIVE_REQUEST_STATUSES = new Set<RequestStatus>(["pending", "assigned", "arriving", "boarded"]);

function minutesWaiting(waitStartedAt: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(waitStartedAt).getTime()) / 60000));
}

export function floorSortOrder(floors: Floor[], floorId: string | null | undefined): number {
  return Number(floors.find((floor) => floor.id === floorId)?.sort_order ?? 0);
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
  return floors?.find((f) => Number(f.sort_order) === Number(sortOrder)) ?? floorFromSortOrder(sortOrder);
}

function floorLabel(floors: Floor[], floorId: string, sortOrder: number): string {
  const floor = floors.find((item) => item.id === floorId) ?? resolveFloorEntity(floors, sortOrder);
  if (Number(floor.sort_order) <= 0) {
    return floorFromSortOrder(Number(floor.sort_order)).label;
  }
  return floor.label || floorFromSortOrder(Number(floor.sort_order)).label;
}

function asDispatchRequest(request: BrainRequest, floors: Floor[]): DispatchRequest {
  return {
    ...(request as HoistRequest),
    from_sort_order: floorSortOrder(floors, request.from_floor_id),
    to_sort_order: floorSortOrder(floors, request.to_floor_id),
  };
}

function queueForElevator(requests: BrainRequest[], elevatorId: string): BrainRequest[] {
  return requests.filter((request) => request.elevator_id === elevatorId && ACTIVE_REQUEST_STATUSES.has(request.status));
}

function boardedForQueue(queue: BrainRequest[], floors: Floor[]): ActivePassenger[] {
  const sort = (floorId: string) => floorSortOrder(floors, floorId);
  return hoistQueueToActivePassengersBoarded(queue as HoistRequest[], sort);
}

function activeLoadFromQueue(queue: BrainRequest[]) {
  return queue
    .filter((request) => request.status === "boarded")
    .reduce((sum, request) => sum + Number(request.passenger_count ?? 0), 0);
}

function reservedPickupLoadFromQueue(queue: BrainRequest[]) {
  return queue
    .filter((request) => request.status === "pending" || request.status === "assigned" || request.status === "arriving")
    .reduce((sum, request) => sum + Number(request.passenger_count ?? 0), 0);
}

function requestPickupSort(request: Pick<BrainRequest, "from_floor_id">, floors: Floor[]) {
  return floorSortOrder(floors, request.from_floor_id);
}

function requestWouldTravelWithDirection(request: Pick<BrainRequest, "direction">, direction: Direction) {
  return direction !== "idle" && request.direction === direction;
}

function scoreElevatorForRequest({
  elevator,
  request,
  activeRequests,
  projectFloors,
  prioritiesEnabled,
  nowMs,
}: {
  elevator: BrainElevator;
  request: NewBrainRequest;
  activeRequests: BrainRequest[];
  projectFloors: Floor[];
  prioritiesEnabled: boolean;
  nowMs: number;
}): ElevatorScoreBreakdown {
  const queue = elevator.queue ?? queueForElevator(activeRequests, elevator.id);
  const currentSort = Number(elevator.current_sort_order ?? floorSortOrder(projectFloors, elevator.current_floor_id));
  const fromSort = requestPickupSort(request, projectFloors);
  const boarded = boardedForQueue(queue, projectFloors);
  const effectiveDirection = effectiveServiceDirection(currentSort, elevator.direction, boarded);
  const shaftStops = hoistQueueToShaftRequests(queue as HoistRequest[], (floorId) => floorSortOrder(projectFloors, floorId))
    .flatMap((stop) => [stop.from_sort_order, stop.to_sort_order]);
  const routeLimit = routeLimitForElevator(currentSort, effectiveDirection, shaftStops);
  const sameDirection = requestWouldTravelWithDirection(request, effectiveDirection);
  const onRoute =
    effectiveDirection === "idle"
      ? fromSort === currentSort
      : sameDirection && isBetween(fromSort, currentSort, routeLimit);
  const computedLoad =
    Math.max(Number(elevator.current_load ?? 0), activeLoadFromQueue(queue)) + reservedPickupLoadFromQueue(queue);
  const remainingCapacity = Math.max(0, Number(elevator.capacity) - computedLoad);
  const etaFloors = estimateFloorsToReachPickup(currentSort, effectiveDirection, boarded, fromSort);
  const queueDepth = queue.filter((item) => item.status !== "boarded").length;
  const waitMinutes = minutesWaiting(request.wait_started_at, nowMs);

  const penalties: Record<string, number> = {
    eta: etaFloors * 18,
    detour: onRoute ? 0 : Math.abs(fromSort - currentSort) * 26,
    queue: queueDepth * 10,
    direction: effectiveDirection === "idle" || sameDirection ? 0 : 130,
    offRoute: onRoute || effectiveDirection === "idle" ? 0 : 90,
    full: remainingCapacity <= 0 ? 900 : 0,
    insufficientCapacity: request.passenger_count > remainingCapacity ? 260 : 0,
    overElevatorCapacity: request.passenger_count > elevator.capacity ? 2000 : 0,
    offline: elevator.online === false || elevator.active === false ? 4000 : 0,
  };

  const bonuses: Record<string, number> = {
    onRoute: onRoute ? 160 : 0,
    sameDirection: sameDirection ? 100 : 0,
    idle: effectiveDirection === "idle" ? 55 : 0,
    priority: prioritiesEnabled && request.priority ? 180 : 0,
    age: Math.min(150, waitMinutes * 3),
  };

  const penaltyTotal = Object.values(penalties).reduce((sum, value) => sum + value, 0);
  const bonusTotal = Object.values(bonuses).reduce((sum, value) => sum + value, 0);
  const score = penaltyTotal - bonusTotal;
  const eligible =
    elevator.active !== false &&
    elevator.online !== false &&
    remainingCapacity > 0 &&
    request.passenger_count <= elevator.capacity;

  return {
    elevatorId: elevator.id,
    elevatorName: elevator.name,
    score,
    eligible,
    reason: eligible
      ? `${elevator.name}: ETA ${etaFloors} étage(s), ${remainingCapacity} place(s) libre(s).`
      : `${elevator.name}: indisponible pour cette demande.`,
    etaFloors,
    remainingCapacity,
    onRoute,
    sameDirection,
    effectiveDirection,
    penalties,
    bonuses,
  };
}

export function computeBestElevatorForRequest({
  newRequest,
  elevators,
  activeRequests,
  projectFloors,
  prioritiesEnabled = true,
  nowMs = Date.now(),
}: {
  newRequest: NewBrainRequest;
  elevators: BrainElevator[];
  activeRequests: BrainRequest[];
  onboardPassengers?: ActivePassenger[];
  projectFloors: Floor[];
  prioritiesEnabled?: boolean;
  nowMs?: number;
}): BestElevatorResult {
  if (newRequest.id) {
    const existing = activeRequests.find((request) => request.id === newRequest.id && request.elevator_id);
    if (existing?.elevator_id) {
      return {
        elevatorId: existing.elevator_id,
        score: Number.NEGATIVE_INFINITY,
        reason: "Demande déjà assignée ; conservation de l'ascenseur existant.",
        candidates: [],
      };
    }
  }

  const candidates = elevators
    .map((elevator) =>
      scoreElevatorForRequest({
        elevator,
        request: newRequest,
        activeRequests,
        projectFloors,
        prioritiesEnabled,
        nowMs,
      }),
    )
    .sort((a, b) => a.score - b.score || b.remainingCapacity - a.remainingCapacity || a.elevatorName.localeCompare(b.elevatorName));

  const winner = candidates.find((candidate) => candidate.eligible) ?? null;

  if (!winner) {
    return {
      elevatorId: null,
      score: Number.POSITIVE_INFINITY,
      reason: "Aucun ascenseur disponible avec capacité suffisante.",
      candidates,
    };
  }

  return {
    elevatorId: winner.elevatorId,
    score: winner.score,
    reason: winner.reason,
    candidates,
  };
}

function capacityWarnings(request: DispatchRequest, capacity: number, remainingCapacity: number) {
  const warnings: OperatorActionResult["capacityWarnings"] = [];
  if (request.passenger_count > remainingCapacity) {
    warnings.push({
      requestId: request.id,
      type: "insufficient_remaining",
      message: "Capacité insuffisante — prochain passage",
    });
  }
  if (request.passenger_count > capacity) {
    warnings.push({
      requestId: request.id,
      type: "group_exceeds_total",
      message: "Groupe trop grand — plusieurs passages requis",
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

function pickupScore({
  request,
  currentSortOrder,
  travelDirection,
  routeLimit,
  remainingCapacity,
  capacity,
  oldestSequence,
  prioritiesEnabled,
  nowMs,
}: {
  request: DispatchRequest;
  currentSortOrder: number;
  travelDirection: Direction;
  routeLimit: number;
  remainingCapacity: number;
  capacity: number;
  oldestSequence: number;
  prioritiesEnabled: boolean;
  nowMs: number;
}) {
  const sameDirection = requestWouldTravelWithDirection(request, travelDirection);
  const onRoute =
    travelDirection === "idle" ||
    (sameDirection && isBetween(request.from_sort_order, currentSortOrder, routeLimit));
  const capacityValid = request.passenger_count <= remainingCapacity && request.passenger_count <= capacity;
  const detour = onRoute ? 0 : Math.abs(request.from_sort_order - currentSortOrder);
  const age = minutesWaiting(request.wait_started_at, nowMs);
  const sequenceLag = oldestSequence === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, request.sequence_number - oldestSequence);

  let score = 0;
  score += prioritiesEnabled && request.priority ? 420 : 0;
  score += Math.min(220, age * 5);
  score += sameDirection ? 180 : 0;
  score += onRoute ? 280 : 0;
  score += capacityValid ? 120 : -1000;
  score -= detour * 130;
  score -= Math.min(180, sequenceLag * 16);
  score -= !onRoute && sequenceLag > 0 ? 180 : 0;

  return { score, onRoute, capacityValid };
}

function pickupReasonDetail(
  request: DispatchRequest,
  currentSort: number,
  prioritiesEnabled: boolean,
  floors: Floor[],
): DispatchRecommendationReason {
  return {
    kind: "pickup",
    atCurrentFloor: request.from_sort_order === currentSort,
    passengerCount: request.passenger_count,
    destinationLabel: floorLabel(floors, request.to_floor_id, request.to_sort_order),
    priority: prioritiesEnabled && request.priority,
  };
}

function scoreIdlePickupRequest({
  request,
  currentSortOrder,
  remainingCapacity,
  capacity,
  oldestSequence,
  prioritiesEnabled,
  nowMs,
}: {
  request: DispatchRequest;
  currentSortOrder: number;
  remainingCapacity: number;
  capacity: number;
  oldestSequence: number;
  prioritiesEnabled: boolean;
  nowMs: number;
}) {
  const capacityValid = request.passenger_count <= remainingCapacity && request.passenger_count <= capacity;
  const pickupDistance = Math.abs(request.from_sort_order - currentSortOrder);
  const age = minutesWaiting(request.wait_started_at, nowMs);
  const sequenceLag = oldestSequence === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, request.sequence_number - oldestSequence);

  let score = 0;
  score += capacityValid ? 1000 : -1000;
  score += prioritiesEnabled && request.priority ? 260 : 0;
  score += Math.min(220, age * 5);
  score -= pickupDistance * 90;
  score -= Math.min(260, sequenceLag * 18);

  return { request, score, capacityValid };
}

export function computeNextOperatorAction({
  elevator,
  assignedRequests,
  onboardPassengers,
  projectFloors,
  prioritiesEnabled = true,
  nowMs = Date.now(),
}: {
  elevator: Elevator;
  assignedRequests: DispatchRequest[];
  onboardPassengers: ActivePassenger[];
  projectFloors: Floor[];
  prioritiesEnabled?: boolean;
  nowMs?: number;
}): OperatorActionResult {
  const currentSort = floorSortOrder(projectFloors, elevator.current_floor_id);
  const openRequests = assignedRequests
    .filter((request) => WAITING_STATUSES.has(request.status))
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const activeLoad = onboardPassengers.reduce((sum, passenger) => sum + passenger.passenger_count, 0);
  const currentLoad = Math.max(Number(elevator.current_load ?? 0), activeLoad);
  const remainingCapacity = Math.max(0, elevator.capacity - currentLoad);
  const serviceDirection = effectiveServiceDirection(currentSort, elevator.direction, onboardPassengers);
  const nextDropSort = nextBoardedDropoffSortOrder(currentSort, serviceDirection, onboardPassengers);
  const oldestSequence = openRequests[0]?.sequence_number ?? Number.MAX_SAFE_INTEGER;

  if (nextDropSort !== null) {
    const travelDirection = directionToward(currentSort, nextDropSort);
    const enRoute = openRequests.filter(
      (request) =>
        request.direction === travelDirection &&
        pickupFromSortOnSegmentToDropoff(request.from_sort_order, currentSort, nextDropSort),
    );
    const scored = enRoute
      .map((request) => ({
        request,
        ...pickupScore({
          request,
          currentSortOrder: currentSort,
          travelDirection,
          routeLimit: nextDropSort,
          remainingCapacity,
          capacity: elevator.capacity,
          oldestSequence,
          prioritiesEnabled,
          nowMs,
        }),
      }))
      .sort((a, b) => b.score - a.score || a.request.sequence_number - b.request.sequence_number);
    const pickup = scored.find((item) => item.capacityValid);

    if (pickup) {
      const sameFloor = scored
        .filter((item) => item.capacityValid && item.request.from_sort_order === pickup.request.from_sort_order)
        .map((item) => item.request);
      const reasonDetail = pickupReasonDetail(pickup.request, currentSort, prioritiesEnabled, projectFloors);
      return {
        action: "pickup",
        nextFloor: resolveFloorEntity(projectFloors, pickup.request.from_sort_order),
        nextFloorSortOrder: pickup.request.from_sort_order,
        primaryPickupRequestId: pickup.request.id,
        reasonDetail,
        reason: formatDispatchRecommendationReason(reasonDetail, "fr", ""),
        requestsToPickup: sameFloor,
        requestsToDropoff: [],
        suggestedDirection: directionToward(currentSort, pickup.request.from_sort_order),
        capacityWarnings: enRoute.flatMap((request) => capacityWarnings(request, elevator.capacity, remainingCapacity)),
      };
    }

    const dropoffs = onboardPassengers.filter((passenger) => Number(passenger.to_sort_order) === Number(nextDropSort));
    const passengers = dropoffs.reduce((sum, p) => sum + p.passenger_count, 0);
    const dropDetail: DispatchRecommendationReason = { kind: "dropoff_before_pickups", passengers };
    return {
      action: "dropoff",
      nextFloor: resolveFloorEntity(projectFloors, nextDropSort),
      nextFloorSortOrder: nextDropSort,
      primaryPickupRequestId: null,
      reasonDetail: dropDetail,
      reason: formatDispatchRecommendationReason(dropDetail, "fr", ""),
      requestsToPickup: [],
      requestsToDropoff: dropoffs,
      suggestedDirection: directionToward(currentSort, nextDropSort),
      capacityWarnings: [],
    };
  }

  const scored = openRequests
    .map((request) =>
      scoreIdlePickupRequest({
        request,
        currentSortOrder: currentSort,
        remainingCapacity,
        capacity: elevator.capacity,
        oldestSequence,
        prioritiesEnabled,
        nowMs,
      }),
    )
    .sort((a, b) => b.score - a.score || a.request.sequence_number - b.request.sequence_number);
  const winner = scored.find((item) => item.capacityValid) ?? null;
  const warnings = openRequests.flatMap((request) => capacityWarnings(request, elevator.capacity, remainingCapacity));

  if (!winner) {
    const waitDetail: DispatchRecommendationReason =
      openRequests.length === 0 ? { kind: "idle_empty" } : { kind: "idle_blocked" };
    return {
      action: "wait",
      nextFloor: null,
      nextFloorSortOrder: null,
      primaryPickupRequestId: null,
      reasonDetail: waitDetail,
      reason: formatDispatchRecommendationReason(waitDetail, "fr", ""),
      requestsToPickup: [],
      requestsToDropoff: [],
      suggestedDirection: "idle",
      capacityWarnings: warnings,
    };
  }

  const pickupAtSameStop = scored
    .filter((item) => item.capacityValid && item.request.from_sort_order === winner.request.from_sort_order)
    .map((item) => item.request);

  const idlePickupDetail = pickupReasonDetail(winner.request, currentSort, prioritiesEnabled, projectFloors);

  return {
    action: "pickup",
    nextFloor: resolveFloorEntity(projectFloors, winner.request.from_sort_order),
    nextFloorSortOrder: winner.request.from_sort_order,
    primaryPickupRequestId: winner.request.id,
    reasonDetail: idlePickupDetail,
    reason: formatDispatchRecommendationReason(idlePickupDetail, "fr", ""),
    requestsToPickup: pickupAtSameStop,
    requestsToDropoff: [],
    suggestedDirection: directionToward(currentSort, winner.request.from_sort_order),
    capacityWarnings: warnings,
  };
}

export function enrichDispatchRequests(requests: BrainRequest[], floors: Floor[]): DispatchRequest[] {
  return requests.map((request) => asDispatchRequest(request, floors));
}
