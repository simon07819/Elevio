import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AdminProjectDetail } from "@/components/admin/AdminProjectDetail";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdmin } from "@/lib/auth";
import { getAdminProjectData } from "@/lib/adminProject";

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { user, profile } = await requireAdmin();
  const { projectId } = await params;
  const data = await getAdminProjectData(projectId);

  return (
    <AppShell
      userEmail={user.email}
      userRole={profile.account_role}
      eyebrow={<T k="admin.projectEyebrow" />}
      title={<T k="admin.configureProject" values={{ name: data.project.name }} />}
      subtitle={<T k="admin.projectSubtitle" />}
    >
      <div className="no-print mb-5 flex flex-wrap gap-3">
        <Link href="/admin/projects" className="touch-target rounded-2xl border border-white/15 bg-white/10 px-5 py-3 font-black">
          <T k="admin.backProjects" />
        </Link>
      </div>
      <AdminProjectDetail data={data} />
    </AppShell>
  );
}
