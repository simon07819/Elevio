"use client";

import { useState, useTransition } from "react";
import { Hash, Layers3, Pencil, Power, Trash2 } from "lucide-react";
import { createFloor, deleteFloor, generateProjectFloors, toggleFloorActive, updateFloor } from "@/lib/actions";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { floorLabelForSortOrder, formatFloorLabel } from "@/lib/utils";
import type { Floor } from "@/types/hoist";

export function ProjectFloorEditor({ projectId, floors }: { projectId: string; floors: Floor[] }) {
  const [localFloors, setLocalFloors] = useState(floors);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  function runAction(
    action: () => Promise<{ ok: boolean; message: string; floors?: Floor[] }>,
    onSuccess?: (result: { ok: boolean; message: string; floors?: Floor[] }) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) {
        onSuccess?.(result);
      }
    });
  }

  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("floors.step")}</p>
          <h2 className="text-2xl font-black text-white">{t("admin.floorsTitle")}</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {t("setup.floorsBody")}
          </p>
        </div>
        <Hash className="text-slate-400" />
      </div>

      {message && <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div>}

      <form
        action={(formData) => {
          runAction(() => generateProjectFloors(projectId, formData), (result) => {
            if (result.floors) {
              setLocalFloors(result.floors);
            }
          });
        }}
        className="mt-5 rounded-3xl border border-yellow-300/25 bg-yellow-300/10 p-4"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-yellow-300 text-slate-950">
            <Layers3 size={22} />
          </span>
          <div>
            <h3 className="text-xl font-black text-white">{t("floors.bulkTitle")}</h3>
            <p className="text-sm font-bold text-slate-300">{t("floors.bulkExample")}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <input
            name="basementCount"
            type="number"
            min={-50}
            max={0}
            defaultValue={-2}
            className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
            aria-label={t("floors.basementCount")}
          />
          <input
            name="floorCount"
            type="number"
            min={0}
            max={200}
            defaultValue={16}
            className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
            aria-label={t("floors.floorCount")}
          />
          <label className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">
            <input name="includeRdc" type="checkbox" defaultChecked className="size-5 accent-yellow-300" />
            {t("floors.includeRdc")}
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            {t("floors.generate")}
          </button>
        </div>
      </form>

      <form
        action={(formData) => {
          const label = String(formData.get("label") ?? "").trim();
          const sortOrder = Number(formData.get("sortOrder"));
          const active = formData.get("active") === "on";

          runAction(() => createFloor(projectId, formData), () => {
            setLocalFloors((current) => {
              const fallbackLabel = label || floorLabelForSortOrder(sortOrder);
              return [
                ...current,
                {
                  id: `local-floor-${Date.now()}`,
                  project_id: projectId,
                  label: fallbackLabel,
                  sort_order: sortOrder,
                  qr_token: `local-${fallbackLabel.toLowerCase()}`,
                  access_code: `LOCAL${current.length + 1}`.slice(0, 6),
                  active,
                },
              ].sort((a, b) => a.sort_order - b.sort_order);
            });
          });
        }}
        className="mt-5 grid gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4 md:grid-cols-[1fr_120px_auto_auto]"
      >
        <div className="md:col-span-4">
          <p className="text-sm font-black text-white">{t("floors.addSpecial")}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">
            {t("floors.positionHelp")}
          </p>
        </div>
        <input
          name="label"
          placeholder={t("floors.optionalName")}
          className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
        />
        <input
          name="sortOrder"
          required
          type="number"
          step="0.5"
          placeholder={t("floors.positionPlaceholder")}
          className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
        />
        <label className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">
          <input name="active" type="checkbox" defaultChecked className="size-5 accent-yellow-300" />
          {t("floors.active")}
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
        >
          {t("floors.add")}
        </button>
      </form>

      <div className="mt-5 grid gap-3">
        {localFloors.map((floor) => {
          const isEditing = editingId === floor.id;

          return (
            <article key={floor.id} className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-3xl font-black text-white">{formatFloorLabel(floor)}</p>
                    <span className={floor.active ? "rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950" : "rounded-full bg-slate-700 px-3 py-1 text-xs font-black text-slate-100"}>
                      {floor.active ? t("floors.active") : t("floors.disabled")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : floor.id)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
                  >
                    <Pencil className="mr-1 inline" size={14} />
                    {t("floors.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => toggleFloorActive(floor.id, projectId, !floor.active), () =>
                        setLocalFloors((current) =>
                          current.map((item) => (item.id === floor.id ? { ...item, active: !item.active } : item)),
                        ),
                      )
                    }
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white"
                  >
                    <Power className="mr-1 inline" size={14} />
                    {floor.active ? t("floors.disable") : t("floors.enable")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(t("floors.removeConfirm"))) return;
                      runAction(() => deleteFloor(floor.id, projectId), () =>
                        setLocalFloors((current) => current.filter((item) => item.id !== floor.id)),
                      );
                    }}
                    className="touch-target grid size-11 place-items-center rounded-xl bg-red-500/20 text-red-100"
                    aria-label={t("floors.remove")}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {isEditing && (
                <form
                  action={(formData) => {
                    const label = String(formData.get("label") ?? "").trim();
                    const sortOrder = Number(formData.get("sortOrder"));
                    const active = formData.get("active") === "on";

                    runAction(() => updateFloor(floor.id, projectId, formData), () => {
                      const fallbackLabel = label || floorLabelForSortOrder(sortOrder);
                      setLocalFloors((current) =>
                        current
                          .map((item) =>
                            item.id === floor.id ? { ...item, label: fallbackLabel, sort_order: sortOrder, active } : item,
                          )
                          .sort((a, b) => a.sort_order - b.sort_order),
                      );
                      setEditingId(null);
                    });
                  }}
                  className="mt-4 grid gap-3 md:grid-cols-[1fr_120px_auto_auto]"
                >
                  <input
                    name="label"
                    defaultValue={floor.label}
                    placeholder={t("floors.optionalName")}
                    className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
                  />
                  <input
                    name="sortOrder"
                    type="number"
                    step="0.5"
                    defaultValue={floor.sort_order}
                    required
                    className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
                  />
                  <label className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">
                    <input name="active" type="checkbox" defaultChecked={floor.active} className="size-5 accent-yellow-300" />
                    {t("floors.active")}
                  </label>
                  <button type="submit" className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950">
                    {t("profile.save")}
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
