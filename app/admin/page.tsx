import { AppShell } from "@/components/AppShell";
import { AdminProjectManager } from "@/components/admin/AdminProjectManager";
import { T } from "@/components/i18n/LanguageProvider";
import { requireUser } from "@/lib/auth";
import { getProjects } from "@/lib/projects";

export default async function AdminPage() {
  await requireUser();
  const { projects, loadError, qrReadyProjectIds } = await getProjects();

  return (
    <AppShell
      eyebrow={<T k="admin.eyebrow" />}
      title={<T k="admin.dashboardTitle" />}
      subtitle={<T k="admin.dashboardSubtitle" />}
    >
      <div className="grid gap-5">
        <AdminProjectManager projects={projects} projectsLoadError={loadError} qrReadyProjectIds={qrReadyProjectIds} />
      </div>
    </AppShell>
  );
}
