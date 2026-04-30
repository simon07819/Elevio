"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Archive, Building2, Power, QrCode, Settings, Trash2 } from "lucide-react";
import {
  activateProject,
  archiveProject,
  createProject,
  deleteProject,
} from "@/lib/actions";
import type { Project } from "@/types/hoist";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type ProjectActionResult = {
  ok: boolean;
  message: string;
  project?: Project;
};

const PRIORITIES_ENABLED_MIGRATION_SQL =
  "alter table projects add column if not exists priorities_enabled boolean not null default true;";

function statusClass(project: Project) {
  if (project.active) return "bg-emerald-400 text-slate-950";
  if (project.archived_at) return "bg-slate-700 text-slate-100";
  return "bg-yellow-300 text-slate-950";
}

export function AdminProjectManager({
  projects,
  projectsLoadError,
  qrReadyProjectIds = [],
}: {
  projects: Project[];
  projectsLoadError?: string | null;
  qrReadyProjectIds?: string[];
}) {
  const [localProjects, setLocalProjects] = useState(projects);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  useEffect(() => {
    const id = window.setTimeout(() => setLocalProjects(projects), 0);
    return () => window.clearTimeout(id);
  }, [projects]);

  function projectStatusLabel(project: Project) {
    if (project.active) return t("common.active");
    if (project.archived_at) return t("common.archived");
    return t("common.inactive");
  }

  function runAction(action: () => Promise<ProjectActionResult>, onSuccess?: (result: ProjectActionResult) => void) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) {
        onSuccess?.(result);
      }
    });
  }

  return (
    <section className="grid gap-5">
      {projectsLoadError ? (
        <div className="rounded-[2rem] border border-red-400/35 bg-red-500/10 px-5 py-4 sm:px-6">
          <p className="text-sm font-black text-red-100">{t("admin.projectsLoadErrorTitle")}</p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-red-200/85">{projectsLoadError}</p>
          {projectsLoadError.includes("priorities_enabled") ? (
            <div className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-950/50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">{t("admin.projectsLoadErrorPrioritiesTitle")}</p>
              <p className="mt-2 text-sm font-bold text-emerald-100/95">{t("admin.projectsLoadErrorPrioritiesSteps")}</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/80 p-3 text-left text-xs leading-snug text-emerald-50">
                <code>{PRIORITIES_ENABLED_MIGRATION_SQL}</code>
              </pre>
              <p className="mt-2 text-xs font-semibold text-emerald-200/80">{t("admin.projectsLoadErrorPrioritiesFileHint")}</p>
            </div>
          ) : null}
          <p className="mt-3 text-xs font-bold text-red-200/70">{t("admin.projectsLoadErrorHint")}</p>
        </div>
      ) : null}

      <div className="glass-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-yellow-300/15 text-yellow-200 ring-1 ring-inset ring-yellow-300/25">
              <Building2 aria-hidden className="size-7" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("project.createSite")}</p>
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-[1.65rem]">{t("project.newElevioProject")}</h2>
              <p className="max-w-2xl text-sm font-bold leading-relaxed text-slate-400">{t("project.createBody")}</p>
            </div>
          </div>
        </div>

        <form
          action={(formData) => {
            const name = String(formData.get("name") ?? "").trim();
            const address = String(formData.get("address") ?? "").trim();
            const active = formData.get("active") === "on";

            runAction(() => createProject(formData), (result) => {
              const now = new Date().toISOString();
              const createdProject =
                result.project ?? {
                  id: `demo-project-${Date.now()}`,
                  name,
                  address,
                  active,
                  priorities_enabled: true,
                  logo_url: null,
                  created_at: now,
                  updated_at: now,
                  archived_at: null,
                };

              setLocalProjects((current) => [
                createdProject,
                ...current.map((project) => (createdProject.active ? { ...project, active: false } : project)),
              ]);
            });
          }}
          className="grid gap-6 px-5 py-6 sm:px-8 sm:py-8"
        >
          {message ? (
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-slate-100">
              {message}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-slate-200">
              {t("project.siteNamePlaceholder")}
              <input
                name="name"
                required
                autoComplete="organization"
                className="rounded-2xl border border-white/10 bg-white px-4 py-3.5 font-bold text-slate-950 outline-none ring-yellow-300/0 transition-shadow focus-visible:ring-2 focus-visible:ring-yellow-300/50"
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-200">
              {t("project.addressPlaceholder")}
              <input
                name="address"
                autoComplete="street-address"
                className="rounded-2xl border border-white/10 bg-white px-4 py-3.5 font-bold text-slate-950 outline-none ring-yellow-300/0 transition-shadow focus-visible:ring-2 focus-visible:ring-yellow-300/50"
              />
            </label>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 pt-5 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-black text-white lg:shrink-0">
              <input
                name="prioritiesEnabled"
                type="checkbox"
                value="on"
                defaultChecked
                className="size-5 shrink-0 accent-yellow-300"
              />
              {t("project.prioritiesEnabledLabel")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-black text-white lg:shrink-0">
              <input name="active" type="checkbox" defaultChecked className="size-5 shrink-0 accent-yellow-300" />
              {t("project.activateNow")}
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="touch-target rounded-2xl bg-yellow-300 px-6 py-3.5 text-base font-black text-slate-950 shadow-lg shadow-yellow-950/20 transition hover:bg-yellow-200 disabled:opacity-60 lg:ml-4 lg:min-w-[14rem]"
            >
              {t("project.createButton")}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel rounded-[2rem] p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("admin.projects")}</p>
          <h2 className="text-2xl font-black text-white">{t("project.existing")}</h2>
          <p className="text-sm font-bold text-slate-400">{t("project.existingBody")}</p>
        </div>

        <div className="mt-5 grid gap-3">
        {localProjects.map((project) => {
          return (
            <article key={project.id} className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black text-white">{project.name}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(project)}`}>
                      {projectStatusLabel(project)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-300">{project.address || t("admin.noAddress")}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="rounded-xl bg-yellow-300 px-4 py-3 text-sm font-black !text-slate-950 visited:!text-slate-950 hover:!text-slate-950"
                  >
                    <Settings className="mr-1 inline" size={14} />
                    {t("project.configureFloors")}
                  </Link>
                  {qrReadyProjectIds.includes(project.id) ? (
                    <Link
                      href={`/admin/qrcodes?projectId=${project.id}`}
                      className="rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-3 text-sm font-black text-cyan-50 hover:bg-cyan-500/25"
                    >
                      <QrCode className="mr-1 inline" size={14} />
                      {t("project.listPrintQr")}
                    </Link>
                  ) : null}
                  {!project.active && (
                    <button
                      type="button"
                      onClick={() =>
                        runAction(() => activateProject(project.id), () =>
                          setLocalProjects((current) =>
                            current.map((item) => ({
                              ...item,
                              active: item.id === project.id,
                              archived_at: item.id === project.id ? null : item.archived_at,
                            })),
                          ),
                        )
                      }
                      className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950"
                    >
                      <Power className="mr-1 inline" size={14} />
                      {t("admin.activate")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => archiveProject(project.id), () =>
                        setLocalProjects((current) =>
                          current.map((item) =>
                            item.id === project.id
                              ? { ...item, active: false, archived_at: new Date().toISOString() }
                              : item,
                          ),
                        ),
                      )
                    }
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
                  >
                    <Archive className="mr-1 inline" size={14} />
                    {t("admin.archive")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(t("project.deleteConfirm"))) return;
                      runAction(() => deleteProject(project.id), () =>
                        setLocalProjects((current) => current.filter((item) => item.id !== project.id)),
                      );
                    }}
                    className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-black text-red-100"
                  >
                    <Trash2 className="mr-1 inline" size={14} />
                    {t("admin.delete")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
          {localProjects.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/20 p-6 text-center text-sm font-bold text-slate-400">
              {t("project.empty")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
