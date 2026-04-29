import { demoFloors, demoProject } from "@/lib/demoData";
import { createClient } from "@/lib/supabase/server";
import type { Floor, Project } from "@/types/hoist";

export type PublicRequestContext = {
  project: Project;
  floors: Floor[];
  currentFloor: Floor;
};

export async function getPublicRequestContext({
  projectId,
  floorToken,
}: {
  projectId?: string;
  floorToken?: string;
}): Promise<PublicRequestContext> {
  const supabase = await createClient();

  if (!supabase || !projectId || !floorToken) {
    const currentFloor = demoFloors.find((floor) => floor.qr_token === floorToken) ?? demoFloors[4];
    return { project: demoProject, floors: demoFloors, currentFloor };
  }

  const [{ data: project }, { data: floors }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,owner_id,name,address,active,created_at,updated_at,archived_at")
      .eq("id", projectId)
      .eq("active", true)
      .is("archived_at", null)
      .single(),
    supabase
      .from("floors")
      .select("id,project_id,label,sort_order,qr_token,access_code,active")
      .eq("project_id", projectId)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const typedFloors = (floors ?? []) as Floor[];
  const currentFloor = typedFloors.find((floor) => floor.qr_token === floorToken);

  if (!project || !currentFloor || typedFloors.length === 0) {
    const demoFloor = demoFloors.find((floor) => floor.qr_token === floorToken) ?? demoFloors[4];
    return { project: demoProject, floors: demoFloors, currentFloor: demoFloor };
  }

  return {
    project: project as Project,
    floors: typedFloors,
    currentFloor,
  };
}
