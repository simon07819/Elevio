import { AppShell } from "@/components/AppShell";
import { AdminProjectManager } from "@/components/admin/AdminProjectManager";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdminWithPlan } from "@/lib/auth";
import { getProjects } from "@/lib/projects";

export default async function AdminProjectsPage() {
  const { user, profile, isFree } = await requireAdminWithPlan();

  if (isFree) {
    return (
      <AppShell userEmail={user.email} userRole={profile.account_role} eyebrow={<T k="admin.eyebrow" />} title={<T k="admin.projectsTitle" />} subtitle={<T k="admin.projectsSubtitle" />}>
        <UpgradePrompt feature="La création et la gestion de projets/chantiers" />
      </AppShell>
    );
  }

  const { projects, loadError, qrReadyProjectIds } = await getProjects();

  return (
    <AppShell userEmail={user.email} userRole={profile.account_role} eyebrow={<T k="admin.eyebrow" />} title={<T k="admin.projectsTitle" />} subtitle={<T k="admin.projectsSubtitle" />}>
      <AdminProjectManager projects={projects} projectsLoadError={loadError} qrReadyProjectIds={qrReadyProjectIds} />
    </AppShell>
  );
}
