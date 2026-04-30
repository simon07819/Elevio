import { demoElevator, demoFloors, demoProject } from "@/lib/demoData";
import {
  analyzePassengerDispatch,
  DEFAULT_PROJECT_TIMEZONE,
  passengerDispatchOperatorSummaries,
  uniqueServiceHourRanges,
  type PassengerDispatchState,
} from "@/lib/operatorDispatchAvailability";
import { createClient } from "@/lib/supabase/server";
import type { Elevator, Floor, Project } from "@/types/hoist";

const PASSENGER_ELEVATORS_SELECT =
  "id,project_id,name,current_floor_id,direction,capacity,current_load,active,operator_session_id,operator_session_started_at,operator_session_heartbeat_at,operator_user_id,operator_tablet_label,operator_display_name,service_start_time,service_end_time";

export type PublicRequestContext = {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
  dispatch: PassengerDispatchState;
};

function demoPassengerDispatch(): PassengerDispatchState {
  const hourRanges = uniqueServiceHourRanges([demoElevator]);
  return {
    canDispatch: true,
    blockReason: null,
    hourRanges,
    dispatchOperators: passengerDispatchOperatorSummaries([demoElevator]),
  };
}

export async function getPublicRequestContext({
  projectId,
  floorToken,
}: {
  projectId?: string;
  floorToken?: string;
}): Promise<PublicRequestContext> {
  const supabase = await createClient();

  if (!supabase || !projectId || !floorToken) {
    const currentFloor = demoFloors.find((floor) => floor.qr_token === floorToken) ?? demoFloors[4];
    return { project: demoProject, floors: demoFloors, currentFloor, dispatch: demoPassengerDispatch() };
  }

  const [{ data: project }, { data: floors }, { data: elevators }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,service_timezone,priorities_enabled")
      .eq("id", projectId)
      .eq("active", true)
      .is("archived_at", null)
      .single(),
    supabase
      .from("floors")
      .select("id,project_id,label,sort_order,qr_token,access_code,active")
      .eq("project_id", projectId)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("elevators").select(PASSENGER_ELEVATORS_SELECT).eq("project_id", projectId).eq("active", true),
  ]);

  const typedFloors = (floors ?? []) as Floor[];
  const currentFloor = typedFloors.find((floor) => floor.qr_token === floorToken);
  const typedElevators = (elevators ?? []) as Elevator[];

  if (!project || !currentFloor || typedFloors.length === 0) {
    const demoFloor = demoFloors.find((floor) => floor.qr_token === floorToken) ?? demoFloors[4];
    return { project: demoProject, floors: demoFloors, currentFloor: demoFloor, dispatch: demoPassengerDispatch() };
  }

  const tz = project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
  const analysis = analyzePassengerDispatch({ elevators: typedElevators, timeZone: tz });
  const hourRanges = uniqueServiceHourRanges(typedElevators.filter((e) => e.active !== false));

  return {
    project: project as Project,
    floors: typedFloors,
    currentFloor,
    dispatch: {
      canDispatch: analysis.canDispatch,
      blockReason: analysis.blockReason,
      hourRanges,
      dispatchOperators: analysis.canDispatch
        ? passengerDispatchOperatorSummaries(analysis.dispatchableElevators)
        : [],
    },
  };
}
