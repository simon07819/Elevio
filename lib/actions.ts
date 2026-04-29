"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { demoFloors } from "@/lib/demoData";
import { floorLabelForSortOrder, getDirection } from "@/lib/utils";
import { assignRequestToBestElevator } from "@/services/multiElevatorDispatch";
import { elevatorDuplicateMessage } from "@/lib/elevatorMessages";
import type { Elevator, Floor, HoistRequest, Project, RequestEventType, RequestStatus } from "@/types/hoist";

import { elevatorHasOperatorTabletBinding, isOperatorTabletSessionStale } from "@/lib/operatorTablet";
import {
  analyzePassengerDispatch,
  assertValidTimeZone,
  DEFAULT_PROJECT_TIMEZONE,
  parsePostgresTimeToMinutes,
  type DispatchBlockReason,
} from "@/lib/operatorDispatchAvailability";

function normalizeText(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function normalizedDbTimeFromInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function elevatorServiceTimesFromForm(formData: FormData): { ok: true; start: string; end: string } | { ok: false; message: string } {
  let startRaw = String(formData.get("serviceStart") ?? "").trim();
  let endRaw = String(formData.get("serviceEnd") ?? "").trim();
  if (!startRaw) startRaw = "07:00";
  if (!endRaw) endRaw = "15:00";
  const start = normalizedDbTimeFromInput(startRaw);
  const end = normalizedDbTimeFromInput(endRaw);
  if (!start || !end) {
    return { ok: false, message: "Heures de service invalides." };
  }
  const sm = parsePostgresTimeToMinutes(start);
  const em = parsePostgresTimeToMinutes(end);
  if (sm === null || em === null || sm >= em) {
    return { ok: false, message: "L'heure de debut doit etre avant l'heure de fin." };
  }
  return { ok: true, start, end };
}

function passengerDispatchBlockedMessage(reason: DispatchBlockReason | null): string {
  switch (reason) {
    case "outside_hours":
      return "Service hors plage horaire. Reessayez pendant les heures d'ouverture.";
    case "no_live_operator":
      return "Aucun operateur disponible pour le moment.";
    default:
      return "Service temporairement indisponible.";
  }
}

function projectPayload(formData: FormData) {
  let service_timezone = String(formData.get("serviceTimezone") ?? "").trim();
  if (!service_timezone) service_timezone = DEFAULT_PROJECT_TIMEZONE;

  return {
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    service_timezone,
  };
}

function isHalfStep(value: number) {
  return Number.isFinite(value) && Number.isInteger(value * 2);
}

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const payload = projectPayload(formData);
  const makeActive = formData.get("active") === "on";

  if (!payload.name) {
    return { ok: false, message: "Le nom du projet est obligatoire." };
  }

  try {
    assertValidTimeZone(payload.service_timezone);
  } catch {
    return { ok: false, message: "Fuseau horaire invalide (ex: America/Toronto)." };
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: projet cree localement." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion admin requise." };
  }

  if (makeActive) {
    await supabase.from("projects").update({ active: false }).eq("active", true).eq("owner_id", user.id);
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      ...payload,
      owner_id: user.id,
      active: makeActive,
      archived_at: null,
    })
    .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  return { ok: true, message: "Projet cree.", project: project as Project };
}

export async function updateProject(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const payload = projectPayload(formData);

  if (!payload.name) {
    return { ok: false, message: "Le nom du projet est obligatoire." };
  }

  try {
    assertValidTimeZone(payload.service_timezone);
  } catch {
    return { ok: false, message: "Fuseau horaire invalide (ex: America/Toronto)." };
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: projet modifie localement." };
  }

  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  return { ok: true, message: "Projet modifie." };
}

export async function activateProject(projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: projet active localement." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion admin requise." };
  }

  const { error: deactivateError } = await supabase
    .from("projects")
    .update({ active: false })
    .eq("owner_id", user.id)
    .neq("id", projectId);

  if (deactivateError) {
    return { ok: false, message: deactivateError.message };
  }

  const { error } = await supabase
    .from("projects")
    .update({ active: true, archived_at: null })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  return { ok: true, message: "Projet active. Les autres projets sont inactifs." };
}

