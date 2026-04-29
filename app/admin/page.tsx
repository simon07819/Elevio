import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AdminProjectManager } from "@/components/admin/AdminProjectManager";
import { T } from "@/components/i18n/LanguageProvider";
import { getCurrentProfile, requireUser } from "@/lib/auth";
import { getProjects } from "@/lib/projects";

export default async function AdminPage() {
  await requireUser();
  const profile = await getCurrentProfile();
  const projects = await getProjects();

  return (
    <AppShell
      eyebrow={<T k="admin.eyebrow" />}
      title={<T k="admin.dashboardTitle" />}
      subtitle={<T k="admin.dashboardSubtitle" />}
    >
      {profile?.account_role === "superadmin" && (
        <div className="no-print mb-5">
          <Link href="/superadmin" className="touch-target inline-flex rounded-2xl border border-yellow-300/50 bg-yellow-300 px-5 py-3 font-black text-slate-950">
            <T k="nav.superadmin" />
          </Link>
        </div>
      )}
      <div className="grid gap-5">
        <AdminProjectManager projects={projects} />
      </div>
    </AppShell>
  );
}
