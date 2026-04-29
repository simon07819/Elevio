"use client";

import { useMemo, useState } from "react";

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

export function ServiceTimePicker({
  name,
  defaultTime,
  ariaLabel,
  disabled = false,
}: {
  name: string;
  defaultTime: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const initial = useMemo(() => parseTo12HourPicker(defaultTime), [defaultTime]);
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(initial.period);

  const value24 = useMemo(() => to24HourString(hour12, minute, period), [hour12, minute, period]);

  return (
    <div
      className={`inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl bg-white px-1 py-1 shadow-sm ring-1 ring-slate-200/80 ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
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