export async function archiveProject(projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: projet desactive localement." };
  }

  const { error } = await supabase
    .from("projects")
    .update({ active: false, archived_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  return { ok: true, message: "Projet desactive et archive." };
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: projet supprime localement." };
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  return { ok: true, message: "Projet supprime definitivement." };
}

function revalidateAdminProject(projectId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/floors");
  revalidatePath("/admin/qrcodes");
  revalidatePath("/operator");
}

export async function createFloor(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const rawLabel = String(formData.get("label") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder"));
  const label = rawLabel || floorLabelForSortOrder(sortOrder);
  const active = formData.get("active") === "on";

  if (!Number.isFinite(sortOrder)) {
    return { ok: false, message: "La position de l'etage est obligatoire." };
  }

  if (!isHalfStep(sortOrder)) {
    return { ok: false, message: "La position doit etre un nombre entier ou un demi-etage, ex: -1, 0, 0.5, 1, 1.5." };
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: etage ajoute localement." };
  }

  const { error } = await supabase.from("floors").insert({
    project_id: projectId,
    label,
    sort_order: sortOrder,
    active,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Etage ajoute." };
}

export async function generateProjectFloors(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const basementInput = Number(formData.get("basementCount") ?? 0);
  const basementCount = Math.max(0, Math.min(50, Math.abs(Math.trunc(basementInput))));
  const floorCount = Math.max(0, Math.min(200, Number(formData.get("floorCount") ?? 0)));
  const includeRdc = formData.get("includeRdc") === "on";

  if (basementCount + floorCount === 0 && !includeRdc) {
    return { ok: false, message: "Ajoutez au moins un etage." };
  }

  const floors: Array<{ project_id: string; label: string; sort_order: number; active: boolean }> = [];

  for (let level = basementCount; level >= 1; level -= 1) {
    floors.push({ project_id: projectId, label: `P${level}`, sort_order: -level, active: true });
  }

  if (includeRdc) {
    floors.push({ project_id: projectId, label: "RDC", sort_order: 0, active: true });
  }

  /* Au-dessus du RDC : sort_order consécutifs 1,2,… pour le dispatch ; si RDC est inclus, les libellés
   * commencent à 2 (étage 1 = rez-de-chaussée sur ce chantier). */
  for (let level = 1; level <= floorCount; level += 1) {
    const label = includeRdc ? String(level + 1) : String(level);
    floors.push({ project_id: projectId, label, sort_order: level, active: true });
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: etages generes localement.", floors: demoFloors };
  }

  const { data, error } = await supabase
    .from("floors")
    .upsert(floors, { onConflict: "project_id,sort_order" })
    .select("id,project_id,label,sort_order,qr_token,access_code,active")
    .order("sort_order", { ascending: true });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Etages generes.", floors: (data ?? []) as Floor[] };
}

export async function updateFloor(floorId: string, projectId: string, formData: FormData) {
  const supabase = await createClient();
  const rawLabel = String(formData.get("label") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder"));
  const label = rawLabel || floorLabelForSortOrder(sortOrder);
  const active = formData.get("active") === "on";

  if (!Number.isFinite(sortOrder)) {
    return { ok: false, message: "La position de l'etage est obligatoire." };
  }

  if (!isHalfStep(sortOrder)) {
    return { ok: false, message: "La position doit etre un nombre entier ou un demi-etage, ex: -1, 0, 0.5, 1, 1.5." };
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: etage modifie localement." };
  }

  const { error } = await supabase
    .from("floors")
    .update({ label, sort_order: sortOrder, active })
    .eq("id", floorId)
    .eq("project_id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Etage modifie." };
}

export async function toggleFloorActive(floorId: string, projectId: string, active: boolean) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: etage mis a jour localement." };
  }

  const { error } = await supabase.from("floors").update({ active }).eq("id", floorId).eq("project_id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: active ? "Etage active." : "Etage desactive." };
}

export async function deleteFloor(floorId: string, projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: etage supprime localement." };
  }

  const { error } = await supabase.from("floors").delete().eq("id", floorId).eq("project_id", projectId);

  if (error) {
    return { ok: false, message: "Impossible de supprimer cet etage s'il est utilise par des demandes." };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Etage supprime." };
}

const elevatorSelectColumns =
  "id,project_id,name,current_floor_id,direction,capacity,current_load,active,operator_session_id,operator_session_started_at,operator_session_heartbeat_at,operator_user_id,service_start_time,service_end_time";

function normalizeElevatorName(name: string) {
  return name.trim().toLowerCase();
}

async function elevatorNameConflict(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  projectId: string,
  name: string,
  excludeElevatorId?: string,
): Promise<boolean> {
  const key = normalizeElevatorName(name);
  const { data: rows, error } = await supabase.from("elevators").select("id,name").eq("project_id", projectId);
  if (error || !rows) {
    return false;
  }
  return rows.some((row) => row.id !== excludeElevatorId && normalizeElevatorName(row.name) === key);
}

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || error.message?.includes("elevators_project_name_lower_idx");
}

export async function createElevator(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; message: string; elevator?: Elevator }> {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const capacity = Number(formData.get("capacity") ?? 1);

  if (!name || capacity < 1) {
    return { ok: false, message: "Nom et capacite sont obligatoires." };
  }

  const serviceTimes = elevatorServiceTimesFromForm(formData);
  if (!serviceTimes.ok) {
    return { ok: false, message: serviceTimes.message };
  }

  if (!supabase) {
    const elevator: Elevator = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name,
      current_floor_id: null,
      capacity,
      current_load: 0,
      direction: "idle",
      active: true,
      operator_session_id: null,
      operator_session_started_at: null,
      operator_session_heartbeat_at: null,
      operator_user_id: null,
      service_start_time: serviceTimes.start,
      service_end_time: serviceTimes.end,
    };
    return { ok: true, message: "Mode demo: elevateur ajoute localement.", elevator };
  }

  if (await elevatorNameConflict(supabase, projectId, name)) {
    return { ok: false, message: elevatorDuplicateMessage };
  }

  const { data, error } = await supabase
    .from("elevators")
    .insert({
      project_id: projectId,
      name,
      current_floor_id: null,
      capacity,
      current_load: 0,
      direction: "idle",
      active: true,
      service_start_time: serviceTimes.start,
      service_end_time: serviceTimes.end,
    })
    .select(elevatorSelectColumns)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, message: elevatorDuplicateMessage };
    }
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Elevateur ajoute.", elevator: data as Elevator };
}

