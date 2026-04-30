import { elevatorOperatorSessionAppearsLive } from "@/lib/operatorTablet";
import type { Elevator } from "@/types/hoist";

export const DEFAULT_PROJECT_TIMEZONE = "America/Toronto";

export type DispatchBlockReason = "outside_hours" | "no_live_operator";

export type PassengerDispatchState = {
  canDispatch: boolean;
  blockReason: DispatchBlockReason | null;
  hourRanges: Array<{ start: string; end: string }>;
};

/** Valide un fuseau IANA (lève si invalide pour Intl). */
export function assertValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error("INVALID_TIMEZONE");
  }
}

/** Minutes depuis minuit (0–1439) dans le fuseau donné. */
export function minutesSinceMidnightInTimeZone(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Parse une valeur `time` Postgres (`HH:MM:SS` ou `HH:MM`). */
export function parsePostgresTimeToMinutes(value: string | null | undefined): number | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function isElevatorWithinServiceHours(elevator: Elevator, timeZone: string, now: Date = new Date()): boolean {
  const start = parsePostgresTimeToMinutes(elevator.service_start_time ?? "07:00:00");
  const end = parsePostgresTimeToMinutes(elevator.service_end_time ?? "15:00:00");
  if (start === null || end === null || start === end) {
    return false;
  }
  const nowM = minutesSinceMidnightInTimeZone(now, timeZone);
  if (start < end) {
    return nowM >= start && nowM <= end;
  }
  return nowM >= start || nowM <= end;
}

export function isElevatorDispatchableNow(elevator: Elevator, timeZone: string, now?: Date): boolean {
  return elevatorOperatorSessionAppearsLive(elevator) && isElevatorWithinServiceHours(elevator, timeZone, now);
}

export function analyzePassengerDispatch({
  elevators,
  timeZone,
  now = new Date(),
}: {
  elevators: Elevator[];
  timeZone: string;
  now?: Date;
}): {
  canDispatch: boolean;
  blockReason: DispatchBlockReason | null;
  anyWindowOpen: boolean;
  dispatchableElevators: Elevator[];
} {
  let tz = timeZone?.trim() || DEFAULT_PROJECT_TIMEZONE;
  try {
    assertValidTimeZone(tz);
  } catch {
    tz = DEFAULT_PROJECT_TIMEZONE;
  }
  const activeElevators = elevators.filter((e) => e.active !== false);

  const anyWindowOpen = activeElevators.some((e) => isElevatorWithinServiceHours(e, tz, now));
  const dispatchableElevators = activeElevators.filter((e) => isElevatorDispatchableNow(e, tz, now));

  if (dispatchableElevators.length > 0) {
    return { canDispatch: true, blockReason: null, anyWindowOpen, dispatchableElevators };
  }

  const blockReason: DispatchBlockReason = !anyWindowOpen ? "outside_hours" : "no_live_operator";

  return { canDispatch: false, blockReason, anyWindowOpen, dispatchableElevators: [] };
}

/** Compare les plages HH:MM pour affichage ; retourne une seule plage si toutes identiques. */
export function uniqueServiceHourRanges(elevators: Elevator[]): Array<{ start: string; end: string }> {
  const keys = new Set<string>();
  const out: Array<{ start: string; end: string }> = [];
  for (const e of elevators) {
    const start = (e.service_start_time ?? "07:00:00").slice(0, 5);
    const end = (e.service_end_time ?? "15:00:00").slice(0, 5);
    const k = `${start}-${end}`;
    if (!keys.has(k)) {
      keys.add(k);
      out.push({ start, end });
    }
  }
  return out;
}
