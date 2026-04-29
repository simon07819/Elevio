import { AppShell } from "@/components/AppShell";
import { StatsDashboard } from "@/components/admin/StatsDashboard";
import { T } from "@/components/i18n/LanguageProvider";
import { requireUser } from "@/lib/auth";

export default async function AdminStatsPage() {
  await requireUser();

  return (
    <AppShell eyebrow={<T k="admin.eyebrow" />} title={<T k="admin.statsTitle" />} subtitle={<T k="admin.statsSubtitle" />}>
      <StatsDashboard />
    </AppShell>
  );
}
