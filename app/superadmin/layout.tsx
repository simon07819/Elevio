import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { redirect } from "next/navigation";
import { SuperadminShell } from "@/components/superadmin/SuperadminShell";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/admin/login");
  }

  return <SuperadminShell>{children}</SuperadminShell>;
}
