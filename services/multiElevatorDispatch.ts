import { computeBestElevatorForRequest } from "@/services/elevatorBrain";
import { isOperatorTabletSessionStale } from "@/lib/operatorTablet";
import type { Elevator, Floor, HoistRequest } from "@/types/hoist";

type DispatchableRequest = Pick<
  HoistRequest,
  "from_floor_id" | "to_floor_id" | "direction" | "passenger_count" | "priority" | "wait_started_at"
>;

export type ElevatorAssignment = {
  elevatorId: string | null;
  score: number;
  reason: string;
  /** Places pour cette vague de dispatch ; défini si elevatorId est défini. */
  assignableChunk?: number;
};

export function assignRequestToBestElevator({
  request,
  elevators,
  floors,
  requests,
  prioritiesEnabled = true,
  capacityEnabled = true,
}: {
  request: DispatchableRequest;
  elevators: Elevator[];
  floors: Floor[];
  requests: HoistRequest[];
  prioritiesEnabled?: boolean;
  capacityEnabled?: boolean;
}): ElevatorAssignment {
  const onlineElevators = elevators.map((elevator) => ({
    ...elevator,
    online: Boolean(elevator.operator_session_id) && !isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at),
  }));

  const assignment = computeBestElevatorForRequest({
    newRequest: request,
    elevators: onlineElevators,
    activeRequests: requests,
    projectFloors: floors,
    prioritiesEnabled,
    capacityEnabled,
  });

  return {
    elevatorId: assignment.elevatorId,
    score: assignment.score,
    reason: assignment.reason,
    assignableChunk: assignment.assignableChunk,
  };
}
