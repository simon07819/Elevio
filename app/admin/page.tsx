import { AppShell } from "@/components/AppShell";
import { AdminProjectManager } from "@/components/admin/AdminProjectManager";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdmin } from "@/lib/auth";
import { getProjects } from "@/lib/projects";

export default async function AdminPage() {
  const { user, profile } = await requireAdmin();
  const { projects, loadError, qrReadyProjectIds } = await getProjects();

  return (
    <AppShell
      eyebrow={<T k="admin.eyebrow" />}
      title={<T k="admin.dashboardTitle" />}
      subtitle={<T k="admin.dashboardSubtitle" />}
      userEmail={user.email}
      userRole={profile.account_role}
    >
      <div className="grid gap-5">
        <AdminProjectManager projects={projects} projectsLoadError={loadError} qrReadyProjectIds={qrReadyProjectIds} />
      </div>
    </AppShell>
  );
}
