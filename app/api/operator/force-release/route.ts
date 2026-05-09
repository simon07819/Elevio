import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TABLET_SESSION_FIELDS_CLEAR = {
  operator_session_id: null,
  operator_session_started_at: null,
  operator_session_heartbeat_at: null,
  operator_user_id: null,
  operator_tablet_label: null,
  operator_display_name: null,
};

function stripOperatorDisplayName(obj: Record<string, unknown>) {
  const { operator_display_name, ...rest } = obj;
  return rest;
}

function isMissingOperatorDisplayNameColumn(error: { message: string }) {
  return error.message?.includes("operator_display_name");
}

/**
 * POST /api/operator/force-release
 *
 * Force-releases an operator session on an elevator.
 * Used when the session is corrupted or the operator cannot release normally.
 *
 * Body: { projectId, elevatorId }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Base de données indisponible." }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Non autorisé." }, { status: 401 });
  }

  let body: { projectId?: string; elevatorId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Corps de requête invalide." }, { status: 400 });
  }

  const { projectId, elevatorId } = body;
  if (!projectId || !elevatorId) {
    return NextResponse.json({ ok: false, message: "projectId et elevatorId requis." }, { status: 400 });
  }

  // Verify user belongs to the project (or is superadmin)
  const { data: profile } = await supabase.from("profiles").select("account_role").eq("id", user.id).maybeSingle();
  const isSuperadmin = profile?.account_role === "superadmin";
  if (!isSuperadmin) {
    const { data: project } = await supabase
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project || project.owner_id !== user.id) {
      return NextResponse.json({ ok: false, message: "Accès refusé à ce projet." }, { status: 403 });
    }
  }

  let result = await supabase
    .from("elevators")
    .update({ ...TABLET_SESSION_FIELDS_CLEAR })
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (result.error && isMissingOperatorDisplayNameColumn(result.error)) {
    result = await supabase
      .from("elevators")
      .update(stripOperatorDisplayName({ ...TABLET_SESSION_FIELDS_CLEAR }))
      .eq("id", elevatorId)
      .eq("project_id", projectId)
      .select("id")
      .maybeSingle();
  }

  if (result.error) {
    return NextResponse.json({ ok: false, message: result.error.message }, { status: 500 });
  }

  if (!result.data) {
    return NextResponse.json({ ok: false, message: "Cabine introuvable." }, { status: 404 });
  }

  // Reset elevator state — ghost load/direction/manual_full causes PAUSE on next session.
  const stateReset = { current_load: 0, direction: "idle" };
  const fullReset = { ...stateReset, manual_full: false };
  const resetResult = await supabase
    .from("elevators")
    .update(fullReset)
    .eq("id", elevatorId)
    .eq("project_id", projectId);
  if (resetResult.error) {
    await supabase
      .from("elevators")
      .update(stateReset)
      .eq("id", elevatorId)
      .eq("project_id", projectId);
  }

  // Reassign orphaned requests (including boarded) to other active operators
  const ORPHAN_REASSIGN_STATUSES = ["pending", "assigned", "arriving", "boarded"];
  const { data: orphans } = await supabase
    .from("requests")
    .select("id")
    .eq("project_id", projectId)
    .eq("elevator_id", elevatorId)
    .in("status", ORPHAN_REASSIGN_STATUSES);

  if (orphans && orphans.length > 0) {
    // Check if there's another live operator
    const { data: liveElevators } = await supabase
      .from("elevators")
      .select("id")
      .eq("project_id", projectId)
      .eq("active", true)
      .not("operator_session_id", "is", null)
      .neq("id", elevatorId);

    if (liveElevators && liveElevators.length > 0) {
      // Unassign from this elevator so the dispatch engine can reassign
      await supabase
        .from("requests")
        .update({ elevator_id: null, updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("elevator_id", elevatorId)
        .in("status", ORPHAN_REASSIGN_STATUSES);
    } else {
      // No other operator — cancel the orphaned requests
      const now = new Date().toISOString();
      await supabase
        .from("requests")
        .update({
          status: "cancelled",
          completed_at: now,
          updated_at: now,
          note: "Annulee automatiquement : aucun operateur disponible.",
        })
        .eq("project_id", projectId)
        .eq("elevator_id", elevatorId)
        .in("status", ORPHAN_REASSIGN_STATUSES);
    }
  }

  return NextResponse.json({ ok: true, message: "Session force-liberee." });
}
