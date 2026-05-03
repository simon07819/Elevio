"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { demoElevator, demoFloors, demoProject, demoProjects } from "@/lib/demoData";
import { maxPassengerPartySize } from "@/lib/passengerPartyLimits";
import { floorLabelForSortOrder, getDirection, isUuid } from "@/lib/utils";
import { assignRequestToBestElevator } from "@/services/multiElevatorDispatch";
import { elevatorDuplicateMessage } from "@/lib/elevatorMessages";
import type {
  Direction,
  Elevator,
  Floor,
  HoistRequest,
  PassengerResumeSnapshot,
  Project,
  RequestEventType,
  RequestStatus,
} from "@/types/hoist";

import { elevatorHasOperatorTabletBinding, isOperatorTabletSessionStale } from "@/lib/operatorTablet";
import {
  analyzePassengerDispatch,
  assertValidTimeZone,
  DEFAULT_PROJECT_TIMEZONE,
  parsePostgresTimeToMinutes,
  type DispatchBlockReason,
} from "@/lib/operatorDispatchAvailability";

const PASSENGER_DUPLICATE_OPEN_REQUEST_MSG =
  "Vous avez déjà une demande en cours depuis cet appareil. Suivez votre demande ou attendez la fin du trajet avant d'en envoyer une autre.";

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

function normalizeOperatorDisplayName(raw: string | null | undefined) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return value.length > 120 ? value.slice(0, 120) : value;
}

function parseElevatorServiceTimes(
  startRaw: string,
  endRaw: string,
): { ok: true; start: string; end: string } | { ok: false; message: string } {
  let s = startRaw.trim();
  let e = endRaw.trim();
  if (!s) s = "07:00";
  if (!e) e = "15:00";
  const start = normalizedDbTimeFromInput(s);
  const end = normalizedDbTimeFromInput(e);
  if (!start || !end) {
    return { ok: false, message: "Heures de service invalides." };
  }
  const sm = parsePostgresTimeToMinutes(start);
  const em = parsePostgresTimeToMinutes(end);
  if (sm === null || em === null || sm === em) {
    return { ok: false, message: "L'heure de debut et de fin ne peuvent pas etre identiques." };
  }
  if (sm % 15 !== 0 || em % 15 !== 0) {
    return { ok: false, message: "Les heures de service doivent etre en quarts d'heure (00, 15, 30, 45)." };
  }
  return { ok: true, start, end };
}

function passengerDispatchBlockedMessage(reason: DispatchBlockReason | null): string {
  switch (reason) {
    case "no_live_operator":
      return "Aucun operateur disponible pour le moment.";
    default:
      return "Service temporairement indisponible.";
  }
}

function staleIdsAction(): { ok: false; message: string } {
  return { ok: false, message: "Donnees expirees. Rechargez la page." };
}

function projectPayload(formData: FormData) {
  let service_timezone = String(formData.get("serviceTimezone") ?? "").trim();
  if (!service_timezone) service_timezone = DEFAULT_PROJECT_TIMEZONE;

  return {
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    service_timezone,
    priorities_enabled: formData.get("prioritiesEnabled") === "on",
    capacity_enabled: formData.get("capacityEnabled") === "on",
  };
}

function isMissingCapacityEnabledColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST204" || message.includes("capacity_enabled");
}

