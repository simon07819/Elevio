import type { Elevator, Floor, HoistRequest } from "@/types/hoist";
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

function isBetween(target: number, start: number, end: number) {
  return target >= Math.min(start, end) && target <= Math.max(start, end);
}

function routeLimit(elevator: DispatchElevator, floors: Floor[]) {
  const stops = elevator.queue.flatMap((request) => [
    floorSortOrder(floors, request.from_floor_id),
    floorSortOrder(floors, request.to_floor_id),
  ]);

  if (stops.length === 0) {
    return elevator.current_sort_order;
  }

  if (elevator.direction === "up") {
    return Math.max(elevator.current_sort_order, ...stops.filter((stop) => stop >= elevator.current_sort_order));
  }

  if (elevator.direction === "down") {
    return Math.min(elevator.current_sort_order, ...stops.filter((stop) => stop <= elevator.current_sort_order));
  }

  return elevator.current_sort_order;
}

function scoreElevator(
  elevator: DispatchElevator,
  request: DispatchableRequest,
  floors: Floor[],
  prioritiesEnabled: boolean,
) {
  const fromSort = floorSortOrder(floors, request.from_floor_id);
  const distance = Math.abs(fromSort - elevator.current_sort_order);
  const sameDirection = elevator.direction !== "idle" && elevator.direction === request.direction;
  const target = routeLimit(elevator, floors);
  const onRoute =
    elevator.direction === "idle" || (sameDirection && isBetween(fromSort, elevator.current_sort_order, target));
  const remainingCapacity = Math.max(0, elevator.capacity - elevator.current_load);
  const queuePenalty = elevator.queue.length * 4;
  const capacityPenalty = request.passenger_count > elevator.capacity ? 1000 : request.passenger_count > remainingCapacity ? 90 : 0;
  const tightStopPenalty = onRoute && sameDirection && distance <= 1 && elevator.queue.length > 0 ? 160 : 0;
  const detourPenalty = onRoute ? 0 : distance * 18;
  const directionBonus = sameDirection ? -20 : elevator.direction === "idle" ? -8 : 24;
  const priorityBonus = prioritiesEnabled && request.priority ? -60 : 0;
  const waitBonus = -Math.min(45, minutesWaiting(request));

  return (
    distance * 10 +
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
    reason: `Assigne a ${winner.elevator.name} selon trajectoire, charge et file active.`,
  };
}