export async function deleteElevator(elevatorId: string, projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: elevateur supprime localement." };
  }

  const { error } = await supabase.from("elevators").delete().eq("id", elevatorId).eq("project_id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Elevateur supprime." };
}

export async function updateElevatorSettings(elevatorId: string, projectId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const capacity = Number(formData.get("capacity") ?? 1);

  if (!name || capacity < 1) {
    return { ok: false, message: "Nom et capacite sont obligatoires." };
  }

  const serviceTimes = elevatorServiceTimesFromForm(formData);
  if (!serviceTimes.ok) {
    return { ok: false, message: serviceTimes.message };
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: capacite modifiee localement." };
  }

  if (await elevatorNameConflict(supabase, projectId, name, elevatorId)) {
    return { ok: false, message: elevatorDuplicateMessage };
  }

  const { error } = await supabase
    .from("elevators")
    .update({
      name,
      capacity,
      service_start_time: serviceTimes.start,
      service_end_time: serviceTimes.end,
    })
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, message: elevatorDuplicateMessage };
    }
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Parametres elevateur modifies." };
}

export async function activateOperatorElevator(
  projectId: string,
  elevatorId: string,
  sessionId: string,
  currentFloorId: string,
) {
  const supabase = await createClient();

  if (!sessionId) {
    return { ok: false, message: "Session tablette invalide." };
  }

  if (!supabase) {
    return { ok: true, message: "Mode demo: tablette activee.", elevatorId };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion operateur requise." };
  }

  const { data: elevator, error: elevatorError } = await supabase
    .from("elevators")
    .select("id,project_id,operator_session_id,operator_session_heartbeat_at")
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .single();

  if (elevatorError || !elevator) {
    return { ok: false, message: "Elevateur introuvable." };
  }

  if (
    elevator.operator_session_id &&
    elevator.operator_session_id !== sessionId &&
    !isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at as string | null)
  ) {
    return { ok: false, message: "Cet elevateur est deja active sur une autre tablette." };
  }

  const sessionClear = {
    operator_session_id: null,
    operator_session_started_at: null,
    operator_session_heartbeat_at: null,
    operator_user_id: null,
  };

  /* Index unique sur operator_session_id: une session ne peut être que sur un ascenseur.
   * Sans cette étape, activer un 2e ascenseur avec la même session (ex. heartbeats périmés,
   * ou changement d’ascenseur sans libération) provoque duplicate key sur elevators_operator_session_idx. */
  const { error: clearError } = await supabase
    .from("elevators")
    .update(sessionClear)
    .eq("project_id", projectId)
    .eq("operator_session_id", sessionId);

  if (clearError) {
    return { ok: false, message: clearError.message };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("elevators")
    .update({
      operator_session_id: sessionId,
      operator_session_started_at: now,
      operator_session_heartbeat_at: now,
      operator_user_id: user.id,
      current_floor_id: currentFloorId || null,
      direction: "idle",
      current_load: 0,
    })
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Tablette operateur activee.", elevatorId };
}

