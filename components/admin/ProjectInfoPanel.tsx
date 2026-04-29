"use client";

import { useState, useTransition } from "react";
import { Archive, Power, Save } from "lucide-react";
import { activateProject, archiveProject, updateProject } from "@/lib/actions";
import { DEFAULT_PROJECT_TIMEZONE } from "@/lib/operatorDispatchAvailability";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { Project } from "@/types/hoist";

export function ProjectInfoPanel({ project }: { project: Project }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  function runAction(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
    });
  }

  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("project.info")}</p>
          <h2 className="text-3xl font-black text-white">{project.name}</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {t("project.infoBody")}
          </p>
        </div>
        <span className={project.active ? "rounded-full bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950" : "rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white"}>
          {project.active ? t("common.active") : project.archived_at ? t("common.archived") : t("common.inactive")}
        </span>
      </div>

      {message && <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div>}

      <form
        action={(formData) => runAction(() => updateProject(project.id, formData))}
        className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]"
      >
        <input
          name="name"
          defaultValue={project.name}
          required
          className="rounded-2xl border border-white/10 bg-white px-4 py-3 font-bold text-slate-950 outline-none"
        />
        <input
          name="address"
          defaultValue={project.address}
          placeholder={t("project.addressPlaceholder")}
          className="rounded-2xl border border-white/10 bg-white px-4 py-3 font-bold text-slate-950 outline-none"
        />
        <button
          disabled={isPending}
          className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
        >
          <Save className="mr-2 inline" size={18} />
          {t("profile.save")}
        </button>
        <div className="lg:col-span-3">
          <label className="block text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            {t("project.serviceTimezoneLabel")}
          </label>
          <input
            name="serviceTimezone"
            defaultValue={project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE}
            placeholder={t("project.serviceTimezonePlaceholder")}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white px-4 py-3 font-bold text-slate-950 outline-none"
          />
          <p className="mt-1 text-xs font-bold text-slate-500">{t("project.serviceTimezoneHelp")}</p>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {!project.active && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => activateProject(project.id))}
            className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            <Power className="mr-2 inline" size={16} />
            {t("project.activateThis")}
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => runAction(() => archiveProject(project.id))}
          className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          <Archive className="mr-2 inline" size={16} />
          {t("project.archiveThis")}
        </button>
      </div>
    </section>
  );
}
