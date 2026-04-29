"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Plus, Save, Trash2 } from "lucide-react";
import { createElevator, deleteElevator, updateElevatorSettings } from "@/lib/actions";
import { elevatorDuplicateMessage } from "@/lib/elevatorMessages";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { ServiceTimePicker } from "@/components/ServiceTimePicker";
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
  const [createFormKey, setCreateFormKey] = useState(0);
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
            <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
              <ElevatorFields elevator={elevator} />
              <div className="flex flex-wrap items-center gap-2">
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
                  className="touch-target grid size-12 place-items-center rounded-2xl border border-red-400/40 bg-red-500/15 text-red-100 disabled:opacity-60"
                  aria-label={t("elevator.delete")}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </form>
        ))}
      </div>

      <div className="mt-8 border-t border-white/10 pt-6">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("elevator.addAnother")}</p>
        <form
          key={createFormKey}
          ref={createFormRef}
          action={(formData) => {
            runAction(() => createElevator(projectId, formData), (result) => {
              if (result.elevator) {
                createFormRef.current?.reset();
                setCreateFormKey((k) => k + 1);
              }
            });
          }}
          className="mt-4 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/50 p-4"
        >
          <ElevatorFields />
          <button
            disabled={isPending}
            className="touch-target w-full rounded-2xl bg-yellow-300 px-5 py-3 font-black text-slate-950 disabled:opacity-60 sm:w-auto"
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
    <div className="flex flex-col gap-4">
      <input
        name="name"
        defaultValue={elevator?.name}
        required
        placeholder={t("elevator.namePlaceholder")}
        className="min-h-11 w-full min-w-0 rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 outline-none"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-start lg:justify-items-start">
        <div className="flex w-full max-w-full flex-col items-start gap-1.5 sm:max-w-[12rem]">
          <label htmlFor={elevator ? `elev-cap-${elevator.id}` : "elev-cap-create"} className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
            {t("elevator.capacityLabel")}
          </label>
          <input
            id={elevator ? `elev-cap-${elevator.id}` : "elev-cap-create"}
            name="capacity"
            type="number"
            min={1}
            defaultValue={elevator?.capacity ?? 8}
            required
            className="min-h-11 w-full max-w-[6.5rem] rounded-2xl bg-white px-3 py-3 text-center text-base font-black tabular-nums text-slate-950 outline-none"
          />
        </div>
        {elevator ? (
          <>
            <div className="flex w-full max-w-full flex-col items-start gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                {t("elevator.serviceStartLabel")}
              </span>
              <ServiceTimePicker
                key={`${elevator.id}-serviceStart-${elevator.service_start_time ?? ""}`}
                name="serviceStart"
                defaultTime={elevator.service_start_time ?? "07:00:00"}
                ariaLabel={t("elevator.serviceStartLabel")}
              />
            </div>
            <div className="flex w-full max-w-full flex-col items-start gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                {t("elevator.serviceEndLabel")}
              </span>
              <ServiceTimePicker
                key={`${elevator.id}-serviceEnd-${elevator.service_end_time ?? ""}`}
                name="serviceEnd"
                defaultTime={elevator.service_end_time ?? "15:00:00"}
                ariaLabel={t("elevator.serviceEndLabel")}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