export async function heartbeatOperatorElevator(projectId: string, elevatorId: string, sessionId: string) {
  const supabase = await createClient();

  if (!supabase || !sessionId) {
    return { ok: true, message: "Heartbeat ignore." };
  }

  const { error } = await supabase
    .from("elevators")
    .update({ operator_session_heartbeat_at: new Date().toISOString() })
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .eq("operator_session_id", sessionId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Heartbeat ok." };
}

export async function releaseOperatorElevator(projectId: string, elevatorId: string, sessionId: string) {
  const supabase = await createClient();

  if (!supabase || !sessionId) {
    return { ok: true, message: "Mode demo: tablette liberee." };
  }

  const { error } = await supabase
    .from("elevators")
    .update({
      operator_session_id: null,
      operator_session_started_at: null,
      operator_session_heartbeat_at: null,
      operator_user_id: null,
    })
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .eq("operator_session_id", sessionId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Tablette operateur liberee." };
}

export async function adminDeactivateOperatorTablet(projectId: string, elevatorId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: tablette desactivee." };
  }

  const { data: elevator, error: fetchError } = await supabase
    .from("elevators")
    .select("id,operator_session_id,operator_session_started_at,operator_session_heartbeat_at,operator_user_id")
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }

  if (!elevator || !elevatorHasOperatorTabletBinding(elevator as Elevator)) {
    return { ok: false, message: "Aucune session tablette a nettoyer sur cet elevateur." };
  }

  const { error } = await supabase
    .from("elevators")
    .update({
      operator_session_id: null,
      operator_session_started_at: null,
      operator_session_heartbeat_at: null,
      operator_user_id: null,
    })
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Tablette desactivee. L’operateur devra reactiver depuis son appareil." };
}

