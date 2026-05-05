import { BrandLogo } from "@/components/BrandLogo";
import { AppNavigation } from "@/components/AppNavigation";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { OperatorWorkspace } from "@/components/operator/OperatorWorkspace";
import { requireOperator } from "@/lib/auth";
import { getAdminProjectData } from "@/lib/adminProject";
import { getProjects } from "@/lib/projects";
import { isProjectConfigured } from "@/lib/projectConfig";
import { isSuperAdmin } from "@/lib/auth/superadmin";
import { ShieldAlert } from "lucide-react";
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
  const showSuperadmin = isSuperAdmin(profile, user.email);
  const operatorDisplayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || profile?.email || user.email || "";

  const { projects, loadError } = await getProjects();
  const project = pickOperatorProject(projects);
  const data = project ? await getAdminProjectData(project.id, { activeRequestsOnly: true }) : null;

  const configured = project ? isProjectConfigured(project, data?.floors.length ?? 0, data?.elevators.length ?? 0) : false;

  return (
    <main className="relative z-10 flex min-h-dvh flex-col bg-slate-950 px-4 pt-2 pb-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl flex-1 pb-3">
        {!configured ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <ShieldAlert className="size-16 text-amber-400" />
            <h2 className="text-2xl font-black"><T k="project.configRequired" /></h2>
            <p className="max-w-md text-center text-sm font-bold text-slate-300"><T k="project.configRequiredBody" /></p>
          </div>
        ) : loadError ? (
          <div className="rounded-3xl border border-red-400/40 bg-red-500/10 p-5 text-red-100">
            <T k="operator.loadProjectsError" values={{ detail: loadError }} />
          </div>
        ) : (
          <OperatorWorkspace
            project={project!}
            floors={data!.floors}
            elevators={data!.elevators}
            requests={data!.requests}
            operatorDisplayName={operatorDisplayName}
            hydrationNowMs={0}
          />
        )}
      </div>
      <footer className="mx-auto mt-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/8 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div>
          <BrandLogo size="sm" priority clickable />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AppNavigation compact showSuperadmin={showSuperadmin} />
          <LanguageSwitcher />
        </div>
      </footer>
    </main>
  );
}
