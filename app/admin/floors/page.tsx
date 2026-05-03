import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProjectFloorEditor } from "@/components/admin/ProjectFloorEditor";
import { T } from "@/components/i18n/LanguageProvider";
import { requireAdmin } from "@/lib/auth";
import { getAdminProjectData } from "@/lib/adminProject";
import { getProjects } from "@/lib/projects";

export default async function AdminFloorsPage() {
  await requireAdmin();
  const { projects } = await getProjects();
  const project = projects.find((item) => item.active) ?? projects[0];
  const data = project ? await getAdminProjectData(project.id) : null;

  return (
    <AppShell eyebrow={<T k="admin.eyebrow" />} title={<T k="admin.floorsTitle" />} subtitle={<T k="admin.floorsSubtitle" />}>
      {project ? (
        <div className="grid gap-4">
          <div className="glass-panel rounded-[2rem] p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200"><T k="admin.activeProject" /></p>
            <h2 className="text-2xl font-black text-white">{project.name}</h2>
            <Link
              href={`/admin/projects/${project.id}`}
              className="mt-4 inline-flex rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950"
            >
              <T k="admin.configureWholeProject" />
            </Link>
          </div>
          <ProjectFloorEditor projectId={project.id} floors={data?.floors ?? []} />
        </div>
      ) : (
        <div className="glass-panel rounded-[2rem] p-5 text-white"><T k="admin.createProjectFirst" /></div>
      )}
    </AppShell>
  );
}