function stripCapacityEnabled<T extends Record<string, unknown>>(patch: T) {
  const next = { ...patch };
  delete next.capacity_enabled;
  return next;
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

  const createPayload = {
    ...payload,
    owner_id: user.id,
    active: makeActive,
    archived_at: null,
  };
  let projectQuery = (await supabase
    .from("projects")
    .insert(createPayload)
    .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone,priorities_enabled,capacity_enabled")
    .single()) as unknown as {
    data: Project | null;
    error: { message: string; code?: string } | null;
  };

  if (isMissingCapacityEnabledColumn(projectQuery.error)) {
    projectQuery = (await supabase
      .from("projects")
      .insert(stripCapacityEnabled(createPayload))
      .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone,priorities_enabled")
      .single()) as unknown as {
      data: Project | null;
      error: { message: string; code?: string } | null;
    };
  }

  const { data: project, error } = projectQuery;

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  return {
    ok: true,
    message: "Projet cree.",
    project: { ...(project as Project), capacity_enabled: (project as Project).capacity_enabled ?? true },
  };
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

  if (!isUuid(projectId)) {
    return staleIdsAction();
  }

  let { error } = await supabase.from("projects").update(payload).eq("id", projectId);

  if (isMissingCapacityEnabledColumn(error)) {
    const retry = await supabase.from("projects").update(stripCapacityEnabled(payload)).eq("id", projectId);
    error = retry.error;
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath("/operator");
  revalidatePath("/request");
  return { ok: true, message: "Projet modifie." };
}

export async function activateProject(projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: projet active localement." };
  }

  if (!isUuid(projectId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId)) {
    return staleIdsAction();
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

const REQUESTS_OPEN_DURING_SERVICE: RequestStatus[] = ["pending", "assigned", "arriving", "boarded"];

/** Legal forward-only status transitions. Terminal statuses (completed, cancelled) have no outgoing edges. */
const LEGAL_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ["assigned", "boarded", "cancelled"],
  assigned: ["arriving", "boarded", "pending", "cancelled"],
  arriving: ["boarded", "pending", "cancelled"],
  boarded: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function isLegalTransition(from: RequestStatus, to: RequestStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

async function cancelActiveProjectRequests(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  projectId: string,
  message: string,
) {
  const now = new Date().toISOString();
  await supabase
    .from("requests")
    .update({
      status: "cancelled",
      completed_at: now,
      updated_at: now,
      note: message,
    })
    .eq("project_id", projectId)
    .in("status", REQUESTS_OPEN_DURING_SERVICE);

  await supabase
    .from("elevators")
    .update({ current_load: 0, direction: "idle" })
    .eq("project_id", projectId);
}

async function cancelActiveProjectRequestsIfNoLiveOperators(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  projectId: string,
) {
  const { data: elevators } = await supabase
    .from("elevators")
    .select(elevatorSelectColumns)
    .eq("project_id", projectId)
    .eq("active", true);

  const hasLiveOperator = ((elevators ?? []) as Elevator[]).some(
    (elevator) =>
      Boolean(elevator.operator_session_id) &&
      !isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at),
  );

  if (!hasLiveOperator) {
    await cancelActiveProjectRequests(supabase, projectId, "Annule automatiquement: aucun operateur actif.");
  }
}

/** Statuts orphelins : demandes actives incluant boarded — un autre opérateur peut déposer les passagers embarqués. */
const ORPHAN_REASSIGN_STATUSES: RequestStatus[] = ["pending", "assigned", "arriving", "boarded"];

/**
 * Réassigne les demandes orphelines (assignées à l'ascenseur libéré, non boarded)
 * vers un autre opérateur actif et éligible. Seul elevator_id est modifié.
 * Si une demande ne peut pas être réassignée (opérateur PLEIN, capacité pleine,
 * hors service), elle est annulée proprement.
 * Retourne true si TOUTES les demandes ont été réassignées (donc pas de reset passager).
 */
async function reassignOrphanedRequestsToActiveOperator(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  projectId: string,
  releasedElevatorId: string,
): Promise<boolean> {
  const { data: elevators } = await supabase
    .from("elevators")
    .select(elevatorSelectColumns)
    .eq("project_id", projectId)
    .eq("active", true);

  const liveElevators = ((elevators ?? []) as Elevator[]).filter(
    (e) =>
      e.id !== releasedElevatorId &&
      Boolean(e.operator_session_id) &&
      !isOperatorTabletSessionStale(e.operator_session_heartbeat_at),
  );

  if (liveElevators.length === 0) {
    return false;
  }

  const { data: orphans } = await supabase
    .from("requests")
    .select("id,from_floor_id,to_floor_id,direction,passenger_count,priority,wait_started_at,status")
    .eq("project_id", projectId)
    .eq("elevator_id", releasedElevatorId)
    .in("status", ORPHAN_REASSIGN_STATUSES);

  if (!orphans || orphans.length === 0) {
    return true;
  }

  const { data: floors } = await supabase
    .from("floors")
    .select("*")
    .eq("project_id", projectId);

  const { data: activeRequests } = await supabase
    .from("requests")
    .select("id,project_id,elevator_id,from_floor_id,to_floor_id,direction,passenger_count,original_passenger_count,remaining_passenger_count,split_required,priority,priority_reason,note,status,sequence_number,wait_started_at,created_at,updated_at,completed_at")
    .eq("project_id", projectId)
    .in("status", REQUESTS_OPEN_DURING_SERVICE);

  const projectFloors = (floors ?? []) as Floor[];
  const allRequests = (activeRequests ?? []) as HoistRequest[];
  const unassignedIds: string[] = [];

  for (const orphan of orphans) {
    const assignment = assignRequestToBestElevator({
      request: orphan,
      elevators: liveElevators,
      floors: projectFloors,
      requests: allRequests,
    });
    if (assignment.elevatorId) {
      await supabase
        .from("requests")
        .update({ elevator_id: assignment.elevatorId, updated_at: new Date().toISOString() })
        .eq("id", orphan.id);
    } else {
      // Aucun opérateur éligible (PLEIN, capacité pleine, hors service) → annuler
      unassignedIds.push(orphan.id);
    }
  }

  // Annuler les demandes qui n'ont pas pu être réassignées
  if (unassignedIds.length > 0) {
    const now = new Date().toISOString();
    await supabase
      .from("requests")
      .update({
        status: "cancelled",
        completed_at: now,
        updated_at: now,
        note: "Annulée automatiquement : aucun opérateur éligible disponible.",
      })
      .in("id", unassignedIds);
  }

  // Retourner false si au moins une demande n'a pas pu être réassignée
  // → le client doit envoyer queue_cleared pour ces passagers
  return unassignedIds.length === 0;
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

  if (!isUuid(projectId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId) || !isUuid(floorId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId) || !isUuid(floorId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId) || !isUuid(floorId)) {
    return staleIdsAction();
  }

  const { error } = await supabase.from("floors").delete().eq("id", floorId).eq("project_id", projectId);

  if (error) {
    return { ok: false, message: "Impossible de supprimer cet etage s'il est utilise par des demandes." };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Etage supprime." };
}

/** `*` évite les erreurs si la base n’a pas encore toutes les colonnes (migrations partielles). */
const elevatorSelectColumns = "*";

const TABLET_SESSION_FIELDS_CLEAR = {
  operator_session_id: null,
  operator_session_started_at: null,
  operator_session_heartbeat_at: null,
  operator_user_id: null,
  operator_tablet_label: null,
  operator_display_name: null,
} as const;

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

function isMissingOperatorDisplayNameColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST204" || message.includes("operator_display_name");
}

function stripOperatorDisplayName<T extends Record<string, unknown>>(patch: T) {
  const next = { ...patch };
  delete next.operator_display_name;
  return next;
}

function isMissingElevatorManualFullColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST204" || message.includes("manual_full");
}

function stripElevatorManualFull<T extends Record<string, unknown>>(patch: T) {
  const next = { ...patch };
  delete next.manual_full;
  return next;
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
      service_start_time: "07:00:00",
      service_end_time: "15:00:00",
      operator_tablet_label: null,
      operator_display_name: null,
      manual_full: false,
    };
    return { ok: true, message: "Mode demo: elevateur ajoute localement.", elevator };
  }

  if (!isUuid(projectId)) {
    return staleIdsAction();
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

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
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

  if (!supabase) {
    return { ok: true, message: "Mode demo: capacite modifiee localement." };
  }

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
  }

  if (await elevatorNameConflict(supabase, projectId, name, elevatorId)) {
    return { ok: false, message: elevatorDuplicateMessage };
  }

  const { error } = await supabase
    .from("elevators")
    .update({
      name,
      capacity,
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
  tabletLabel?: string | null,
  serviceStart?: string | null,
  serviceEnd?: string | null,
  capacityRaw?: string | number | null,
  operatorDisplayNameRaw?: string | null,
) {
  const supabase = await createClient();

  if (!sessionId) {
    return { ok: false, message: "Session tablette invalide." };
  }

  const capacity = Number.parseInt(String(capacityRaw ?? "").trim(), 10);
  if (!Number.isFinite(capacity) || capacity < 1) {
    return { ok: false, message: "Capacite invalide (minimum 1 passager)." };
  }

  const serviceTimes = parseElevatorServiceTimes(String(serviceStart ?? ""), String(serviceEnd ?? ""));
  if (!serviceTimes.ok) {
    return { ok: false, message: serviceTimes.message };
  }

  const normalizedTabletLabel = (() => {
    const t = (tabletLabel ?? "").trim();
    if (!t) return null;
    return t.length > 120 ? t.slice(0, 120) : t;
  })();

  if (!supabase) {
    return { ok: true, message: "Mode demo: tablette activee.", elevatorId };
  }

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
  }

  if (currentFloorId && !isUuid(currentFloorId)) {
    return staleIdsAction();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion operateur requise." };
  }

  const operatorDisplayName =
    normalizeOperatorDisplayName(operatorDisplayNameRaw) ??
    normalizeOperatorDisplayName(user.email?.includes("@") ? user.email.split("@")[0] : user.email);

  const { data: elevator, error: elevatorError } = await supabase
    .from("elevators")
    .select("*")
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

  const sessionClear = { ...TABLET_SESSION_FIELDS_CLEAR };

  /* Index unique sur operator_session_id: une session ne peut être que sur un ascenseur.
   * Sans cette étape, activer un 2e ascenseur avec la même session (ex. heartbeats périmés,
   * ou changement d’ascenseur sans libération) provoque duplicate key sur elevators_operator_session_idx. */
  let { error: clearError } = await supabase
    .from("elevators")
    .update(sessionClear)
    .eq("project_id", projectId)
    .eq("operator_session_id", sessionId);

  if (clearError && isMissingOperatorDisplayNameColumn(clearError)) {
    const retry = await supabase
      .from("elevators")
      .update(stripOperatorDisplayName(sessionClear))
      .eq("project_id", projectId)
      .eq("operator_session_id", sessionId);
    clearError = retry.error;
  }

  if (clearError) {
    return { ok: false, message: clearError.message };
  }

  const now = new Date().toISOString();

  const activationPatch = {
    operator_session_id: sessionId,
    operator_session_started_at: now,
    operator_session_heartbeat_at: now,
    operator_user_id: user.id,
    operator_display_name: operatorDisplayName,
    operator_tablet_label: normalizedTabletLabel,
    current_floor_id: currentFloorId || null,
    direction: "idle",
    current_load: 0,
    capacity,
    service_start_time: serviceTimes.start,
    service_end_time: serviceTimes.end,
    manual_full: false,
  };

  let { error } = await supabase
    .from("elevators")
    .update(activationPatch)
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (error && isMissingOperatorDisplayNameColumn(error)) {
    const retry = await supabase
      .from("elevators")
      .update(stripOperatorDisplayName(activationPatch))
      .eq("id", elevatorId)
      .eq("project_id", projectId);
    error = retry.error;
  }

  if (error && isMissingElevatorManualFullColumn(error)) {
    const retry = await supabase
      .from("elevators")
      .update(stripElevatorManualFull(activationPatch))
      .eq("id", elevatorId)
      .eq("project_id", projectId);
    error = retry.error;
  }

  if (error && (isMissingOperatorDisplayNameColumn(error) || isMissingElevatorManualFullColumn(error))) {
    const retry = await supabase
      .from("elevators")
      .update(stripElevatorManualFull(stripOperatorDisplayName(activationPatch)))
      .eq("id", elevatorId)
      .eq("project_id", projectId);
    error = retry.error;
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: "Tablette operateur activee.", elevatorId };
}

