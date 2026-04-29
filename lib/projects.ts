import { demoProjects } from "@/lib/demoData";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/hoist";

export async function getProjects(): Promise<Project[]> {
  const supabase = await createClient();

  if (!supabase) {
    return demoProjects;
  }

  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,logo_url,service_timezone")
    .eq("owner_id", user.id)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as Project[];
}
