import { NextResponse } from "next/server";
import { getErrorLogs, getPerformanceLogs, getLogHistory, clearLogHistory } from "@/lib/structuredLogger";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { logAppError } from "@/lib/appErrors";

export async function GET() {
  // In-memory structured logs (client-side buffer, may be empty on server)
  const errors = getErrorLogs(50).map((e) => ({
    time: e.timestamp,
    tag: e.tag,
    message: e.action,
    level: "error" as const,
    data: e,
  }));

  const perf = getPerformanceLogs(50).map((e) => ({
    time: e.timestamp,
    tag: e.tag,
    message: e.action,
    level: "info" as const,
    data: e,
  }));

  const general = getLogHistory(100).map((e) => ({
    time: e.timestamp,
    tag: e.tag,
    message: e.action,
    level: (e.tag === "Error" ? "error" : e.tag === "Performance" ? "info" : "info") as "info" | "warning" | "error",
    data: e,
  }));

  // Fetch persisted errors from app_errors table
  const dbErrors = await fetchDbErrors(100);

  // Merge in-memory + DB, deduplicate
  const seen = new Set<string>();
  const all = [...dbErrors, ...errors, ...perf, ...general]
    .filter((l) => {
      const key = `${l.time}|${l.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 200);

  return NextResponse.json({ logs: all });
}

/** DELETE: clear all logs (DB + in-memory) — superadmin only */
export async function DELETE() {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  // 1. Clear in-memory structured logs
  clearLogHistory();

  // 2. Clear app_errors table
  const supabase = await createClient();
  let dbCount = 0;
  if (supabase) {
    const { count } = await supabase
      .from("app_errors")
      .select("id", { count: "exact", head: true });
    dbCount = count ?? 0;

    const { error } = await supabase
      .from("app_errors")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      return NextResponse.json({ ok: false, message: error.message });
    }
  }

  // Audit log
  await logAppError({
    message: `Logs vidés par superadmin (${dbCount} entrées DB + mémoire)`,
    category: "general",
    level: "info",
  });

  return NextResponse.json({ ok: true, message: `${dbCount} logs DB supprimés + mémoire vidée.` });
}

async function fetchDbErrors(limit: number) {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const { data } = await supabase
      .from("app_errors")
      .select("id,message,error,level,category,created_at,project_id,path,status_code,resolved,metadata")
      .gte("created_at", yesterday)
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []).map((row) => ({
      time: row.created_at,
      tag: row.category ?? "Error",
      message: row.message,
      level: (row.level === "critical" ? "critical" : row.level === "warning" ? "warning" : row.level === "info" ? "info" : "error") as "info" | "warning" | "error" | "critical",
      errorId: row.id,
      resolved: row.resolved,
      data: {
        error: row.error,
        projectId: row.project_id,
        path: row.path,
        statusCode: row.status_code,
        metadata: row.metadata,
      },
    }));
  } catch {
    return [];
  }
}
