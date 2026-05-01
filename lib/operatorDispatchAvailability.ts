import { formatPostgresTimeToAmPm } from "@/lib/utils";
import { elevatorOperatorSessionAppearsLive, isOperatorTabletSessionStale } from "@/lib/operatorTablet";
import type { Elevator } from "@/types/hoist";

export const DEFAULT_PROJECT_TIMEZONE = "America/Toronto";

/** True si la chaîne ressemble à un UA / libellé appareil (pas un nom humain). */
function looksLikeTabletUaSummary(value: string): boolean {
  const t = value.trim().toLowerCase();
  if (!t) return false;
  if (/\b(safari|chrome|firefox|chromium|crios)\b/.test(t)) return true;
  if (t.includes("edg/")) return true;
  if (/\b(ipad|iphone|android|mozilla)\b/.test(t)) return true;
  if (t.includes(" · ") || /\bmac\s*os\b/.test(t)) return true;
  return false;
}

/** Nom passagers : nom de cabine en premier ; sinon profil ; jamais l’étiquette tablette ni un UA. */
export function passengerFacingOperatorName(elevator: Elevator): string | null {
  const tablet = elevator.operator_tablet_label?.trim() ?? "";

  const cab = elevator.name?.trim() ?? "";
  if (cab && !(tablet && normCollapse(cab) === normCollapse(tablet)) && !looksLikeTabletUaSummary(cab)) {
    return cab;
  }

  let fromDb = elevator.operator_display_name?.trim() ?? "";
  if (fromDb && tablet && (fromDb === tablet || normCollapse(fromDb) === normCollapse(tablet))) {
    fromDb = "";
  }
  if (fromDb && looksLikeTabletUaSummary(fromDb)) {
    fromDb = "";
  }
  if (fromDb) return fromDb;

  if (!cab) return null;
  if (tablet && normCollapse(cab) === normCollapse(tablet)) return null;
  if (looksLikeTabletUaSummary(cab)) return null;
  return cab;
}

function normCollapse(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Bloqué uniquement quand aucune cabine n’a de session opérateur vivante (heartbeat). */
export type DispatchBlockReason = "no_live_operator";

export type PassengerDispatchOperatorSummary = {
  /** Nom cabine en priorité ; sinon libellé profil ; UI générique si null */
  displayName: string | null;
  /** Plage horaire cabine (fuseau chantier), ex. 12 h AM–3 h PM */
  hoursRange: string;
  /** Session vivante mais heure actuelle hors plage configurée — bandeau ambre + expliquateur */
  outsideScheduledHours: boolean;
};

export type PassengerDispatchState = {
  canDispatch: boolean;
  blockReason: DispatchBlockReason | null;
  hourRanges: Array<{ start: string; end: string }>;
  /** Opérateurs en ligne ; chaque entrée inclut la plage horaire cabine pour le QR passager */
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
  const raw = elevators
    .map((e) => {
      const displayName = passengerFacingOperatorName(e);
      return {
        displayName,
        hoursRange: elevatorServiceHoursAmPmRange(e),
        outsideScheduledHours: !isElevatorWithinServiceHours(e, tz, now),
      };
    })
    .filter((row) => row.displayName !== null);
  const seen = new Set<string>();
  return raw.filter((row) => {
    const key = `${row.displayName ?? ""}|${row.hoursRange}|${row.outsideScheduledHours}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ascenseur peut recevoir une demande passager : session tablette vivante (sans garde-heures). */
export function isElevatorDispatchableNow(elevator: Elevator, timeZone?: string, now?: Date): boolean {
  void timeZone;
  const nowMs = now?.getTime() ?? Date.now();
  if (elevatorOperatorSessionAppearsLive(elevator, nowMs)) {
    return true;
  }
  return Boolean(elevator.operator_session_heartbeat_at && !isOperatorTabletSessionStale(elevator.operator_session_heartbeat_at, nowMs));
}

export function analyzePassengerDispatch({
  elevators,
  timeZone,
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
  void timeZone;
  const activeElevators = elevators.filter((e) => e.active !== false);
  const nowMs = now.getTime();
  const dispatchableElevators = activeElevators.filter((e) =>
    elevatorOperatorSessionAppearsLive(e, nowMs) ||
    Boolean(e.operator_session_heartbeat_at && !isOperatorTabletSessionStale(e.operator_session_heartbeat_at, nowMs)),
  );

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
