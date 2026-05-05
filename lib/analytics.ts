import { createClient } from "@/lib/supabase/server";
import { structuredLog } from "@/lib/structuredLogger";

// ── Analytics RPC types + fetchers (server-only) ───────────────────────────

export type ProjectAnalytics = {
  total_requests: number;
  completed_requests: number;
  cancelled_requests: number;
  skipped_count: number;
  full_events: number;
  avg_wait_seconds: number;
  avg_travel_seconds: number;
  avg_total_seconds: number;
  busiest_hours: Array<{ hour: number; count: number }>;
  top_floors: Array<{ floor_label: string; count: number }>;
  days: number;
};

export type PlatformAnalytics = {
  total_users: number;
  total_projects: number;
  active_projects: number;
  total_requests: number;
  completed_requests: number;
  cancelled_requests: number;
  errors_24h: number;
  avg_wait_seconds: number;
  requests_per_day: Array<{ date: string; count: number }>;
  days: number;
};

export async function getProjectAnalytics(projectId: string, days = 7): Promise<ProjectAnalytics> {
  const supabase = await createClient();
  if (!supabase) return emptyProjectAnalytics(days);

  const { data, error } = await supabase.rpc("get_project_analytics", {
    p_project_id: projectId,
    p_days: days,
  });

  if (error || !data) {
    structuredLog("Analytics", "project_analytics_error", { projectId, error: String(error) });
    return emptyProjectAnalytics(days);
  }
  return data as ProjectAnalytics;
}

export async function getPlatformAnalytics(days = 7): Promise<PlatformAnalytics> {
  const supabase = await createClient();
  if (!supabase) return emptyPlatformAnalytics(days);

  const { data, error } = await supabase.rpc("get_platform_analytics", {
    p_days: days,
  });

  if (error || !data) {
    structuredLog("Analytics", "platform_analytics_error", { error: String(error) });
    return emptyPlatformAnalytics(days);
  }
  return data as PlatformAnalytics;
}

function emptyProjectAnalytics(days: number): ProjectAnalytics {
  return {
    total_requests: 0, completed_requests: 0, cancelled_requests: 0,
    skipped_count: 0, full_events: 0, avg_wait_seconds: 0,
    avg_travel_seconds: 0, avg_total_seconds: 0,
    busiest_hours: [], top_floors: [], days,
  };
}

function emptyPlatformAnalytics(days: number): PlatformAnalytics {
  return {
    total_users: 0, total_projects: 0, active_projects: 0,
    total_requests: 0, completed_requests: 0, cancelled_requests: 0,
    errors_24h: 0, avg_wait_seconds: 0, requests_per_day: [], days,
  };
}
