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
  routeLimitForElevator,
} from "../lib/elevatorRouting";
import { formatFloorLabel, floorLabelForSortOrder } from "../lib/utils";
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
  /** Places attribuables pour cette vague : min(demande, capacité cabine, places libres). */
  assignableChunk: number;
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
  /** Défini lorsque le meilleur ascenseur peut prendre une partie du groupe (split). */
  assignableChunk?: number;
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
    label: floorLabelForSortOrder(sortOrder),
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
  return formatFloorLabel(floor);
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

function requestFitsPlannedWaitingRoute({
  request,
  queue,
  projectFloors,
}: {
  request: Pick<NewBrainRequest, "from_floor_id" | "to_floor_id" | "direction">;
  queue: BrainRequest[];
  projectFloors: Floor[];
}): boolean {
  const fromSort = floorSortOrder(projectFloors, request.from_floor_id);
  const toSort = floorSortOrder(projectFloors, request.to_floor_id);
  return queue.some((queued) => {
    if (!WAITING_STATUSES.has(queued.status) || queued.direction !== request.direction) {
      return false;
    }
    const queuedFrom = floorSortOrder(projectFloors, queued.from_floor_id);
    const queuedTo = floorSortOrder(projectFloors, queued.to_floor_id);
    if (request.direction === "up") {
      return queuedFrom <= fromSort && fromSort <= queuedTo && fromSort <= toSort && toSort <= queuedTo;
    }
    if (request.direction === "down") {
      return queuedFrom >= fromSort && fromSort >= queuedTo && fromSort >= toSort && toSort >= queuedTo;
    }
    return false;
  });
}

function scoreElevatorForRequest({
  elevator,
  request,
  activeRequests,
  projectFloors,
  prioritiesEnabled,
  capacityEnabled,
  nowMs,
}: {
  elevator: BrainElevator;
  request: NewBrainRequest;
  activeRequests: BrainRequest[];
  projectFloors: Floor[];
  prioritiesEnabled: boolean;
  capacityEnabled: boolean;
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
  const plannedRouteFit = requestFitsPlannedWaitingRoute({ request, queue, projectFloors });
  const sameDirection = requestWouldTravelWithDirection(request, effectiveDirection) || plannedRouteFit;
  const onRoute = plannedRouteFit
    ? true
    : effectiveDirection === "idle"
      ? fromSort === currentSort
      : sameDirection && isBetween(fromSort, currentSort, routeLimit);
  const computedLoad =
    Math.max(Number(elevator.current_load ?? 0), activeLoadFromQueue(queue)) + reservedPickupLoadFromQueue(queue);
  const remainingCapacity = capacityEnabled ? Math.max(0, Number(elevator.capacity) - computedLoad) : request.passenger_count;
  const maxCabChunk = capacityEnabled ? Math.min(request.passenger_count, Number(elevator.capacity)) : request.passenger_count;
  const assignableChunk = Math.min(maxCabChunk, remainingCapacity);
  const etaFloors = estimateFloorsToReachPickup(currentSort, effectiveDirection, boarded, fromSort);
  const queueDepth = queue.filter((item) => item.status !== "boarded").length;
  const waitMinutes = minutesWaiting(request.wait_started_at, nowMs);

  const penalties: Record<string, number> = {
    eta: etaFloors * 18,
    detour: onRoute ? 0 : Math.abs(fromSort - currentSort) * 26,
    queue: queueDepth * 10,
    direction: effectiveDirection === "idle" || sameDirection ? 0 : 130,
    offRoute: onRoute || effectiveDirection === "idle" ? 0 : 90,
    full: capacityEnabled && remainingCapacity <= 0 ? 900 : 0,
    insufficientCapacity:
      capacityEnabled && assignableChunk > 0 && assignableChunk < request.passenger_count
        ? Math.min(220, (request.passenger_count - assignableChunk) * 12)
        : 0,
    offline: elevator.online === false || elevator.active === false ? 4000 : 0,
    manualFull: elevator.manual_full === true ? 5000 : 0,
  };

  const bonuses: Record<string, number> = {
    onRoute: onRoute ? 160 : 0,
    sameDirection: sameDirection ? 100 : 0,
    idle: effectiveDirection === "idle" ? 55 : 0,
    priority: prioritiesEnabled && request.priority ? 180 : 0,
    age: Math.min(150, waitMinutes * 3),
    /** Favorise la cabine qui peut vider plus du groupe en un trajet si le score est proche. */
    chunkThroughput: Math.min(75, assignableChunk * 5),
  };

  const penaltyTotal = Object.values(penalties).reduce((sum, value) => sum + value, 0);
  const bonusTotal = Object.values(bonuses).reduce((sum, value) => sum + value, 0);
  const score = penaltyTotal - bonusTotal;
  const eligible =
    elevator.active !== false && elevator.online !== false && elevator.manual_full !== true && assignableChunk > 0;

  return {
    elevatorId: elevator.id,
    elevatorName: elevator.name,
    score,
    eligible,
    reason: eligible
      ? `${elevator.name}: ${assignableChunk} passager(s) pour ce trajet, ETA ${etaFloors} étage(s), ${remainingCapacity} place(s) libre(s).`
      : `${elevator.name}: indisponible pour cette demande.`,
    etaFloors,
    remainingCapacity,
    assignableChunk,
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
  capacityEnabled = true,
  nowMs = Date.now(),
}: {
  newRequest: NewBrainRequest;
  elevators: BrainElevator[];
  activeRequests: BrainRequest[];
  onboardPassengers?: ActivePassenger[];
  projectFloors: Floor[];
  prioritiesEnabled?: boolean;
  capacityEnabled?: boolean;
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
        capacityEnabled,
        nowMs,
      }),
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.remainingCapacity - a.remainingCapacity ||
        b.assignableChunk - a.assignableChunk ||
        a.elevatorName.localeCompare(b.elevatorName),
    );

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
    assignableChunk: winner.assignableChunk,
  };
}

