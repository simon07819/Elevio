import { AppShell } from "@/components/AppShell";
import { QRCodeGenerator } from "@/components/admin/QRCodeGenerator";
import { T } from "@/components/i18n/LanguageProvider";
import { requireUser } from "@/lib/auth";
import { getAdminProjectData } from "@/lib/adminProject";
import { getProjects } from "@/lib/projects";

export default async function AdminQRCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  await requireUser();
  const { projectId } = await searchParams;
  const { projects } = await getProjects();
  const selectedProject = projects.find((project) => project.id === projectId) ?? projects.find((project) => project.active) ?? projects[0];
  const data = selectedProject ? await getAdminProjectData(selectedProject.id) : null;

  return (
    <AppShell
      eyebrow={<T k="admin.eyebrow" />}
      title={<T k="qr.title" />}
      subtitle={<T k="qr.pageSubtitle" />}
      noPrintTitleSection
    >
      {data ? (
        <div className="w-full min-w-0 max-w-full overflow-x-clip">
          <QRCodeGenerator
            project={data.project}
            floors={data.floors.filter((floor) => floor.active)}
            companyLogoUrl={data.branding.company_logo_url}
            projectLogoUrl={data.project.logo_url ?? data.branding.project_logo_url}
          />
        </div>
      ) : (
        <div className="glass-panel rounded-[2rem] p-5 text-white"><T k="admin.createProjectFirst" /></div>
      )}
    </AppShell>
  );
}
