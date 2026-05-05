import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { redirect } from "next/navigation";

export default async function SuperadminMetricsPage() {
  await requireSuperAdmin();
  redirect("/admin/metrics");
}
