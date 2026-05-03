import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reassignOrphanedRequestsToActiveOperator } from "@/lib/actions";

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

function isMissingManualFullColumn(error: { message: string }) {
  return error.message?.includes("manual_full");
}

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
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, message: "Corps de requête invalide." }, { status: 400 }); }

  const { projectId, elevatorId } = body;
  if (!projectId || !elevatorId) {
    return NextResponse.json({ ok: false, message: "projectId et elevatorId requis." }, { status: 400 });
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

  if (result.error) return NextResponse.json({ ok: false, message: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ ok: false, message: "Cabine introuvable." }, { status: 404 });

  const stateReset: Record<string, unknown> = { current_load: 0, direction: "idle", manual_full: false };
  const { error: stateResetError } = await supabase
    .from("elevators")
    .update(stateReset)
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (stateResetError && isMissingManualFullColumn(stateResetError)) {
    await supabase
      .from("elevators")
      .update({ current_load: 0, direction: "idle" })
      .eq("id", elevatorId)
      .eq("project_id", projectId);
  }

  await reassignOrphanedRequestsToActiveOperator(supabase, projectId, elevatorId);

  const { data: liveElevators } = await supabase
    .from("elevators")
    .select("id,operator_session_id,operator_session_heartbeat_at")
    .eq("project_id", projectId);

  const hasLiveOperator = (liveElevators ?? []).some((e: { operator_session_id: string | null; operator_session_heartbeat_at: string | null }) =>
    e.operator_session_id && e.operator_session_heartbeat_at &&
    Date.now() - new Date(e.operator_session_heartbeat_at).getTime() < 120_000
  );

  if (!hasLiveOperator) {
    const now = new Date().toISOString();
    await supabase
      .from("requests")
      .update({ status: "cancelled", completed_at: now, updated_at: now, note: "Annulee automatiquement: aucun operateur actif." })
      .eq("project_id", projectId)
      .in("status", ["pending", "assigned", "arriving", "boarded"]);
  }

  return NextResponse.json({ ok: true, message: "Session force-liberee." });
}
