import type { Elevator } from "@/types/hoist";

/** Sans heartbeat récent, la session tablette est considérée comme morte (écran éteint, navigateur fermé). */
export const OPERATOR_TABLET_HEARTBEAT_STALE_MS = 2 * 60_000;

export function isOperatorTabletSessionStale(heartbeat?: string | null, nowMs: number = Date.now()): boolean {
  if (!heartbeat) {
    return true;
  }

  return nowMs - new Date(heartbeat).getTime() > OPERATOR_TABLET_HEARTBEAT_STALE_MS;
}

/** Données résiduelles en base (session morte ou fantôme). */
export function elevatorHasOperatorTabletBinding(e: Elevator): boolean {
  return Boolean(
    e.operator_session_id ||
      e.operator_session_started_at ||
      e.operator_session_heartbeat_at ||
      e.operator_user_id,
  );
}

/** Une tablette envoie encore des heartbeats pour cette session. */
export function elevatorOperatorSessionAppearsLive(e: Elevator, nowMs: number = Date.now()): boolean {
  return Boolean(e.operator_session_id && !isOperatorTabletSessionStale(e.operator_session_heartbeat_at, nowMs));
}