export async function setElevatorManualFull(projectId: string, elevatorId: string, manualFull: boolean) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: manualFull ? "Mode demo: cabine marquee pleine." : "Mode demo: cabine remise disponible." };
  }

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
  }

  const { error } = await supabase
    .from("elevators")
    .update({ manual_full: manualFull })
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (error) {
    if (isMissingElevatorManualFullColumn(error)) {
      return {
        ok: false,
        message: "Colonne manual_full absente. Executez le SQL supabase/elevator-manual-full.sql.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidateAdminProject(projectId);
  return { ok: true, message: manualFull ? "Cabine marquee pleine." : "Cabine remise disponible." };
}

export async function heartbeatOperatorElevator(projectId: string, elevatorId: string, sessionId: string) {
  const supabase = await createClient();

  if (!supabase || !sessionId) {
    return { ok: true, message: "Heartbeat ignore." };
  }

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
  }

  const patch: Record<string, unknown> = {
    operator_session_heartbeat_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from("elevators")
    .update(patch)
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .eq("operator_session_id", sessionId);

  if (error && isMissingOperatorDisplayNameColumn(error)) {
    const retry = await supabase
      .from("elevators")
      .update(stripOperatorDisplayName(patch))
      .eq("id", elevatorId)
      .eq("project_id", projectId)
      .eq("operator_session_id", sessionId);
    error = retry.error;
  }

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

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Connexion operateur requise." };
  }

  let releaseResult = await supabase
    .from("elevators")
    .update({
      ...TABLET_SESSION_FIELDS_CLEAR,
    })
    .eq("id", elevatorId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (releaseResult.error && isMissingOperatorDisplayNameColumn(releaseResult.error)) {
    releaseResult = await supabase
      .from("elevators")
      .update(stripOperatorDisplayName({ ...TABLET_SESSION_FIELDS_CLEAR }))
      .eq("id", elevatorId)
      .eq("project_id", projectId)
      .select("id")
      .maybeSingle();
  }

  const { data: updated, error } = releaseResult;

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!updated) {
    return {
      ok: false,
      message:
        "Impossible de liberer la tablette. Cabine introuvable ou acces refuse.",
    };
  }

  const hasOtherOperator = await reassignOrphanedRequestsToActiveOperator(supabase, projectId, elevatorId);
  // Reset elevator state on release — ghost load/direction causes PAUSE on next session.
  const stateReset: Record<string, unknown> = { current_load: 0, direction: "idle" };
  // Try including manual_full; if the column doesn't exist yet, the update still succeeds for the other fields.
  const fullReset = { ...stateReset, manual_full: false };
  const resetResult = await supabase.from("elevators").update(fullReset).eq("id", elevatorId).eq("project_id", projectId);
  if (resetResult.error) {
    // Fallback without manual_full (missing column)
    await supabase.from("elevators").update(stateReset).eq("id", elevatorId).eq("project_id", projectId);
  }
  await cancelActiveProjectRequestsIfNoLiveOperators(supabase, projectId);
  revalidateAdminProject(projectId);
  return { ok: true as const, message: "Tablette operateur liberee.", hasOtherOperator };
}

export async function adminDeactivateOperatorTablet(projectId: string, elevatorId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: tablette desactivee." };
  }

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
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

  let { error } = await supabase
    .from("elevators")
    .update({
      ...TABLET_SESSION_FIELDS_CLEAR,
    })
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  if (error && isMissingOperatorDisplayNameColumn(error)) {
    const retry = await supabase
      .from("elevators")
      .update(stripOperatorDisplayName({ ...TABLET_SESSION_FIELDS_CLEAR }))
      .eq("id", elevatorId)
      .eq("project_id", projectId);
    error = retry.error;
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  // Reassign orphaned requests (including boarded) before canceling
  await reassignOrphanedRequestsToActiveOperator(supabase, projectId, elevatorId);
  // Reset elevator state — ghost load/direction/manual_full causes PAUSE on next session.
  const stateReset: Record<string, unknown> = { current_load: 0, direction: "idle" };
  const fullReset = { ...stateReset, manual_full: false };
  const resetResult = await supabase.from("elevators").update(fullReset).eq("id", elevatorId).eq("project_id", projectId);
  if (resetResult.error) {
    await supabase.from("elevators").update(stateReset).eq("id", elevatorId).eq("project_id", projectId);
  }
  await cancelActiveProjectRequestsIfNoLiveOperators(supabase, projectId);
  revalidateAdminProject(projectId);
  return { ok: true, message: "Tablette desactivee. L’operateur devra reactiver depuis son appareil." };
}

export async function createPassengerRequest(formData: FormData) {
  const supabase = await createClient();
  const projectId = String(formData.get("projectId") ?? "");
  const fromFloorId = String(formData.get("fromFloorId") ?? "");
  const toFloorId = String(formData.get("toFloorId") ?? "");
  const passengerCountRaw = Number(formData.get("passengerCount") ?? 1);
  const priorityRequested = formData.get("priority") === "on";
  const priorityReasonRaw = normalizeText(formData.get("priorityReason"));
  const note = normalizeText(formData.get("note"));

  let prioritiesAllowed = true;

  let fromFloor = demoFloors.find((floor) => floor.id === fromFloorId);
  let toFloor = demoFloors.find((floor) => floor.id === toFloorId);
  let projectFloors = demoFloors.filter((floor) => floor.project_id === projectId);

  let elevators: Elevator[] = [];
  let activeRequests: HoistRequest[] = [];
  let serviceTz = DEFAULT_PROJECT_TIMEZONE;
  let capacityEnabled = true;

  if (supabase) {
    if (!isUuid(projectId) || !isUuid(fromFloorId) || !isUuid(toFloorId)) {
      return { ok: false, message: "Lien ou chantier invalide. Utilisez le QR du chantier." };
    }

    const [floorsResult, projectResult, elevatorsResult, requestsResult] = await Promise.all([
      supabase
        .from("floors")
        .select("id,project_id,label,sort_order,qr_token,access_code,active")
        .eq("project_id", projectId),
      supabase
        .from("projects")
        .select("service_timezone,priorities_enabled,capacity_enabled")
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

    let projectRow = projectResult.data;
    if (isMissingCapacityEnabledColumn(projectResult.error)) {
      const legacyProject = await supabase
        .from("projects")
        .select("service_timezone,priorities_enabled")
        .eq("id", projectId)
        .eq("active", true)
        .is("archived_at", null)
        .maybeSingle();
      projectRow = legacyProject.data ? { ...legacyProject.data, capacity_enabled: true } : null;
    }

    const dbFloors = floorsResult.data;
    const dbElevators = elevatorsResult.data;
    const dbRequests = requestsResult.data;

    projectFloors = (dbFloors ?? []) as Floor[];
    fromFloor = dbFloors?.find((floor) => floor.id === fromFloorId) ?? fromFloor;
    toFloor = dbFloors?.find((floor) => floor.id === toFloorId) ?? toFloor;

    if (!projectRow) {
      return { ok: false, message: "Chantier introuvable ou inactif." };
    }

    serviceTz = projectRow.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
    prioritiesAllowed = projectRow.priorities_enabled !== false;
    capacityEnabled = projectRow.capacity_enabled !== false;
    elevators = (dbElevators ?? []) as Elevator[];
    activeRequests = (dbRequests ?? []) as HoistRequest[];
  } else {
    const demoMatch = demoProjects.find((p) => p.id === projectId);
    if (demoMatch) {
      capacityEnabled = demoMatch.capacity_enabled !== false;
      if (demoMatch.id === demoProject.id) {
        elevators = [demoElevator];
      }
    }
  }

  const maxParty = maxPassengerPartySize(capacityEnabled, elevators);
  const passengerFloored = Number.isFinite(passengerCountRaw) ? Math.floor(passengerCountRaw) : NaN;
  if (!Number.isFinite(passengerFloored) || passengerFloored < 1 || passengerFloored > maxParty) {
    return { ok: false, message: `Nombre de passagers invalide (entre 1 et ${maxParty}).` };
  }
  const passengerCount = passengerFloored;

  const priority = prioritiesAllowed && priorityRequested;
  const priorityReason = priority ? priorityReasonRaw : null;

  if (priority && !priorityReason) {
    return { ok: false, message: "La raison est obligatoire pour une priorite." };
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

  const passengerDeviceKeyRaw = String(formData.get("passengerDeviceKey") ?? "").trim();
  const passengerDeviceKey = isUuid(passengerDeviceKeyRaw) ? passengerDeviceKeyRaw : null;

  if (supabase && passengerDeviceKey) {
    const { data: hasOpen, error: openRpcError } = await supabase.rpc("passenger_has_open_request", {
      p_project_id: projectId,
      p_device_key: passengerDeviceKey,
    });
    if (!openRpcError && Boolean(hasOpen)) {
      return { ok: false, message: PASSENGER_DUPLICATE_OPEN_REQUEST_MSG };
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

  const payloads: Array<
    typeof payload & {
      elevator_id: string | null;
      id: string;
    }
  > = [];
  let syntheticReservations: HoistRequest[] = [];
  let remainingPassengers = passengerCount;

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
      requests: [...activeRequests, ...syntheticReservations],
      prioritiesEnabled: prioritiesAllowed,
      capacityEnabled,
    });

    if (!assignment.elevatorId) {
      if (syntheticReservations.length > 0) {
        syntheticReservations = [];
        continue;
      }
      return {
        ok: false,
        message:
          "Aucun ascenseur en ligne n’a assez de places libres pour votre groupe pour le moment. Réessayez dans quelques minutes.",
      };
    }

    const chunkSize =
      !capacityEnabled
        ? remainingPassengers
        : assignment.assignableChunk != null && assignment.assignableChunk > 0
        ? assignment.assignableChunk
        : Math.min(
            remainingPassengers,
            Number(elevators.find((e) => e.id === assignment.elevatorId)?.capacity ?? remainingPassengers),
          );

    if (chunkSize < 1) {
      return {
        ok: false,
        message:
          "Capacité ascenseur insuffisante pour poursuivre le fractionnement du groupe. Réessayez plus tard ou contactez le chantier.",
      };
    }

    const remainingAfterChunk = Math.max(0, remainingPassengers - chunkSize);
    const splitRequired = passengerCount > chunkSize || remainingAfterChunk > 0;
    const nextPayload = {
      ...payload,
      id: randomUUID(),
      elevator_id: assignment.elevatorId,
      passenger_count: chunkSize,
      remaining_passenger_count: remainingAfterChunk,
      split_required: splitRequired,
      note: splitRequired
        ? [note, `Groupe divise: ${chunkSize}/${passengerCount} personne(s) assignees.`].filter(Boolean).join(" ")
        : note,
    };

    payloads.push(nextPayload);

    syntheticReservations.push({
      ...nextPayload,
      sequence_number: Number.MAX_SAFE_INTEGER - payloads.length,
      created_at: payload.wait_started_at,
      updated_at: payload.wait_started_at,
      completed_at: null,
    });

    remainingPassengers = remainingAfterChunk;
  }

  /* Sans `.select()` : PostgREST n’a pas besoin du droit SELECT sur requests après INSERT — sinon les passagers
   * anonymes (pas profile projet) voient une erreur RLS sur RETURNING, surtout avec plusieurs lignes (split). */
  const rowsForInsert =
    passengerDeviceKey != null
      ? payloads.map((row) => ({ ...row, passenger_device_key: passengerDeviceKey }))
      : payloads;

  const { error } = await supabase.from("requests").insert(rowsForInsert);

  if (error) {
    return { ok: false, message: error.message };
  }

  const firstRow = payloads[0];

  if (!firstRow) {
    return { ok: false, message: "La demande n'a pas pu etre creee." };
  }

  revalidatePath("/operator");
  return {
    ok: true,
    message: "Demande envoyee.",
    requestId: firstRow.id,
    status: firstRow.status,
    waitStartedAt: firstRow.wait_started_at,
    fromFloorId: firstRow.from_floor_id,
    toFloorId: firstRow.to_floor_id,
    passengerCount,
  };
}

const REQUEST_STATUS_VALUES: RequestStatus[] = [
  "pending",
  "assigned",
  "arriving",
  "boarded",
  "completed",
  "cancelled",
];

function coerceRequestStatus(value: string): RequestStatus | null {
  return REQUEST_STATUS_VALUES.includes(value as RequestStatus) ? (value as RequestStatus) : null;
}

/** RPC `resume_passenger_request` : meme QR + id ; permet de rouvrir la demande sans session auth. */
export async function resumePassengerRequest(
  projectId: string,
  floorQrToken: string,
  requestId: string,
): Promise<{ ok: true; snapshot: PassengerResumeSnapshot } | { ok: false; snapshot: null }> {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, snapshot: null };
  }

  if (!isUuid(projectId) || !isUuid(requestId)) {
    return { ok: false, snapshot: null };
  }

  const token = floorQrToken?.trim();
  if (!token) {
    return { ok: false, snapshot: null };
  }

  const { data, error } = await supabase.rpc("resume_passenger_request", {
    p_request_id: requestId,
    p_project_id: projectId,
    p_floor_token: token,
  });

  if (error || data == null) {
    return { ok: false, snapshot: null };
  }

  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0] as {
    id?: string;
    status?: string;
    wait_started_at?: string;
    from_floor_id?: string;
    to_floor_id?: string;
    passenger_count?: number;
  };

  if (!row?.id || !row.status || !row.wait_started_at) {
    return { ok: false, snapshot: null };
  }

  const status = coerceRequestStatus(row.status);
  if (!status) {
    return { ok: false, snapshot: null };
  }

  return {
    ok: true,
    snapshot: {
      requestId: row.id,
      status,
      waitStartedAt: row.wait_started_at,
      fromFloorId: row.from_floor_id as string,
      toFloorId: row.to_floor_id as string,
      passengerCount: Number(row.passenger_count ?? 0),
    },
  };
}

