import { AppShell } from "@/components/AppShell";
import { StatsDashboard } from "@/components/admin/StatsDashboard";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdmin } from "@/lib/auth";
import { getProjectAnalytics } from "@/lib/analytics";
import { getProjects } from "@/lib/projects";

export default async function AdminStatsPage() {
  const { user, profile } = await requireAdmin();
  const { projects } = await getProjects();
  const project = projects.find((p) => p.active) ?? projects[0];
  const analytics = project
    ? await getProjectAnalytics(project.id, 7)
    : await getProjectAnalytics("00000000-0000-0000-0000-000000000000", 7);

  return (
    <AppShell userEmail={user.email} userRole={profile.account_role} eyebrow={<T k="admin.eyebrow" />} title={<T k="admin.statsTitle" />} subtitle={<T k="admin.statsSubtitle" />}>
      <StatsDashboard analytics={analytics} />
    </AppShell>
  );
}
