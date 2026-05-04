import { computeNextOperatorAction } from "@/services/elevatorBrain";
import type { DispatchInput, DispatchRecommendation, Elevator } from "@/types/hoist";

export function getRecommendedNextStop({
  currentFloor,
  direction,
  requests,
  capacity,
  currentLoad,
  activePassengers,
  floors,
  prioritiesEnabled = true,
  capacityEnabled = true,
  manualFull = false,
  elevatorId,
}: DispatchInput): DispatchRecommendation {
  const elevator: Elevator = {
    id: elevatorId ?? "operator-current-elevator",
    project_id: currentFloor.project_id,
    name: "Élévateur",
    current_floor_id: currentFloor.id,
    direction,
    capacity,
    current_load: currentLoad,
    active: true,
    operator_session_id: null,
    operator_session_started_at: null,
    operator_session_heartbeat_at: null,
    operator_user_id: null,
    manual_full: manualFull,
  };

  const result = computeNextOperatorAction({
    elevator,
    assignedRequests: requests,
    onboardPassengers: activePassengers,
    projectFloors: floors ?? [currentFloor],
    prioritiesEnabled,
    capacityEnabled,
  });

  return {
    nextFloor: result.nextFloor,
    nextFloorSortOrder: result.nextFloorSortOrder,
    primaryPickupRequestId: result.primaryPickupRequestId,
    reason: result.reason,
    reasonDetail: result.reasonDetail,
    requestsToPickup: result.requestsToPickup,
    requestsToDropoff: result.requestsToDropoff,
    suggestedDirection: result.suggestedDirection,
    capacityWarnings: result.capacityWarnings,
  };
}
