import { AppShell } from "@/components/AppShell";
import { AdminProjectManager } from "@/components/admin/AdminProjectManager";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdminWithPlan } from "@/lib/auth";
import { getProjects } from "@/lib/projects";

export default async function AdminPage() {
  const { user, profile, isFree } = await requireAdminWithPlan();

  if (isFree) {
    return (
      <AppShell
        eyebrow={<T k="admin.eyebrow" />}
        title={<T k="admin.dashboardTitle" />}
        subtitle={<T k="admin.dashboardSubtitle" />}
        userEmail={user.email}
        userRole={profile.account_role}
      >
        <div className="grid gap-5">
          <UpgradePrompt feature="La gestion de projets et le dispatch en temps réel" />
        </div>
      </AppShell>
    );
  }

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
