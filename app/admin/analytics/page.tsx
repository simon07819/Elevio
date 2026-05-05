import { AppShell } from "@/components/AppShell";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdmin } from "@/lib/auth";
import { getProjectAnalytics } from "@/lib/analytics";
import { getProjects } from "@/lib/projects";
import { getPlanForUser } from "@/lib/billing/planGuards";
import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const { user, profile } = await requireAdmin();
  const { projects } = await getProjects();
  const project = projects.find((p) => p.active) ?? projects[0];
  const analytics = project
    ? await getProjectAnalytics(project.id, 7)
    : undefined;
  const planId = await getPlanForUser(user.id);

  return (
    <AppShell userEmail={user.email} userRole={profile.account_role} eyebrow={<T k="admin.eyebrow" />} title={<T k="analytics.title" />} subtitle={<T k="analytics.subtitle" />}>
      <AdminAnalyticsDashboard analytics={analytics} projectName={project?.name} planId={planId} />
    </AppShell>
  );
}
