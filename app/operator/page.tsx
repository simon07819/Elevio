import { BrandLogo } from "@/components/BrandLogo";
import { AppNavigation } from "@/components/AppNavigation";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { OperatorWorkspace } from "@/components/operator/OperatorWorkspace";
import { getCurrentProfile, requireUser } from "@/lib/auth";
import { getAdminProjectData } from "@/lib/adminProject";
import { getProjects } from "@/lib/projects";
import type { ActivePassenger, Project } from "@/types/hoist";

function pickOperatorProject(projects: Project[]): Project | undefined {
  if (projects.length === 0) {
    return undefined;
  }

  const open = projects.filter((p) => p.archived_at == null);
  const pool = open.length > 0 ? open : projects;

  return pool.find((p) => p.active) ?? pool[0];
}

export default async function OperatorPage() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const operatorDisplayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || profile?.email || user.email || "";

  const { projects, loadError } = await getProjects();
  const project = pickOperatorProject(projects);
  const data = project ? await getAdminProjectData(project.id) : null;
  const activePassengers: ActivePassenger[] =
    data?.requests
      .filter((request) => request.status === "boarded")
      .map((request) => {
        const from = data.floors.find((floor) => floor.id === request.from_floor_id);
        const to = data.floors.find((floor) => floor.id === request.to_floor_id);

        return {
          requestId: request.id,
          from_floor_id: request.from_floor_id,
          to_floor_id: request.to_floor_id,
          from_sort_order: from?.sort_order ?? 0,
          to_sort_order: to?.sort_order ?? 0,
          passenger_count: request.passenger_count,
          boarded_at: request.updated_at,
        };
      }) ?? [];

  return (
    <main className="relative z-10 min-h-dvh bg-slate-950 px-4 py-4 pb-20 text-white sm:px-6 lg:px-8">
      <header className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/8 px-4 py-3">
        <div>
          <BrandLogo size="sm" priority />
          <h1 className="text-2xl font-black"><T k="operator.title" /></h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AppNavigation compact />
          <LanguageSwitcher />
        </div>
      </header>
      {loadError ? (
        <div className="mx-auto max-w-7xl rounded-3xl border border-red-400/40 bg-red-500/10 p-5 text-red-100">
          <T k="operator.loadProjectsError" values={{ detail: loadError }} />
        </div>
      ) : !project ? (
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/8 p-5 text-white">
          <T k="operator.noProjectAccess" />
        </div>
      ) : data && data.elevators.length > 0 ? (
        <OperatorWorkspace
          project={project}
          floors={data.floors}
          elevators={data.elevators}
          requests={data.requests}
          activePassengers={activePassengers}
          operatorDisplayName={operatorDisplayName}
          hydrationNowMs={Date.now()}
        />
      ) : (
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/8 p-5 text-white">
          <T k="operator.noElevatorsConfigured" />
        </div>
      )}
    </main>
  );
}
