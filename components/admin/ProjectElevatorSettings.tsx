"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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

const HOUR12_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_QUARTER_OPTIONS = ["00", "15", "30", "45"];

function snapMinuteToQuarter(totalMinuteValue: number): string {
  const clamped = Math.min(59, Math.max(0, totalMinuteValue));
  const quarters = [0, 15, 30, 45];
  const nearest = quarters.reduce((best, q) =>
    Math.abs(clamped - q) < Math.abs(clamped - best) ? q : best,
  );
  return String(nearest).padStart(2, "0");
}

function parseTo12HourPicker(isoTime: string | null | undefined): {
  hour12: string;
  minute: string;
  period: "AM" | "PM";
} {
  const raw = (isoTime ?? "07:00:00").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!raw) {
    return { hour12: "7", minute: "00", period: "AM" };
  }
  const h24 = Math.min(23, Math.max(0, Number(raw[1])));
  const minuteNum = Math.min(59, Math.max(0, Number(raw[2])));
  const minute = snapMinuteToQuarter(minuteNum);
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { hour12: String(h12), minute, period };
}

function to24HourString(hour12Str: string, minute: string, period: "AM" | "PM"): string {
  let h = Number(hour12Str);
  if (!Number.isFinite(h) || h < 1 || h > 12) h = 7;
  let h24: number;
  if (period === "AM") {
    h24 = h === 12 ? 0 : h;
  } else {
    h24 = h === 12 ? 12 : h + 12;
  }
  return `${String(h24).padStart(2, "0")}:${minute}`;
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
  const initial = useMemo(() => parseTo12HourPicker(defaultTime), [defaultTime]);
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(initial.period);

  const value24 = useMemo(() => to24HourString(hour12, minute, period), [hour12, minute, period]);

  return (
    <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl bg-white px-1 py-1 shadow-sm ring-1 ring-slate-200/80">
      <input type="hidden" name={name} value={value24} readOnly />
      <select
        aria-label={`${ariaLabel} (12 h)`}
        value={hour12}
        onChange={(e) => setHour12(e.target.value)}
        className="min-h-10 min-w-[2.5rem] shrink-0 rounded-lg border-0 bg-transparent py-2 pl-2 pr-6 text-center text-sm font-black tabular-nums text-slate-950 outline-none focus:ring-2 focus:ring-yellow-400/50 sm:min-w-[2.75rem] sm:pr-7"
      >
        {HOUR12_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="select-none text-sm font-black text-slate-400" aria-hidden>
        :
      </span>
      <select
        aria-label={`${ariaLabel} (minutes)`}
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
        className="min-h-10 min-w-[2.75rem] shrink-0 rounded-lg border-0 bg-transparent py-2 pl-2 pr-6 text-center text-sm font-black tabular-nums text-slate-950 outline-none focus:ring-2 focus:ring-yellow-400/50 sm:min-w-[3rem] sm:pr-7"
      >
        {MINUTE_QUARTER_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label={`${ariaLabel} (AM/PM)`}
        value={period}
        onChange={(e) => setPeriod(e.target.value as "AM" | "PM")}
        className="min-h-10 min-w-[4.25rem] shrink-0 rounded-lg border-0 bg-transparent py-2 pl-2 pr-5 text-center text-sm font-black uppercase text-slate-950 outline-none focus:ring-2 focus:ring-yellow-400/50"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
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
        <div className="flex w-full max-w-full flex-col items-start gap-1.5">
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
        <div className="flex w-full max-w-full flex-col items-start gap-1.5">
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
