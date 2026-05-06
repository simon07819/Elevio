import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  // Auth check — REJECT if secret not configured (production safety)
  if (!CRON_SECRET) {
    console.error("[cron/cleanup-requests] CRON_SECRET not configured — rejecting");
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
    // Run cleanup via RPC
    const cleanupRes = await fetch(`${supabaseUrl}/rest/v1/rpc/cleanup_terminal_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ p_completed_age_hours: 24, p_cancelled_age_hours: 6 }),
    });
    const cleanupResult = await cleanupRes.json();

    return NextResponse.json({
      ok: true,
      cleanup: cleanupResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/cron/cleanup-requests",
    method: "POST",
    auth: "Bearer CRON_SECRET",
  });
}
