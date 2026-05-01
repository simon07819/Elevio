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
  "id,project_id,name,current_floor_id,direction,capacity,current_load,active,operator_display_name,operator_session_heartbeat_at,service_start_time,service_end_time,manual_full";
const PUBLIC_PROJECT_SELECT_WITH_CAPACITY =
  "id,owner_id,name,address,active,created_at,updated_at,archived_at,service_timezone,priorities_enabled,capacity_enabled";
const PUBLIC_PROJECT_SELECT_LEGACY =
  "id,owner_id,name,address,active,created_at,updated_at,archived_at,service_timezone,priorities_enabled";

export type PublicRequestContext = {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
  elevators: Elevator[];
  dispatch: PassengerDispatchState;
};

function demoPassengerDispatch(): PassengerDispatchState {
  const hourRanges = uniqueServiceHourRanges([demoElevator]);
  return {
    canDispatch: true,
    blockReason: null,
    hourRanges,
    dispatchOperators: passengerDispatchOperatorSummaries([demoElevator], DEFAULT_PROJECT_TIMEZONE),
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
    return { project: demoProject, floors: demoFloors, currentFloor, elevators: [demoElevator], dispatch: demoPassengerDispatch() };
  }

  let projectQuery = (await supabase
    .from("projects")
    .select(PUBLIC_PROJECT_SELECT_WITH_CAPACITY)
    .eq("id", projectId)
    .eq("active", true)
    .is("archived_at", null)
    .single()) as unknown as {
    data: Project | null;
    error: { message: string; code?: string } | null;
  };

  if (projectQuery.error?.message.includes("capacity_enabled")) {
    projectQuery = (await supabase
      .from("projects")
      .select(PUBLIC_PROJECT_SELECT_LEGACY)
      .eq("id", projectId)
      .eq("active", true)
      .is("archived_at", null)
      .single()) as unknown as {
      data: Project | null;
      error: { message: string; code?: string } | null;
    };
  }

  const [{ data: floors }, { data: elevators }] = await Promise.all([
    supabase
      .from("floors")
      .select("id,project_id,label,sort_order,qr_token,access_code,active")
      .eq("project_id", projectId)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("elevators").select(PASSENGER_ELEVATORS_SELECT).eq("project_id", projectId).eq("active", true),
  ]);
  const project = projectQuery.data
    ? ({ ...(projectQuery.data as Project), capacity_enabled: (projectQuery.data as Project).capacity_enabled ?? true } as Project)
    : null;

  const typedFloors = (floors ?? []) as Floor[];
  const currentFloor = typedFloors.find((floor) => floor.qr_token === floorToken);
  const typedElevators = (elevators ?? []) as Elevator[];

  if (!project || !currentFloor || typedFloors.length === 0) {
    const demoFloor = demoFloors.find((floor) => floor.qr_token === floorToken) ?? demoFloors[4];
    return { project: demoProject, floors: demoFloors, currentFloor: demoFloor, elevators: [demoElevator], dispatch: demoPassengerDispatch() };
  }

  const tz = project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
  const analysis = analyzePassengerDispatch({ elevators: typedElevators, timeZone: tz });
  const hourRanges = uniqueServiceHourRanges(typedElevators.filter((e) => e.active !== false));

  return {
    project,
    floors: typedFloors,
    currentFloor,
    elevators: typedElevators,
    dispatch: {
      canDispatch: analysis.canDispatch,
      blockReason: analysis.blockReason,
      hourRanges,
      dispatchOperators: analysis.canDispatch
        ? passengerDispatchOperatorSummaries(analysis.dispatchableElevators, tz)
        : [],
    },
  };
}
