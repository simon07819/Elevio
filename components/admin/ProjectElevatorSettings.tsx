"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Plus, Save, Trash2 } from "lucide-react";
import { createElevator, deleteElevator, updateElevatorSettings } from "@/lib/actions";
import { elevatorDuplicateMessage } from "@/lib/elevatorMessages";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { Elevator } from "@/types/hoist";

type MutationResult = { ok: boolean; message: string; elevator?: Elevator };

export function ProjectElevatorSettings({
  projectId,
  elevators,
}: {
  projectId: string;
  elevators: Elevator[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const createFormRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { t } = useLanguage();

  function runAction(action: () => Promise<MutationResult>, onSuccess?: (result: MutationResult) => void) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) {
        onSuccess?.(result);
        router.refresh();
      }
    });
  }

  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("elevator.capacityEyebrow")}</p>
          <h2 className="text-2xl font-black text-white">{t("elevator.title")}</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {t("elevator.body")}
          </p>
        </div>
        <Gauge className="text-slate-400" />
      </div>

      {message && (
        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-100">
          {message === elevatorDuplicateMessage ? t("elevator.duplicateName") : message}
        </div>
      )}

      <div className="mt-5 grid gap-4">
        {elevators.map((elevator) => (
          <form
            key={elevator.id}
            action={(formData) => {
              runAction(() => updateElevatorSettings(elevator.id, projectId, formData));
            }}
            className="rounded-3xl border border-white/10 bg-white/8 p-4"
          >
            <div className="mb-3">
              <p className="text-xl font-black text-white">{elevator.name}</p>
              <p className="text-sm font-bold text-slate-400">
                {t("elevator.summary", { capacity: elevator.capacity, load: elevator.current_load })}
              </p>
            </div>
            <p className={elevator.operator_session_id ? "mb-3 rounded-2xl bg-emerald-400/15 px-3 py-2 text-xs font-black text-emerald-100" : "mb-3 rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-slate-300"}>
              {elevator.operator_session_id ? t("elevator.tabletActive") : t("elevator.tabletInactive")}
            </p>
            <div className="grid gap-3 lg:grid-cols-[1fr_160px_auto_auto]">
              <ElevatorFields elevator={elevator} />
              <button
                disabled={isPending}
                className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
              >
                <Save className="mr-2 inline" size={18} />
                {t("elevator.save")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!window.confirm(t("elevator.deleteConfirm"))) return;
                  runAction(() => deleteElevator(elevator.id, projectId));
                }}
                className="touch-target grid size-11 place-items-center rounded-2xl border border-red-400/40 bg-red-500/15 text-red-100 disabled:opacity-60"
                aria-label={t("elevator.delete")}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </form>
        ))}
      </div>

      <div className="mt-8 border-t border-white/10 pt-6">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("elevator.addAnother")}</p>
        <form
          ref={createFormRef}
          action={(formData) => {
            runAction(() => createElevator(projectId, formData), (result) => {
              if (result.elevator) {
                createFormRef.current?.reset();
              }
            });
          }}
          className="mt-4 grid gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4 lg:grid-cols-[1fr_160px_auto]"
        >
          <ElevatorFields />
          <button
            disabled={isPending}
            className="touch-target rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            <Plus className="mr-2 inline" size={18} />
            {t("elevator.create")}
          </button>
        </form>
      </div>
    </section>
  );
}

function ElevatorFields({ elevator }: { elevator?: Elevator }) {
  const { t } = useLanguage();

  return (
    <>
      <input
        name="name"
        defaultValue={elevator?.name}
        required
        placeholder={t("elevator.namePlaceholder")}
        className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
      />
      <input
        name="capacity"
        type="number"
        min={1}
        defaultValue={elevator?.capacity ?? 8}
        required
        className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
        aria-label={t("elevator.capacityLabel")}
      />
    </>
  );
}
