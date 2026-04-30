import type { Elevator, Floor, HoistRequest } from "@/types/hoist";
import {
  effectiveServiceDirection,
  estimateFloorsToReachPickup,
  hoistQueueToActivePassengersBoarded,
  hoistQueueToShaftRequests,
  isBetween,
  routeLimitForElevator,
} from "@/lib/elevatorRouting";
import { isOperatorTabletSessionStale } from "@/lib/operatorTablet";

type DispatchableRequest = Pick<
  HoistRequest,
  "from_floor_id" | "to_floor_id" | "direction" | "passenger_count" | "priority" | "wait_started_at"
>;

type DispatchElevator = Elevator & {
  queue: HoistRequest[];
  current_sort_order: number;
};

export type ElevatorAssignment = {
  elevatorId: string | null;
  score: number;
  reason: string;
};

const ACTIVE_REQUEST_STATUSES = new Set(["pending", "assigned", "arriving", "boarded"]);

function floorSortOrder(floors: Floor[], floorId: string | null) {
  return floors.find((floor) => floor.id === floorId)?.sort_order ?? 0;
}

function minutesWaiting(request: DispatchableRequest) {
  return Math.max(0, Math.floor((Date.now() - new Date(request.wait_started_at).getTime()) / 60000));
}

/**
 * Assignation multi-cabines : même géométrie que le dispatch cabine ([`lib/elevatorRouting`](lib/elevatorRouting)),
 * plus estimation du trajet jusqu’au palier d’appel (déposes SCAN avant ramassage).
 */
function scoreElevator(
  elevator: DispatchElevator,
  request: DispatchableRequest,
  floors: Floor[],
  prioritiesEnabled: boolean,
) {
  const cur = elevator.current_sort_order;
  const fromSort = floorSortOrder(floors, request.from_floor_id);
  const floorSort = (floorId: string) => floorSortOrder(floors, floorId);

  const boardedActive = hoistQueueToActivePassengersBoarded(elevator.queue, floorSort);
  const effectiveDir = effectiveServiceDirection(cur, elevator.direction, boardedActive);

  const shaftStops = hoistQueueToShaftRequests(elevator.queue, floorSort).flatMap((s) => [
    s.from_sort_order,
    s.to_sort_order,
  ]);
  const routeLimit = routeLimitForElevator(cur, effectiveDir, shaftStops);

  const sameDirection = effectiveDir !== "idle" && effectiveDir === request.direction;
  const onRoute =
    effectiveDir === "idle"
      ? fromSort === cur
      : sameDirection && isBetween(fromSort, cur, routeLimit);

  const remainingCapacity = Math.max(0, elevator.capacity - elevator.current_load);
  const queuePenalty = elevator.queue.length * 4;
  /** Pleins ou quasi pleins : fortement privilegier une autre cabine avec place (aller-retour plus tard). */
  let capacityPenalty = 0;
  if (request.passenger_count > elevator.capacity) {
    capacityPenalty = 1000;
  } else if (remainingCapacity === 0) {
    capacityPenalty = 440;
  } else if (request.passenger_count > remainingCapacity) {
    capacityPenalty = 160 + (request.passenger_count - remainingCapacity) * 42;
  }
  const tightStopPenalty =
    onRoute && sameDirection && Math.abs(fromSort - cur) <= 1 && elevator.queue.length > 0 ? 160 : 0;
  const detourPenalty = onRoute ? 0 : Math.abs(fromSort - cur) * 18;
  const directionBonus = sameDirection ? -20 : effectiveDir === "idle" ? -8 : 24;
  const priorityBonus = prioritiesEnabled && request.priority ? -60 : 0;
  const waitBonus = -Math.min(45, minutesWaiting(request));

  const etaFloors = estimateFloorsToReachPickup(cur, elevator.direction, boardedActive, fromSort);

  return (
    etaFloors * 14 +
    detourPenalty +
    queuePenalty +
    capacityPenalty +
    tightStopPenalty +
    directionBonus +
    priorityBonus +
    waitBonus
  );
}

export function assignRequestToBestElevator({
  request,
  elevators,
  floors,
  requests,
  prioritiesEnabled = true,
}: {
  request: DispatchableRequest;
  elevators: Elevator[];
  floors: Floor[];
  requests: HoistRequest[];
  prioritiesEnabled?: boolean;
}): ElevatorAssignment {
  const candidates: DispatchElevator[] = elevators
    .filter(
      (elevator) =>
        Boolean(elevator.operator_session_id) &&
        !isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at),
    )
    .map((elevator) => ({
      ...elevator,
      queue: requests.filter(
        (item) => item.elevator_id === elevator.id && ACTIVE_REQUEST_STATUSES.has(item.status),
      ),
      current_sort_order: floorSortOrder(floors, elevator.current_floor_id),
    }));

  if (candidates.length === 0) {
    return { elevatorId: null, score: Number.POSITIVE_INFINITY, reason: "Aucun elevateur operateur actif." };
  }

  const scored = candidates
    .map((elevator) => ({
      elevator,
      score: scoreElevator(elevator, request, floors, prioritiesEnabled),
    }))
    .sort((a, b) => a.score - b.score || a.elevator.queue.length - b.elevator.queue.length);

  const winner = scored[0];

  return {
    elevatorId: winner.elevator.id,
    score: winner.score,
    reason: `Assigne a ${winner.elevator.name} (proximite apres deposes et charge, comme un hall collectif).`,
  };
}