export async function createPassengerRequest(formData: FormData) {
  const supabase = await createClient();
  const projectId = String(formData.get("projectId") ?? "");
  const fromFloorId = String(formData.get("fromFloorId") ?? "");
  const toFloorId = String(formData.get("toFloorId") ?? "");
  const passengerCount = Number(formData.get("passengerCount") ?? 1);
  const priority = formData.get("priority") === "on";
  const priorityReason = normalizeText(formData.get("priorityReason"));
  const note = normalizeText(formData.get("note"));

  if (priority && !priorityReason) {
    return { ok: false, message: "La raison est obligatoire pour une priorite." };
  }

  let fromFloor = demoFloors.find((floor) => floor.id === fromFloorId);
  let toFloor = demoFloors.find((floor) => floor.id === toFloorId);
  let projectFloors = demoFloors.filter((floor) => floor.project_id === projectId);

  let elevators: Elevator[] = [];
  let activeRequests: HoistRequest[] = [];
  let serviceTz = DEFAULT_PROJECT_TIMEZONE;

  if (supabase) {
    const [{ data: dbFloors }, { data: projectRow }, { data: dbElevators }, { data: dbRequests }] = await Promise.all([
      supabase
        .from("floors")
        .select("id,project_id,label,sort_order,qr_token,access_code,active")
        .eq("project_id", projectId),
      supabase
        .from("projects")
        .select("service_timezone")
        .eq("id", projectId)
        .eq("active", true)
        .is("archived_at", null)
        .maybeSingle(),
      supabase.from("elevators").select(elevatorSelectColumns).eq("project_id", projectId),
      supabase
        .from("requests")
        .select("id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at")
        .eq("project_id", projectId)
        .in("status", ["pending", "assigned", "arriving", "boarded"]),
    ]);

    projectFloors = (dbFloors ?? []) as Floor[];
    fromFloor = dbFloors?.find((floor) => floor.id === fromFloorId) ?? fromFloor;
    toFloor = dbFloors?.find((floor) => floor.id === toFloorId) ?? toFloor;

    if (!projectRow) {
      return { ok: false, message: "Chantier introuvable ou inactif." };
    }

    serviceTz = projectRow.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
    elevators = (dbElevators ?? []) as Elevator[];
    activeRequests = (dbRequests ?? []) as HoistRequest[];
  }

  if (!fromFloor || !toFloor || fromFloor.id === toFloor.id) {
    return { ok: false, message: "Selection d'etage invalide." };
  }

  if (supabase) {
    const dispatchAnalysis = analyzePassengerDispatch({
      elevators,
      timeZone: serviceTz,
    });
    if (!dispatchAnalysis.canDispatch) {
      return { ok: false, message: passengerDispatchBlockedMessage(dispatchAnalysis.blockReason) };
    }
  }

  const direction = getDirection(fromFloor.sort_order, toFloor.sort_order);
  const payload = {
    project_id: projectId,
    from_floor_id: fromFloorId,
    to_floor_id: toFloorId,
    direction,
    passenger_count: passengerCount,
    original_passenger_count: passengerCount,
    remaining_passenger_count: passengerCount,
    split_required: false,
    priority,
    priority_reason: priorityReason,
    note,
    status: "pending" as RequestStatus,
    wait_started_at: new Date().toISOString(),
  };

  if (!supabase) {
    return {
      ok: true,
      message: "Demande envoyee.",
      requestId: "demo-local-request",
      status: payload.status,
      waitStartedAt: payload.wait_started_at,
      fromFloorId,
      toFloorId,
      passengerCount,
    };
  }

  const payloads: Array<typeof payload & { elevator_id: string | null }> = [];
  let remainingPassengers = passengerCount;
  let syntheticSequence = 0;

  while (remainingPassengers > 0) {
    const assignment = assignRequestToBestElevator({
      request: {
        from_floor_id: fromFloorId,
        to_floor_id: toFloorId,
        direction,
        passenger_count: remainingPassengers,
        priority,
        wait_started_at: payload.wait_started_at,
      },
      elevators,
      floors: projectFloors,
      requests: activeRequests,
    });
    const assignedElevator = elevators.find((elevator) => elevator.id === assignment.elevatorId);
    const chunkSize = assignedElevator ? Math.min(remainingPassengers, assignedElevator.capacity) : remainingPassengers;
    const remainingAfterChunk = Math.max(0, remainingPassengers - chunkSize);
    const splitRequired = passengerCount > chunkSize || remainingAfterChunk > 0;
    const nextPayload = {
      ...payload,
      elevator_id: assignment.elevatorId,
      passenger_count: chunkSize,
      remaining_passenger_count: remainingAfterChunk,
      split_required: splitRequired,
      note: splitRequired
        ? [note, `Groupe divise: ${chunkSize}/${passengerCount} personne(s) assignees.`].filter(Boolean).join(" ")
        : note,
    };

    payloads.push(nextPayload);

    activeRequests.push({
      id: `synthetic-${syntheticSequence}`,
      ...nextPayload,
      sequence_number: Number.MAX_SAFE_INTEGER - syntheticSequence,
      created_at: payload.wait_started_at,
      updated_at: payload.wait_started_at,
      completed_at: null,
    });

    syntheticSequence += 1;
    remainingPassengers = remainingAfterChunk;

    if (!assignedElevator) {
      break;
    }
  }

  const { data, error } = await supabase
    .from("requests")
    .insert(payloads)
    .select("id,status,wait_started_at,from_floor_id,to_floor_id,passenger_count,elevator_id,split_required,remaining_passenger_count");

  if (error) {
    return { ok: false, message: error.message };
  }

  const firstRequest = data?.[0];

  if (!firstRequest) {
    return { ok: false, message: "La demande n'a pas pu etre creee." };
  }

  revalidatePath("/operator");
  return {
    ok: true,
    message: "Demande envoyee.",
    requestId: firstRequest.id as string,
    status: firstRequest.status as RequestStatus,
    waitStartedAt: firstRequest.wait_started_at as string,
    fromFloorId: firstRequest.from_floor_id as string,
    toFloorId: firstRequest.to_floor_id as string,
    passengerCount,
  };
}

