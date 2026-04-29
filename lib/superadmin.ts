import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/profile";
import type { Project } from "@/types/hoist";

export type SuperadminData = {
  profiles: Profile[];
  projects: Project[];
};

export async function getSuperadminData(): Promise<SuperadminData> {
  const supabase = await createClient();

  if (!supabase) {
    return { profiles: [], projects: [] };
  }

  const [{ data: profiles }, { data: projects }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,first_name,last_name,company,phone,account_role,created_at,updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id,owner_id,name,address,active,created_at,updated_at,archived_at,service_timezone")
      .order("created_at", { ascending: false }),
  ]);

  return {
    profiles: (profiles ?? []) as Profile[],
    projects: (projects ?? []) as Project[],
  };
}
