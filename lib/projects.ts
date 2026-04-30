import { demoElevator, demoFloors, demoProjects } from "@/lib/demoData";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/hoist";

type FloorQrRow = { project_id: string; active: boolean; qr_token: string | null };
type ElevatorRow = { project_id: string };

/** Au moins un étage actif avec token QR + au moins un ascenseur (aligné sur le setup chantier). */
function isProjectQrBundleReady(
  project: Pick<Project, "id" | "name">,
  floors: FloorQrRow[],
  elevatorCounts: Map<string, number>,
): boolean {
  if (!project.name?.trim()) {
    return false;
  }
  if ((elevatorCounts.get(project.id) ?? 0) < 1) {
    return false;
  }
  return floors.some(
    (f) =>
      f.project_id === project.id &&
      f.active &&
      String(f.qr_token ?? "").trim().length > 0,
  );
}

function computeQrReadyProjectIds(projects: Project[], floors: FloorQrRow[], elevators: ElevatorRow[]): string[] {
  const elevatorCounts = new Map<string, number>();
  for (const row of elevators) {
    const pid = row.project_id;
    elevatorCounts.set(pid, (elevatorCounts.get(pid) ?? 0) + 1);
  }
  return projects.filter((p) => isProjectQrBundleReady(p, floors, elevatorCounts)).map((p) => p.id);
}

export type ProjectsLoadResult = {
  projects: Project[];
  /** Message d’erreur Supabase ; liste vide peut venir d’une vraie absence de projets ou d’un échec de requête. */
  loadError: string | null;
  /** Projets où l’impression du bundle QR est pertinente (étages + ascenseur). */
  qrReadyProjectIds: string[];
};

export async function getProjects(): Promise<ProjectsLoadResult> {
  const supabase = await createClient();

  if (!supabase) {
    const floors = demoFloors.map((f) => ({
      project_id: f.project_id,
      active: f.active,
      qr_token: f.qr_token,
    }));
    return {
      projects: demoProjects,
      loadError: null,
      qrReadyProjectIds: computeQrReadyProjectIds(demoProjects, floors, [{ project_id: demoElevator.project_id }]),
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return { projects: [], loadError: null, qrReadyProjectIds: [] };
  }

  /** Visibilité = policy RLS (propriétaire ou membre), sans filtrer seulement sur owner_id. */
  const { data, error } = await supabase
    .from("projects")
    .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone,priorities_enabled")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { projects: [], loadError: error.message, qrReadyProjectIds: [] };
  }

  const projects = (data ?? []) as Project[];
  const ids = projects.map((p) => p.id);

  if (ids.length === 0) {
    return { projects, loadError: null, qrReadyProjectIds: [] };
  }

  const [{ data: floorRows, error: floorsError }, { data: elevatorRows, error: elevatorsError }] = await Promise.all([
    supabase.from("floors").select("project_id,active,qr_token").in("project_id", ids),
    supabase.from("elevators").select("project_id").in("project_id", ids),
  ]);

  if (floorsError || elevatorsError) {
    return { projects, loadError: null, qrReadyProjectIds: [] };
  }

  const qrReadyProjectIds = computeQrReadyProjectIds(
    projects,
    (floorRows ?? []) as FloorQrRow[],
    (elevatorRows ?? []) as ElevatorRow[],
  );

  return { projects, loadError: null, qrReadyProjectIds };
}
