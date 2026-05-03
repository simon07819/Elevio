import {
  demoElevator,
  demoFloors,
  demoProject,
  demoProjects,
  demoRequests,
  demoUsers,
} from "@/lib/demoData";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { notFound } from "next/navigation";
import type { Elevator, Floor, HoistRequest, HoistUser, Project } from "@/types/hoist";

const PROJECT_SELECT_WITH_CAPACITY =
  "id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone,priorities_enabled,capacity_enabled";
const PROJECT_SELECT_LEGACY =
  "id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone,priorities_enabled";

export type AdminProjectBranding = {
  company_logo_url: string | null;
  project_logo_url: string | null;
};

export type AdminProjectData = {
  project: Project;
  floors: Floor[];
  elevators: Elevator[];
  operators: HoistUser[];
  requests: HoistRequest[];
  branding: AdminProjectBranding;
};

function demoProjectData(projectId: string): AdminProjectData {
  const project = demoProjects.find((item) => item.id === projectId) ?? demoProject;

  return {
    project,
    floors: demoFloors.filter((floor) => floor.project_id === demoProject.id),
    elevators: demoElevator.project_id === demoProject.id ? [demoElevator] : [],
    operators: demoUsers.filter((user) => user.project_id === demoProject.id && user.role === "operator"),
    requests: demoRequests.filter((request) => request.project_id === demoProject.id),
    branding: { company_logo_url: null, project_logo_url: null },
  };
}

export async function getAdminProjectData(projectId: string): Promise<AdminProjectData> {
  const supabase = await createClient();

  if (!supabase) {
    return demoProjectData(projectId);
  }

  if (!isUuid(projectId)) {
    notFound();
  }

  const user = await getCurrentUser();

  if (!user) {
    notFound();
  }

  let projectQuery = (await supabase
    .from("projects")
    .select(PROJECT_SELECT_WITH_CAPACITY)
    .eq("id", projectId)
    .single()) as unknown as {
    data: Project | null;
    error: { message: string; code?: string } | null;
  };

  if (projectQuery.error?.message.includes("capacity_enabled")) {
    projectQuery = (await supabase
      .from("projects")
      .select(PROJECT_SELECT_LEGACY)
      .eq("id", projectId)
      .single()) as unknown as {
      data: Project | null;
      error: { message: string; code?: string } | null;
    };
  }

  const [
    { data: profileBranding },
    { data: floors },
    { data: elevators },
    { data: operators },
    { data: requests },
  ] = await Promise.all([
    supabase.from("profiles").select("company_logo_url, project_logo_url").eq("id", user.id).maybeSingle(),
    supabase
      .from("floors")
      .select("id,project_id,label,sort_order,qr_token,access_code,active")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase.from("elevators").select("*").eq("project_id", projectId).order("name", { ascending: true }),
    supabase
      .from("users")
      .select("id,name,role,project_id")
      .eq("project_id", projectId)
      .eq("role", "operator")
      .order("name", { ascending: true }),
    supabase
      .from("requests")
      .select(
        "id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at",
      )
      .eq("project_id", projectId)
      .in("status", ["pending", "assigned", "arriving", "boarded"])
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  const { data: project, error: projectError } = projectQuery;

  if (projectError || !project) {
    notFound();
  }

  const branding: AdminProjectBranding = {
    company_logo_url: profileBranding?.company_logo_url ?? null,
    project_logo_url: profileBranding?.project_logo_url ?? null,
  };

  return {
    project: { ...(project as Project), capacity_enabled: (project as Project).capacity_enabled ?? true },
    floors: (floors ?? []) as Floor[],
    elevators: (elevators ?? []) as Elevator[],
    operators: (operators ?? []) as HoistUser[],
    requests: (requests ?? []) as HoistRequest[],
    branding,
  };
}
