"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Plus, Save, TabletSmartphone, Trash2 } from "lucide-react";
import { adminDeactivateOperatorTablet, createElevator, deleteElevator, updateElevatorSettings } from "@/lib/actions";
import { elevatorDuplicateMessage } from "@/lib/elevatorMessages";
import { elevatorHasOperatorTabletBinding, elevatorOperatorSessionAppearsLive } from "@/lib/operatorTablet";
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
            <p
              className={
                elevatorOperatorSessionAppearsLive(elevator)
                  ? "mb-3 rounded-2xl bg-emerald-400/15 px-3 py-2 text-xs font-black text-emerald-100"
                  : elevatorHasOperatorTabletBinding(elevator)
                    ? "mb-3 rounded-2xl bg-amber-500/15 px-3 py-2 text-xs font-black text-amber-100"
                    : "mb-3 rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-slate-300"
              }
            >
              {elevatorOperatorSessionAppearsLive(elevator)
                ? t("elevator.tabletActive")
                : elevatorHasOperatorTabletBinding(elevator)
                  ? t("elevator.tabletStaleBinding")
                  : t("elevator.tabletInactive")}
            </p>
            {elevatorHasOperatorTabletBinding(elevator) ? (
              <div className="mb-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm(t("elevator.deactivateTabletConfirm"))) return;
                    runAction(() => adminDeactivateOperatorTablet(projectId, elevator.id));
                  }}
                  className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-black text-amber-100 sm:w-auto"
                >
                  <TabletSmartphone size={18} />
                  {elevatorOperatorSessionAppearsLive(elevator)
                    ? t("elevator.deactivateTablet")
                    : t("elevator.clearTabletSession")}
                </button>
              </div>
            ) : null}
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

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTE_QUARTER_OPTIONS = ["00", "15", "30", "45"];

function snapMinuteToQuarter(totalMinuteValue: number): string {
  const clamped = Math.min(59, Math.max(0, totalMinuteValue));
  const quarters = [0, 15, 30, 45];
  const nearest = quarters.reduce((best, q) =>
    Math.abs(clamped - q) < Math.abs(clamped - best) ? q : best,
  );
  return String(nearest).padStart(2, "0");
}

function parseHourMinute(isoTime: string | null | undefined): { hour: string; minute: string } {
  const raw = (isoTime ?? "07:00:00").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!raw) {
    return { hour: "07", minute: "00" };
  }
  const hour = String(Math.min(23, Math.max(0, Number(raw[1])))).padStart(2, "0");
  const minuteNum = Math.min(59, Math.max(0, Number(raw[2])));
  const minute = snapMinuteToQuarter(minuteNum);
  return { hour, minute };
}

function ServiceTimePicker({
  name,
  defaultTime,
  ariaLabel,
}: {
  name: string;
  defaultTime: string;
  ariaLabel: string;
}) {
  const initial = useMemo(() => parseHourMinute(defaultTime), [defaultTime]);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  const value = `${hour}:${minute}`;

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80">
      <input type="hidden" name={name} value={value} readOnly />
      <select
        aria-label={`${ariaLabel} (HH)`}
        value={hour}
        onChange={(e) => setHour(e.target.value)}
        className="min-h-11 min-w-[3.25rem] shrink-0 rounded-xl border-0 bg-white py-2 pl-3 pr-8 text-center text-base font-black tabular-nums text-slate-950 outline-none focus:ring-2 focus:ring-yellow-400/60 sm:min-w-[4rem]"
      >
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="select-none text-base font-black text-slate-400" aria-hidden>
        :
      </span>
      <select
        aria-label={`${ariaLabel} (MM)`}
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
        className="min-h-11 min-w-[3.25rem] shrink-0 rounded-xl border-0 bg-white py-2 pl-3 pr-8 text-center text-base font-black tabular-nums text-slate-950 outline-none focus:ring-2 focus:ring-yellow-400/60 sm:min-w-[4rem]"
      >
        {MINUTE_QUARTER_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
        <input
          name="capacity"
          type="number"
          min={1}
          defaultValue={elevator?.capacity ?? 8}
          required
          className="min-h-11 w-full max-w-[8rem] rounded-2xl bg-white px-4 py-3 text-center font-bold text-slate-950 outline-none sm:max-w-none sm:text-left lg:max-w-[7rem]"
          aria-label={t("elevator.capacityLabel")}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
            {t("elevator.serviceStartLabel")}
          </span>
          <ServiceTimePicker
            key={`${elevator?.id ?? "create"}-serviceStart-${elevator?.service_start_time ?? ""}`}
            name="serviceStart"
            defaultTime={elevator?.service_start_time ?? "07:00:00"}
            ariaLabel={t("elevator.serviceStartLabel")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
            {t("elevator.serviceEndLabel")}
          </span>
          <ServiceTimePicker
            key={`${elevator?.id ?? "create"}-serviceEnd-${elevator?.service_end_time ?? ""}`}
            name="serviceEnd"
            defaultTime={elevator?.service_end_time ?? "15:00:00"}
            ariaLabel={t("elevator.serviceEndLabel")}
          />
        </div>
      </div>
    </div>
  );
}
