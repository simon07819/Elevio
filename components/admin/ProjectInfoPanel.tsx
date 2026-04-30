"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { updateProject } from "@/lib/actions";
import { DEFAULT_PROJECT_TIMEZONE } from "@/lib/operatorDispatchAvailability";
import { PROJECT_TIMEZONE_OPTIONS } from "@/lib/projectTimezoneOptions";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { Project } from "@/types/hoist";

export function ProjectInfoPanel({ project }: { project: Project }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  const tz = project.service_timezone ?? DEFAULT_PROJECT_TIMEZONE;
  const tzInPresetList = PROJECT_TIMEZONE_OPTIONS.some((o) => o.value === tz);

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

      <form action={(formData) => runAction(() => updateProject(project.id, formData))} className="mt-6 grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-black text-slate-200">
            {t("project.siteNamePlaceholder")}
            <input
              name="name"
              defaultValue={project.name}
              required
              className="rounded-2xl border border-white/10 bg-white px-4 py-3.5 font-bold text-slate-950 outline-none ring-yellow-300/0 transition-shadow focus-visible:ring-2 focus-visible:ring-yellow-300/50"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-200">
            {t("project.addressPlaceholder")}
            <input
              name="address"
              defaultValue={project.address}
              className="rounded-2xl border border-white/10 bg-white px-4 py-3.5 font-bold text-slate-950 outline-none ring-yellow-300/0 transition-shadow focus-visible:ring-2 focus-visible:ring-yellow-300/50"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
          <label htmlFor={`serviceTimezone-${project.id}`} className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            {t("project.serviceTimezoneLabel")}
          </label>
          <select
            id={`serviceTimezone-${project.id}`}
            name="serviceTimezone"
            defaultValue={tz}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white px-4 py-3.5 font-bold text-slate-950 outline-none"
          >
            {!tzInPresetList ? (
              <option value={tz}>{tz}</option>
            ) : null}
            {PROJECT_TIMEZONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey as TranslationKey)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs font-bold text-slate-500">{t("project.serviceTimezoneHelp")}</p>
        </div>

        <fieldset className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
          <legend className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">{t("project.dispatchOptionsHeading")}</legend>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-transparent p-1 transition-colors hover:border-white/10 hover:bg-white/[0.03]">
            <input
              type="checkbox"
              name="prioritiesEnabled"
              value="on"
              defaultChecked={project.priorities_enabled !== false}
              className="size-5 shrink-0 accent-yellow-300"
            />
            <span className="text-sm font-black text-white">{t("project.prioritiesEnabledLabel")}</span>
          </label>
        </fieldset>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-2 sm:flex-row sm:justify-end sm:pt-0">
          <button
            type="submit"
            disabled={isPending}
            className="touch-target inline-flex items-center justify-center rounded-2xl bg-yellow-300 px-8 py-4 text-base font-black text-slate-950 shadow-lg shadow-yellow-950/20 transition hover:bg-yellow-200 disabled:opacity-60 sm:min-w-[12rem]"
          >
            <Save className="mr-2 shrink-0" size={18} />
            {t("profile.save")}
          </button>
        </div>
      </form>
    </section>
  );
}
