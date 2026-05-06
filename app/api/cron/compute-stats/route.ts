import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  // Auth check — REJECT if secret not configured (production safety)
  if (!CRON_SECRET) {
    console.error("[cron/compute-stats] CRON_SECRET not configured — rejecting");
    return NextResponse.json({ error: "Cron auth not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");
  if (bearerToken !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "missing config" }, { status: 500 });
  }

  try {
    // Get all active project IDs
    const projectsRes = await fetch(`${supabaseUrl}/rest/v1/projects?select=id&active=eq.true&archived_at=is.null`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    const projects = await projectsRes.json();
    const projectIds: string[] = Array.isArray(projects) ? projects.map((p: { id: string }) => p.id) : [];

    // Compute stats for each project (yesterday)
    const results = await Promise.allSettled(
      projectIds.map((projectId) =>
        fetch(`${supabaseUrl}/rest/v1/rpc/compute_daily_project_stats`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ p_project_id: projectId }),
        }).then((r) => r.json()),
      ),
    );

    return NextResponse.json({
      ok: true,
      projects: projectIds.length,
      results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
