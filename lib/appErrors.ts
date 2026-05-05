/**
 * Server-side error logging to the app_errors Supabase table.
 *
 * Called from server actions and API routes.
 * MUST NOT be imported from client components (depends on next/headers).
 */

import { createClient } from "@/lib/supabase/server";

export type AppErrorLevel = "info" | "warning" | "error" | "critical";
export type AppErrorCategory = "general" | "dispatch" | "auth" | "billing" | "sync" | "api" | "ui" | "operator" | "passenger";

interface LogAppErrorParams {
  message: string;
  error?: string;
  category?: AppErrorCategory;
  level?: AppErrorLevel;
  projectId?: string;
  userId?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

/** Log an error to the app_errors table (fire-and-forget) */
export async function logAppError(params: LogAppErrorParams): Promise<void> {
  try {
    const supabase = await createClient();
    if (!supabase) return;

    const { error } = await supabase.from("app_errors").insert({
      message: params.message,
      error: params.error ?? null,
      category: params.category ?? "general",
      level: params.level ?? "error",
      project_id: params.projectId ?? null,
      user_id: params.userId ?? null,
      path: params.path ?? null,
      status_code: params.statusCode ?? null,
      metadata: params.metadata ?? {},
    });

    if (error) {
      console.error("[appErrors] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[appErrors] logAppError exception:", err);
  }
}

/** Resolve an app error (superadmin action) */
export async function resolveAppError(errorId: string, resolvedBy: string): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createClient();
    if (!supabase) return { ok: false, message: "Service indisponible." };

    const { error } = await supabase
      .from("app_errors")
      .update({ resolved: true, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
      .eq("id", errorId);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Erreur résolue." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * Server-action wrapper: logs to app_errors DB + calls captureError.
 * Use this in server actions instead of trackedAction for DB-persisted errors.
 */
export async function serverTrackedAction<T>(
  action: string,
  fn: () => Promise<T>,
  context: { projectId?: string; userId?: string; path?: string; statusCode?: number; [key: string]: unknown } = {},
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Log to app_errors DB
    await logAppError({
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      category: mapActionToCategory(action),
      level: "error",
      projectId: context.projectId,
      userId: context.userId,
      path: context.path,
      statusCode: context.statusCode,
      metadata: context,
    });
    throw error;
  }
}

function mapActionToCategory(action?: string): AppErrorCategory {
  if (!action) return "general";
  const a = action.toLowerCase();
  if (a.includes("dispatch")) return "dispatch";
  if (a.includes("auth") || a.includes("login") || a.includes("signin")) return "auth";
  if (a.includes("billing") || a.includes("plan") || a.includes("subscription")) return "billing";
  if (a.includes("sync") || a.includes("realtime") || a.includes("poll")) return "sync";
  if (a.includes("api") || a.includes("webhook")) return "api";
  if (a.includes("operator") || a.includes("activate") || a.includes("release")) return "operator";
  if (a.includes("passenger") || a.includes("request")) return "passenger";
  if (a.includes("ui") || a.includes("render")) return "ui";
  return "general";
}
