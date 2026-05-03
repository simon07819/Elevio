import { BrandLogo } from "@/components/BrandLogo";
import { AppNavigation } from "@/components/AppNavigation";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { OperatorWorkspace } from "@/components/operator/OperatorWorkspace";
import { getCurrentProfile, requireOperator } from "@/lib/auth";
import { getAdminProjectData } from "@/lib/adminProject";
import { getProjects } from "@/lib/projects";
import type { Project } from "@/types/hoist";

function pickOperatorProject(projects: Project[]): Project | undefined {
  if (projects.length === 0) {
    return undefined;
  }

  const open = projects.filter((p) => p.archived_at == null);
  const pool = open.length > 0 ? open : projects;

  return pool.find((p) => p.active) ?? pool[0];
}

export default async function OperatorPage() {
  const { user, profile } = await requireOperator();
  const operatorDisplayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || profile?.email || user.email || "";

  const { projects, loadError } = await getProjects();
  const project = pickOperatorProject(projects);
  const data = project ? await getAdminProjectData(project.id) : null;

  return (
    <main className="relative z-10 flex min-h-dvh flex-col bg-slate-950 px-4 pt-2 pb-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl flex-1 pb-3">
        {loadError ? (
          <div className="rounded-3xl border border-red-400/40 bg-red-500/10 p-5 text-red-100">
            <T k="operator.loadProjectsError" values={{ detail: loadError }} />
          </div>
        ) : !project ? (
          <div className="rounded-3xl border border-white/10 bg-white/8 p-5 text-white">
            <T k="operator.noProjectAccess" />
          </div>
        ) : data && data.elevators.length > 0 ? (
          <OperatorWorkspace
            project={project}
            floors={data.floors}
            elevators={data.elevators}
            requests={data.requests}
            operatorDisplayName={operatorDisplayName}
            hydrationNowMs={0}
          />
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/8 p-5 text-white">
            <T k="operator.noElevatorsConfigured" />
          </div>
        )}
      </div>
      <footer className="mx-auto mt-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/8 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div>
          <BrandLogo size="sm" priority />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AppNavigation compact />
          <LanguageSwitcher />
        </div>
      </footer>
    </main>
  );
}
