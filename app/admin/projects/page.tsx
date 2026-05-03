import { AppShell } from "@/components/AppShell";
import { AdminProjectManager } from "@/components/admin/AdminProjectManager";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdmin } from "@/lib/auth";
import { getProjects } from "@/lib/projects";

export default async function AdminProjectsPage() {
  await requireAdmin();
  const { projects, loadError, qrReadyProjectIds } = await getProjects();

  return (
    <AppShell eyebrow={<T k="admin.eyebrow" />} title={<T k="admin.projectsTitle" />} subtitle={<T k="admin.projectsSubtitle" />}>
      <AdminProjectManager projects={projects} projectsLoadError={loadError} qrReadyProjectIds={qrReadyProjectIds} />
    </AppShell>
  );
}
