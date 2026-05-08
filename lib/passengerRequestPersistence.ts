import type { Floor, RequestStatus } from "@/types/hoist";
import { ACTIVE_PASSENGER_REQUEST_STATUSES, TERMINAL_PASSENGER_REQUEST_STATUSES } from "@/types/hoist";

const STORAGE_PREFIX = "elevio-passenger-pending";

/** Une seule demande en attente par chantier sur cet appareil (même QR ou code d’accès / autre étage). */
export function passengerPendingRequestStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId}`;
}

function legacyPassengerPendingKeyPrefix(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId}:`;
}

/** Jeton QR de l’étage pour les RPC passager (reprise / annulation), aligné sur `from_floor_id`. */
export function qrTokenForFloorId(floors: Pick<Floor, "id" | "qr_token">[], floorId: string): string | null {
  const token = floors.find((f) => f.id === floorId)?.qr_token?.trim();
  return token && token.length > 0 ? token : null;
}

function removeLegacyPassengerPendingKeys(projectId: string): void {
  if (typeof window === "undefined") return;
  const prefix = legacyPassengerPendingKeyPrefix(projectId);
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(prefix)) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* quota / private mode */
    }
  }
}

export type PassengerPendingRequestSnapshot = {
  requestId: string;
  waitStartedAt: string;
  fromFloorId: string;
  toFloorId: string;
  passengerCount: number;
  /** Present apres creation ou reprise serveur. */
  status?: RequestStatus;
};

/** True as long as the local snapshot corresponds to passenger tracking (hide "Scanner un code QR"). */
export function passengerPendingSnapshotIndicatesTracking(snap: PassengerPendingRequestSnapshot | null): boolean {
  if (!snap) return false;
  const st = snap.status ?? "pending";
  // Active statuses indicate tracking. "boarded" is NOT active for tracking
  // purposes — the passenger is in the elevator and has been redirected to QR.
  // Terminal statuses (completed, cancelled) also don't block.
  return (ACTIVE_PASSENGER_REQUEST_STATUSES as readonly string[]).includes(st);
}

export function parsePassengerPendingSnapshot(raw: string): PassengerPendingRequestSnapshot | null {
  try {
    const data = JSON.parse(raw) as Partial<PassengerPendingRequestSnapshot>;
    if (
      typeof data.requestId !== "string" ||
      typeof data.waitStartedAt !== "string" ||
      typeof data.fromFloorId !== "string" ||
      typeof data.toFloorId !== "string" ||
      typeof data.passengerCount !== "number"
    ) {
      return null;
    }
    return {
      requestId: data.requestId,
      waitStartedAt: data.waitStartedAt,
      fromFloorId: data.fromFloorId,
      toFloorId: data.toFloorId,
      passengerCount: data.passengerCount,
      ...(typeof data.status === "string" ? { status: data.status as RequestStatus } : {}),
    };
  } catch {
    return null;
  }
}

function isV2Bucket(data: unknown): data is { v: 2; byId: Record<string, PassengerPendingRequestSnapshot> } {
  if (!data || typeof data !== "object") {
    return false;
  }
  const o = data as Record<string, unknown>;
  if (o.v !== 2 || typeof o.byId !== "object" || o.byId === null || Array.isArray(o.byId)) {
    return false;
  }
  return true;
}

/**
 * Parse une valeur localStorage (snapshot simple ou bucket v2).
 * En cas de plusieurs entrées v2, garde la demande la plus récente (`wait_started_at`).
 */
export function loadPassengerPendingSnapshot(raw: string | null): PassengerPendingRequestSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as unknown;
    if (isV2Bucket(data)) {
      const snaps = Object.values(data.byId).filter(Boolean) as PassengerPendingRequestSnapshot[];
      if (snaps.length === 0) {
        return null;
      }
      snaps.sort((a, b) => new Date(b.waitStartedAt).getTime() - new Date(a.waitStartedAt).getTime());
      return snaps[0] ?? null;
    }
    return parsePassengerPendingSnapshot(raw);
  } catch {
    return parsePassengerPendingSnapshot(raw);
  }
}

/**
 * Lit la demande locale pour ce chantier ; migre les anciennes clés « par étage » (QR différent)
 * vers une seule entrée par `projectId`.
 */
export function readPassengerPendingProjectScoped(projectId: string): PassengerPendingRequestSnapshot | null {
  if (typeof window === "undefined") return null;
  const key = passengerPendingRequestStorageKey(projectId);
  try {
    const rawNew = window.localStorage.getItem(key);
    if (rawNew) {
      const snap = loadPassengerPendingSnapshot(rawNew);
      if (snap) {
        removeLegacyPassengerPendingKeys(projectId);
        return snap;
      }
      window.localStorage.removeItem(key);
    }

    const legacyPrefix = legacyPassengerPendingKeyPrefix(projectId);
    let best: PassengerPendingRequestSnapshot | null = null;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(legacyPrefix)) continue;
      const snap = loadPassengerPendingSnapshot(window.localStorage.getItem(k));
      if (!snap) continue;
      if (
        !best ||
        new Date(snap.waitStartedAt).getTime() > new Date(best.waitStartedAt).getTime()
      ) {
        best = snap;
      }
    }
    if (best) {
      window.localStorage.setItem(key, JSON.stringify(best));
      removeLegacyPassengerPendingKeys(projectId);
      return best;
    }
  } catch {
    /* quota / private mode */
  }
  return null;
}

export function clearPassengerPendingRequest(projectId: string, requestId?: string): void {
  if (typeof window === "undefined") return;
  const key = passengerPendingRequestStorageKey(projectId);
  try {
    if (!requestId) {
      window.localStorage.removeItem(key);
      removeLegacyPassengerPendingKeys(projectId);
      return;
    }
    const raw = window.localStorage.getItem(key);
    const snap = raw ? loadPassengerPendingSnapshot(raw) : null;
    if (snap?.requestId === requestId) {
      window.localStorage.removeItem(key);
      removeLegacyPassengerPendingKeys(projectId);
    }
  } catch {
    /* quota / private mode */
  }
}

/** Une seule commande locale par chantier ; remplace l’entrée précédente. */
export function savePassengerPendingRequest(projectId: string, snapshot: PassengerPendingRequestSnapshot): void {
  if (typeof window === "undefined") return;
  const key = passengerPendingRequestStorageKey(projectId);
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    removeLegacyPassengerPendingKeys(projectId);
  } catch {
    /* quota / private mode */
  }
}