export async function updateRequestStatus(requestId: string, status: RequestStatus, message?: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: action simulee." };
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("requests").update(updates).eq("id", requestId);

  if (error) {
    return { ok: false, message: error.message };
  }

  if (message) {
    const eventType = statusEventMap[status];
    await supabase.from("request_events").insert({
      request_id: requestId,
      event_type: eventType,
      message,
    });
  }

  revalidatePath("/operator");
  return { ok: true, message: "Statut mis a jour." };
}

export async function assignRequestElevator(requestId: string, elevatorId: string | null) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: elevateur assigne localement." };
  }

  const { error } = await supabase
    .from("requests")
    .update({ elevator_id: elevatorId || null, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/operator");
  revalidatePath("/admin");
  return { ok: true, message: elevatorId ? "Demande reassignee." : "Demande remise non assignee." };
}

const statusEventMap: Record<RequestStatus, RequestEventType> = {
  pending: "deferred",
  assigned: "assigned",
  arriving: "arriving",
  boarded: "boarded",
  completed: "completed",
  cancelled: "cancelled",
};

export async function advanceRequestStatus(requestId: string, status: RequestStatus) {
  const messages: Record<RequestStatus, string> = {
    pending: "Reporte au prochain passage.",
    assigned: "Pris en charge par l'operateur.",
    arriving: "L'operateur est arrive a l'etage.",
    boarded: "Passagers embarques.",
    completed: "Passagers deposes.",
    cancelled: "Annule par l'operateur.",
  };

  return updateRequestStatus(requestId, status, messages[status]);
}

export async function createRequestEvent(requestId: string, eventType: RequestEventType, message: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: evenement simule." };
  }

  const { error } = await supabase.from("request_events").insert({
    request_id: requestId,
    event_type: eventType,
    message,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/operator");
  return { ok: true, message: "Evenement ajoute." };
}

export async function adjustElevatorLoad(elevatorId: string, currentLoad: number) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: charge ajustee." };
  }

  const { error } = await supabase.from("elevators").update({ current_load: currentLoad }).eq("id", elevatorId);
  return { ok: !error, message: error?.message ?? "Charge ajustee." };
}

export async function sendOperatorMessage(projectId: string, elevatorId: string | null, message: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: message envoye." };
  }

  const { error } = await supabase.from("operator_messages").insert({
    project_id: projectId,
    elevator_id: elevatorId,
    message,
  });

  return { ok: !error, message: error?.message ?? "Message envoye." };
}
