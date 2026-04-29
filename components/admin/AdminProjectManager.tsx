"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Archive, ArrowRight, Building2, Power, Settings, Trash2 } from "lucide-react";
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

function statusClass(project: Project) {
  if (project.active) return "bg-emerald-400 text-slate-950";
  if (project.archived_at) return "bg-slate-700 text-slate-100";
  return "bg-yellow-300 text-slate-950";
}

export function AdminProjectManager({ projects }: { projects: Project[] }) {
  const [localProjects, setLocalProjects] = useState(projects);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  function projectStatusLabel(project: Project) {
    if (project.active) return t("common.active");
    if (project.archived_at) return t("common.archived");
    return t("common.inactive");
  }

  const activeProject = localProjects.find((project) => project.active);

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
      <div className="glass-panel rounded-[2rem] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-yellow-300/15 text-yellow-200">
              <Building2 />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("project.createSite")}</p>
              <h2 className="text-2xl font-black text-white">{t("project.newElevioProject")}</h2>
              <p className="text-sm font-bold text-slate-400">
                {t("project.createBody")}
              </p>
            </div>
          </div>
          {activeProject && (
            <Link
              href={`/admin/projects/${activeProject.id}`}
              className="touch-target rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white"
            >
              {t("project.continue", { name: activeProject.name })}
              <ArrowRight className="ml-2 inline" size={16} />
            </Link>
          )}
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm font-bold text-slate-100">
            {message}
          </div>
        )}

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
          className="mt-5 grid gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4 lg:grid-cols-[1fr_1fr_auto_auto]"
        >
          <input
            name="name"
            required
            placeholder={t("project.siteNamePlaceholder")}
            className="rounded-2xl border border-white/10 bg-white px-4 py-4 font-bold text-slate-950 outline-none"
          />
          <input
            name="address"
            placeholder={t("project.addressPlaceholder")}
            className="rounded-2xl border border-white/10 bg-white px-4 py-4 font-bold text-slate-950 outline-none"
          />
          <label className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white">
            <input name="active" type="checkbox" defaultChecked className="size-5 accent-yellow-300" />
            {t("project.activateNow")}
          </label>
          <button
            disabled={isPending}
            className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            {t("project.createButton")}
          </button>
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