const statusEventMap: Record<RequestStatus, RequestEventType> = {
  pending: "deferred",
  assigned: "assigned",
  arriving: "arriving",
  boarded: "boarded",
  completed: "completed",
  cancelled: "cancelled",
};

async function sumBoardedPassengersForElevator(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  elevatorId: string,
): Promise<number> {
  const { data: rows } = await supabase
    .from("requests")
    .select("passenger_count")
    .eq("elevator_id", elevatorId)
    .eq("status", "boarded");

  return (rows ?? []).reduce((sum, row) => sum + Number(row.passenger_count ?? 0), 0);
}

async function syncElevatorWithRequestStatus(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  requestId: string,
  status: RequestStatus,
) {
  const { data: req } = await supabase
    .from("requests")
    .select("elevator_id, from_floor_id, to_floor_id, direction, project_id")
    .eq("id", requestId)
    .single();

  if (!req?.elevator_id) {
    return;
  }

  const elevatorId = req.elevator_id as string;
  const projectId = req.project_id as string;

  const current_load = await sumBoardedPassengersForElevator(supabase, elevatorId);

  const { data: elevator } = await supabase.from("elevators").select("id, current_floor_id").eq("id", elevatorId).single();

  if (!elevator) {
    return;
  }

  const floorIds = [elevator.current_floor_id, req.from_floor_id, req.to_floor_id].filter(Boolean) as string[];

  const { data: floorRows } = await supabase.from("floors").select("id, sort_order").in("id", floorIds);

  const sortById = new Map((floorRows ?? []).map((row) => [row.id as string, row.sort_order as number]));

  const currentSort =
    elevator.current_floor_id != null ? sortById.get(elevator.current_floor_id as string) : undefined;
  const fromSort = sortById.get(req.from_floor_id as string);
  const reqDirection = req.direction as Exclude<Direction, "idle">;

  let direction: Direction = "idle";
  let current_floor_id: string | undefined;

  if (status === "completed") {
    direction = "idle";
    current_floor_id = req.to_floor_id as string;
  } else if (status === "cancelled" || status === "pending") {
    direction = "idle";
  } else if (status === "boarded") {
    direction = reqDirection;
    current_floor_id = req.from_floor_id as string;
  } else if (status === "assigned" || status === "arriving") {
    if (currentSort !== undefined && fromSort !== undefined) {
      if (currentSort < fromSort) direction = "up";
      else if (currentSort > fromSort) direction = "down";
      else direction = "idle";
    } else {
      direction = "idle";
    }
  } else {
    return;
  }

  const patch: Record<string, unknown> = { direction, current_load };
  if (current_floor_id !== undefined) {
    patch.current_floor_id = current_floor_id;
  }

  const { error } = await supabase.from("elevators").update(patch).eq("id", elevatorId).eq("project_id", projectId);

  if (!error) {
    revalidateAdminProject(projectId);
  }
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  message?: string,
  options?: {
    assignElevatorId?: string;
    cancelRelatedSplit?: {
      projectId: string;
      fromFloorId: string;
      toFloorId: string;
      waitStartedAt: string;
      originalPassengerCount: number;
    };
  },
) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: action simulee." };
  }

  if (!isUuid(requestId)) {
    return staleIdsAction();
  }

  // Enforce legal forward-only status transitions.
  // Terminal statuses (completed, cancelled) must never escape.
  // Backward transitions (e.g. completed→pending) are rejected.
  const { data: currentRequest } = await supabase
    .from("requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle();
  const currentStatus = (currentRequest?.status ?? "") as RequestStatus;
  if (currentStatus && !isLegalTransition(currentStatus, status)) {
    console.error("[updateRequestStatus] ILLEGAL TRANSITION", { requestId, from: currentStatus, to: status });
    return { ok: false, message: `Transition ${currentStatus}→${status} non autorisee.` };
  }
  if (!currentStatus) {
    console.warn("[updateRequestStatus] REQUEST NOT FOUND", { requestId, targetStatus: status });
  }
  console.log("[updateRequestStatus]", { requestId, from: currentStatus || "(not found)", to: status, elevatorId: options?.assignElevatorId });

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (
    status === "boarded" &&
    options?.assignElevatorId &&
    isUuid(options.assignElevatorId)
  ) {
    const { data: beforeRequest } = await supabase
      .from("requests")
      .select("elevator_id, project_id")
      .eq("id", requestId)
      .maybeSingle();

    if (beforeRequest?.elevator_id == null && beforeRequest?.project_id) {
      const { data: lift } = await supabase
        .from("elevators")
        .select("id")
        .eq("id", options.assignElevatorId)
        .eq("project_id", beforeRequest.project_id as string)
        .maybeSingle();

      if (lift) {
        updates.elevator_id = options.assignElevatorId;
      }
    }
  }

  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  if (status === "cancelled") {
    updates.completed_at = new Date().toISOString();
  }

  const { data: updatedRequest, error } = await supabase
    .from("requests")
    .update(updates)
    .eq("id", requestId)
    .select("id")
    .maybeSingle();

    if (error) {
    console.error("[updateRequestStatus] DB UPDATE ERROR", { requestId, status, error: error.message });
    return { ok: false, message: error.message };
  }
  if (!updatedRequest) {
    console.error("[updateRequestStatus] DB UPDATE NO ROW", { requestId, status });
    return { ok: false, message: "Impossible de mettre a jour cette demande." };
  }
  console.log("[updateRequestStatus] SUCCESS", { requestId, status });

  if (status === "cancelled" && options?.cancelRelatedSplit) {
    const group = options.cancelRelatedSplit;
    const { error: relatedError } = await supabase
      .from("requests")
      .update(updates)
      .eq("project_id", group.projectId)
      .eq("from_floor_id", group.fromFloorId)
      .eq("to_floor_id", group.toFloorId)
      .eq("wait_started_at", group.waitStartedAt)
      .eq("original_passenger_count", group.originalPassengerCount)
      .in("status", REQUESTS_OPEN_DURING_SERVICE);

    if (relatedError) {
      return { ok: false, message: relatedError.message };
    }
  }

  await syncElevatorWithRequestStatus(supabase, requestId, status);

  if (message) {
    const eventType = statusEventMap[status];
    await supabase.from("request_events").insert({
      request_id: requestId,
      event_type: eventType,
      message,
    });
  }

  revalidatePath("/operator");
  revalidatePath("/admin");
  return { ok: true, message: "Statut mis a jour." };
}

