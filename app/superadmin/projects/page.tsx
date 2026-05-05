import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { redirect } from "next/navigation";

export default async function SuperadminProjectsPage() {
  await requireSuperAdmin();
  // Projects belong to /admin (client workspace), not /superadmin (platform management)
  redirect("/admin/projects");
}
