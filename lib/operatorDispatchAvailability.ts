import { formatPostgresTimeToAmPm } from "@/lib/utils";
import { elevatorOperatorSessionAppearsLive } from "@/lib/operatorTablet";
import type { Elevator } from "@/types/hoist";

export const DEFAULT_PROJECT_TIMEZONE = "America/Toronto";

/** Bloqué uniquement quand aucune cabine n’a de session opérateur vivante (heartbeat). */
export type DispatchBlockReason = "no_live_operator";

export type PassengerDispatchOperatorSummary = {
  /** null si profil sans nom — UI affiche une etiquette generique */
  displayName: string | null;
  /** Plage horaire cabine (fuseau chantier), ex. 12 h AM–3 h PM */
  hoursRange: string;
  /** Session vivante mais heure actuelle hors plage configurée — UI sans affichage des heures. */
  outsideScheduledHours: boolean;
};

export type PassengerDispatchState = {
  canDispatch: boolean;
  blockReason: DispatchBlockReason | null;
  hourRanges: Array<{ start: string; end: string }>;
  /** Opérateurs en ligne ; hors plage configurée → pas d’horaire affiché, libellé dédié. */
  dispatchOperators: PassengerDispatchOperatorSummary[];
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

/** Plage horaire service cabine en 12 h pour affichage passager. */
export function elevatorServiceHoursAmPmRange(elevator: Elevator): string {
  const start = (elevator.service_start_time ?? "07:00:00").slice(0, 5);
  const end = (elevator.service_end_time ?? "15:00:00").slice(0, 5);
  return `${formatPostgresTimeToAmPm(start)}–${formatPostgresTimeToAmPm(end)}`;
}

/** Liste dedupliquee pour la vue demande passager. */
export function passengerDispatchOperatorSummaries(
  elevators: Elevator[],
  timeZone: string,
  now: Date = new Date(),
): PassengerDispatchOperatorSummary[] {
  let tz = timeZone?.trim() || DEFAULT_PROJECT_TIMEZONE;
  try {
    assertValidTimeZone(tz);
  } catch {
    tz = DEFAULT_PROJECT_TIMEZONE;
  }
  const raw = elevators.map((e) => ({
    displayName: e.operator_display_name?.trim() || null,
    hoursRange: elevatorServiceHoursAmPmRange(e),
    outsideScheduledHours: !isElevatorWithinServiceHours(e, tz, now),
  }));
  const seen = new Set<string>();
  return raw.filter((row) => {
    const key = `${row.displayName ?? ""}|${row.hoursRange}|${row.outsideScheduledHours}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ascenseur peut recevoir une demande passager : session tablette vivante (sans garde-heures). */
export function isElevatorDispatchableNow(elevator: Elevator, _timeZone?: string, now?: Date): boolean {
  return elevatorOperatorSessionAppearsLive(elevator, now?.getTime());
}

export function analyzePassengerDispatch({
  elevators,
  timeZone: _timeZone,
  now = new Date(),
}: {
  elevators: Elevator[];
  /** Conservé pour compatibilité appelants ; la disponibilité passager ne dépend plus des heures. */
  timeZone: string;
  now?: Date;
}): {
  canDispatch: boolean;
  blockReason: DispatchBlockReason | null;
  dispatchableElevators: Elevator[];
} {
  const activeElevators = elevators.filter((e) => e.active !== false);
  const nowMs = now.getTime();
  const dispatchableElevators = activeElevators.filter((e) => elevatorOperatorSessionAppearsLive(e, nowMs));

  if (dispatchableElevators.length > 0) {
    return { canDispatch: true, blockReason: null, dispatchableElevators };
  }

  return { canDispatch: false, blockReason: "no_live_operator", dispatchableElevators: [] };
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