function capacityWarnings(request: DispatchRequest, capacity: number, remainingCapacity: number, capacityEnabled: boolean) {
  const warnings: OperatorActionResult["capacityWarnings"] = [];
  if (!capacityEnabled) {
    return warnings;
  }
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

function pickupReasonDetail(
  request: DispatchRequest,
  currentSort: number,
  prioritiesEnabled: boolean,
  floors: Floor[],
): DispatchRecommendationReason {
  return {
    kind: "pickup",
    atCurrentFloor: request.from_sort_order === currentSort,
    pickupLabel: floorLabel(floors, request.from_floor_id, request.from_sort_order),
    passengerCount: request.passenger_count,
    destinationLabel: floorLabel(floors, request.to_floor_id, request.to_sort_order),
    priority: prioritiesEnabled && request.priority,
  };
}

function filterPriorityPickupPool<T extends { priority: boolean }>(candidates: T[], prioritiesEnabled: boolean): T[] {
  if (!prioritiesEnabled || candidates.length === 0) {
    return candidates;
  }
  const prio = candidates.filter((r) => r.priority);
  return prio.length > 0 ? prio : candidates;
}

function resolvePickupFloorSCAN(currentSort: number, primaryPhaseDir: Direction, pool: DispatchRequest[]): number | null {
  const cands = pool.map((r) => ({
    from_sort_order: r.from_sort_order,
    sequence_number: r.sequence_number,
  }));
  let floor = nearestEligiblePickupFloorSCAN(currentSort, primaryPhaseDir, cands);
  if (floor === null && primaryPhaseDir !== "idle") {
    floor = nearestEligiblePickupFloorSCAN(currentSort, primaryPhaseDir === "up" ? "down" : "up", cands);
  }
  if (floor === null) {
    floor = nearestEligiblePickupFloorSCAN(currentSort, "idle", cands);
  }
  return floor;
}

function sortPickupsAtFloor(requests: DispatchRequest[]): DispatchRequest[] {
  return [...requests].sort(
    (a, b) => Number(b.priority) - Number(a.priority) || a.sequence_number - b.sequence_number,
  );
}

function collectivePickupWave(
  currentSort: number,
  requests: DispatchRequest[],
): { direction: Exclude<Direction, "idle">; targetFloor: number; pool: DispatchRequest[] } | null {
  const groups = (["up", "down"] as const)
    .map((direction) => {
      const pool = requests.filter((request) => request.direction === direction);
      if (pool.length === 0) return null;
      const targetFloor =
        direction === "up"
          ? Math.min(...pool.map((request) => Number(request.from_sort_order)))
          : Math.max(...pool.map((request) => Number(request.from_sort_order)));
      const oldestSequence = Math.min(...pool.map((request) => request.sequence_number));
      const oldestWait = Math.min(...pool.map((request) => new Date(request.wait_started_at).getTime()));
      const distance = Math.abs(targetFloor - currentSort);
      const score = pool.length * 90 - distance * 28 - oldestSequence * 0.5 - oldestWait / 60_000_000;
      return { direction, targetFloor, pool, score, oldestSequence };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score || a.oldestSequence - b.oldestSequence);

  return groups[0] ?? null;
}

export function computeNextOperatorAction({
  elevator,
  assignedRequests,
  onboardPassengers,
  projectFloors,
  prioritiesEnabled = true,
  capacityEnabled = true,
  nowMs = Date.now(),
}: {
  elevator: Elevator;
  assignedRequests: DispatchRequest[];
  onboardPassengers: ActivePassenger[];
  projectFloors: Floor[];
  prioritiesEnabled?: boolean;
  capacityEnabled?: boolean;
  nowMs?: number;
}): OperatorActionResult {
  void nowMs;
  const currentSort = floorSortOrder(projectFloors, elevator.current_floor_id);
  const openRequests = assignedRequests
    .filter((request) => WAITING_STATUSES.has(request.status))
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const activeLoad = onboardPassengers.reduce((sum, passenger) => sum + passenger.passenger_count, 0);
  const currentLoad = Math.max(Number(elevator.current_load ?? 0), activeLoad);
  const remainingCapacity = capacityEnabled ? Math.max(0, elevator.capacity - currentLoad) : Number.POSITIVE_INFINITY;
  const manualFull = elevator.manual_full === true;
  const serviceDirection = effectiveServiceDirection(currentSort, elevator.direction, onboardPassengers);
  const nextDropSort = nextBoardedDropoffSortOrder(currentSort, serviceDirection, onboardPassengers);

  if (nextDropSort !== null) {
    const travelDirection = directionToward(currentSort, nextDropSort);
    const geographic = openPickupsTowardNextDropoff(openRequests, currentSort, nextDropSort);
    const capacityOkAtPickup = manualFull
      ? []
      : capacityEnabled
        ? geographic.filter((request) => request.passenger_count <= remainingCapacity && request.passenger_count <= elevator.capacity)
        : geographic;
    const priorityPool = filterPriorityPickupPool(capacityOkAtPickup, prioritiesEnabled);
    const directionPool =
      travelDirection === "idle"
        ? priorityPool
        : priorityPool.filter((request) => request.direction === travelDirection);
    const targetFloor = resolvePickupFloorSCAN(currentSort, travelDirection, directionPool);

    if (targetFloor !== null) {
      const atFloor = sortPickupsAtFloor(
        directionPool.filter((r) => Number(r.from_sort_order) === Number(targetFloor)),
      );
      const primary = atFloor[0];
      if (primary) {
        const reasonDetail = pickupReasonDetail(primary, currentSort, prioritiesEnabled, projectFloors);
        return {
          action: "pickup",
          nextFloor: resolveFloorEntity(projectFloors, primary.from_sort_order),
          nextFloorSortOrder: primary.from_sort_order,
          primaryPickupRequestId: primary.id,
          reasonDetail,
          reason: formatDispatchRecommendationReason(reasonDetail, "fr", ""),
          requestsToPickup: atFloor,
          requestsToDropoff: [],
          suggestedDirection: directionToward(currentSort, primary.from_sort_order),
          capacityWarnings: geographic.flatMap((request) =>
            capacityWarnings(request, elevator.capacity, remainingCapacity, capacityEnabled),
          ),
        };
      }
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

  /* Sans dépose à desservir hors étage courant, ne pas figer la phase sur `elevator.direction` :
   * la ligne en base peut rester « up » quelques centaines de ms après une action — sinon les appels
   * dans l’autre sens sont exclus et la carte « direction / prochain palier » reste bloquée. */
  const noAwayBoardedDestinations = pendingBoardedDestinations(currentSort, onboardPassengers).length === 0;
  const idleCapacityOk = manualFull
    ? []
    : capacityEnabled
      ? openRequests.filter((request) => request.passenger_count <= remainingCapacity && request.passenger_count <= elevator.capacity)
      : openRequests;
  const idlePriorityPool = filterPriorityPickupPool(idleCapacityOk, prioritiesEnabled);

  const wave = noAwayBoardedDestinations ? collectivePickupWave(currentSort, idlePriorityPool) : null;
  const idlePhaseDirection = wave
    ? wave.direction
    : inferPickupPhaseDirection(
        currentSort,
        noAwayBoardedDestinations ? "idle" : elevator.direction,
        openRequests,
      );
  let idleDirectionPool = wave
    ? wave.pool
    : idlePhaseDirection === "idle"
      ? idlePriorityPool
      : idlePriorityPool.filter((request) => request.direction === idlePhaseDirection);
  let idleResolvePhase = idlePhaseDirection;
  if (!wave && idleResolvePhase !== "idle" && idleDirectionPool.length === 0 && idlePriorityPool.length > 0) {
    idleResolvePhase = "idle";
    idleDirectionPool = idlePriorityPool;
  }
  /** Ordre chantier : min `sequence_number` dans la vague courante (montée uniquement).
   * En descente, la vague impose déjà max(palier départ) — le plus haut d’abord, puis on descend ; ne pas forcer un palier plus bas à cause du dossier. */
  const chantierLead =
    noAwayBoardedDestinations && idleDirectionPool.length > 0
      ? [...idleDirectionPool].sort((a, b) => a.sequence_number - b.sequence_number)[0]
      : null;
  const useChantierOrderForFirstPickup = chantierLead !== null && idlePhaseDirection === "up";

  const idleTargetFloorFromScan = wave?.targetFloor ?? resolvePickupFloorSCAN(currentSort, idleResolvePhase, idleDirectionPool);
  const idleTargetFloor = useChantierOrderForFirstPickup
    ? Number(chantierLead!.from_sort_order)
    : idleTargetFloorFromScan;
  const warnings = openRequests.flatMap((request) =>
    capacityWarnings(request, elevator.capacity, remainingCapacity, capacityEnabled),
  );

  if (idleTargetFloor === null) {
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

  const idleAtFloor = sortPickupsAtFloor(
    (useChantierOrderForFirstPickup ? idlePriorityPool : idleDirectionPool).filter(
      (r) => Number(r.from_sort_order) === Number(idleTargetFloor),
    ),
  );
  const idlePrimary = idleAtFloor[0];
  if (!idlePrimary) {
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

  const idlePickupDetail = pickupReasonDetail(idlePrimary, currentSort, prioritiesEnabled, projectFloors);

  return {
    action: "pickup",
    nextFloor: resolveFloorEntity(projectFloors, idlePrimary.from_sort_order),
    nextFloorSortOrder: idlePrimary.from_sort_order,
    primaryPickupRequestId: idlePrimary.id,
    reasonDetail: idlePickupDetail,
    reason: formatDispatchRecommendationReason(idlePickupDetail, "fr", ""),
    requestsToPickup: idleAtFloor,
    requestsToDropoff: [],
    suggestedDirection: directionToward(currentSort, idlePrimary.from_sort_order),
    capacityWarnings: warnings,
  };
}

export function enrichDispatchRequests(requests: BrainRequest[], floors: Floor[]): DispatchRequest[] {
  return requests.map((request) => asDispatchRequest(request, floors));
}
