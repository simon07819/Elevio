import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { redirect } from "next/navigation";

export default async function SuperadminSupportPage() {
  await requireSuperAdmin();
  redirect("/superadmin/content");
}