export async function assignRequestElevator(requestId: string, elevatorId: string | null) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: elevateur assigne localement." };
  }

  if (!isUuid(requestId) || (elevatorId != null && elevatorId !== "" && !isUuid(elevatorId))) {
    return staleIdsAction();
  }

  const { data: before } = await supabase
    .from("requests")
    .select("elevator_id, project_id")
    .eq("id", requestId)
    .single();

  const { data: updatedRequest, error } = await supabase
    .from("requests")
    .update({ elevator_id: elevatorId || null, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!updatedRequest) {
    return { ok: false, message: "Impossible de reassigner cette demande." };
  }

  const projectId = before?.project_id as string | undefined;
  if (projectId) {
    const touchedElevators = new Set<string>();
    const prevElevatorId = before?.elevator_id as string | null;
    if (prevElevatorId) touchedElevators.add(prevElevatorId);
    if (elevatorId) touchedElevators.add(elevatorId);

    for (const liftId of touchedElevators) {
      const current_load = await sumBoardedPassengersForElevator(supabase, liftId);
      await supabase.from("elevators").update({ current_load }).eq("id", liftId).eq("project_id", projectId);
    }
    revalidateAdminProject(projectId);
  }

  revalidatePath("/operator");
  revalidatePath("/admin");
  return { ok: true, message: elevatorId ? "Demande reassignee." : "Demande remise non assignee." };
}

