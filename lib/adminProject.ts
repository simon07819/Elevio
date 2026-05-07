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
import { logAction } from "@/lib/stateResolution";
import type { Elevator, Floor, HoistRequest, HoistUser, Project, RequestStatus } from "@/types/hoist";

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

/** Statuses the operator terminal and dispatch brain need at runtime. */
const ACTIVE_REQUEST_STATUSES = ["pending", "assigned", "arriving", "boarded"] as const;

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

export async function getAdminProjectData(
  projectId: string,
  options?: { activeRequestsOnly?: boolean },
): Promise<AdminProjectData> {
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
    // Operator terminal: only active requests, no completed/cancelled
    // Admin pages: all requests (limited to 80 newest)
    options?.activeRequestsOnly
      ? supabase
          .from("requests")
          .select(
            "id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at,skipped_by_elevator_id,skipped_at",
          )
          .eq("project_id", projectId)
          .in("status", [...ACTIVE_REQUEST_STATUSES])
      : supabase
          .from("requests")
          .select(
            "id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at,skipped_by_elevator_id,skipped_at",
          )
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(80),
  ]);

  const { data: project, error: projectError } = projectQuery;

  if (projectError || !project) {
    notFound();
  }

  // Ownership check: non-superadmin can only access their own projects
  if (project.owner_id !== user.id && user.app_metadata?.account_role !== "superadmin") {
    notFound();
  }

  const branding: AdminProjectBranding = {
    company_logo_url: profileBranding?.company_logo_url ?? null,
    project_logo_url: profileBranding?.project_logo_url ?? null,
  };

  // ── BUG 1 FIX: Auto-cleanup orphaned requests when zero live operators ──
  // If this is the operator terminal (activeRequestsOnly) and NO elevator has
  // a live operator session, cancel pending/assigned/arriving requests and
  // filter them from the returned data. Boarded passengers are NEVER cancelled.
  // We AWAIT the DB update so the data is consistent when the page renders.
  let cleanedRequests = (requests ?? []) as HoistRequest[];
  if (options?.activeRequestsOnly) {
    const now = new Date();
    const elevatorsData = (elevators ?? []) as Elevator[];
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 min
    const hasLiveOperator = elevatorsData.some((e) =>
      Boolean(e.operator_session_id) &&
      e.operator_session_heartbeat_at != null &&
      (now.getTime() - new Date(e.operator_session_heartbeat_at).getTime()) < STALE_THRESHOLD_MS,
    );

    if (!hasLiveOperator) {
      const cancellableStatuses: RequestStatus[] = ["pending", "assigned", "arriving", "boarded"];
      const orphaned = cleanedRequests.filter(r => cancellableStatuses.includes(r.status));
      if (orphaned.length > 0) {
        logAction("autoCleanupOrphanedRequests", {
          projectId,
          orphanedCount: orphaned.length,
          reason: "zero_live_operators",
        });
        // Cancel ALL orphaned requests in DB (AWAIT so DB is consistent)
        const cancelNow = new Date().toISOString();
        const { error: cancelError } = await supabase
          .from("requests")
          .update({
            status: "cancelled",
            completed_at: cancelNow,
            updated_at: cancelNow,
            note: "Annulé automatiquement : aucun opérateur actif.",
          })
          .eq("project_id", projectId)
          .in("status", cancellableStatuses);
        if (cancelError) {
          logAction("autoCleanupOrphanedRequests_ERROR", { projectId, error: cancelError.message });
        }
        // Clear skip markers
        const { error: skipClearError } = await supabase
          .from("requests")
          .update({ skipped_by_elevator_id: null, skipped_at: null })
          .eq("project_id", projectId)
          .not("skipped_by_elevator_id", "is", null);
        if (skipClearError) {
          logAction("autoCleanupOrphanedRequests_skipClear_ERROR", { projectId, error: skipClearError.message });
        }
        // Reset all elevators
        const stateReset: Record<string, unknown> = { current_load: 0, direction: "idle" };
        const fullReset = { ...stateReset, manual_full: false };
        const resetResult = await supabase.from("elevators").update(fullReset).eq("project_id", projectId);
        if (resetResult.error) {
          await supabase.from("elevators").update(stateReset).eq("project_id", projectId);
        }
        // Filter out cancelled requests from the response immediately
        cleanedRequests = cleanedRequests.filter(r => !cancellableStatuses.includes(r.status));
      }
    }
  }

  return {
    project: { ...(project as Project), capacity_enabled: (project as Project).capacity_enabled ?? true },
    floors: (floors ?? []) as Floor[],
    elevators: (elevators ?? []) as Elevator[],
    operators: (operators ?? []) as HoistUser[],
    requests: cleanedRequests,
    branding,
  };
}