export async function clearElevatorActiveRequests(projectId: string, elevatorId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: file videe." };
  }

  if (!isUuid(projectId) || !isUuid(elevatorId)) {
    return staleIdsAction();
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("requests")
    .update({
      status: "cancelled",
      completed_at: now,
      updated_at: now,
      note: "File videe par l'operateur.",
    })
    .eq("project_id", projectId)
    .eq("elevator_id", elevatorId)
    .in("status", REQUESTS_OPEN_DURING_SERVICE)
    .select("id");

  if (error) {
    return { ok: false, message: error.message };
  }

  await supabase
    .from("elevators")
    .update({ current_load: 0, direction: "idle" })
    .eq("id", elevatorId)
    .eq("project_id", projectId);

  revalidatePath("/operator");
  revalidatePath("/admin");
  return { ok: true, message: "File de demandes videe." };
}

export async function advanceRequestStatus(
  requestId: string,
  status: RequestStatus,
  options?: { assignElevatorId?: string },
) {
  const messages: Record<RequestStatus, string> = {
    pending: "Reporte au prochain passage.",
    assigned: "Pris en charge par l'operateur.",
    arriving: "L'operateur est arrive a l'etage.",
    boarded: "Passagers embarques.",
    completed: "Passagers deposes.",
    cancelled: "Annule par l'operateur.",
  };

  return updateRequestStatus(requestId, status, messages[status], options);
}

export async function createRequestEvent(requestId: string, eventType: RequestEventType, message: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: evenement simule." };
  }

  if (!isUuid(requestId)) {
    return staleIdsAction();
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

  if (!isUuid(elevatorId)) {
    return staleIdsAction();
  }

  const { error } = await supabase.from("elevators").update({ current_load: currentLoad }).eq("id", elevatorId);
  return { ok: !error, message: error?.message ?? "Charge ajustee." };
}

export async function sendOperatorMessage(projectId: string, elevatorId: string | null, message: string) {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: true, message: "Mode demo: message envoye." };
  }

  if (!isUuid(projectId) || (elevatorId != null && elevatorId !== "" && !isUuid(elevatorId))) {
    return staleIdsAction();
  }

  const { error } = await supabase.from("operator_messages").insert({
    project_id: projectId,
    elevator_id: elevatorId,
    message,
  });

  return { ok: !error, message: error?.message ?? "Message envoye." };
}
