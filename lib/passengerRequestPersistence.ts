import type { RequestStatus } from "@/types/hoist";

/** Une seule demande en attente par combine chantier + QR d'étage sur cet appareil (localStorage). */
export function passengerPendingRequestStorageKey(projectId: string, floorQrToken: string): string {
  return `elevio-passenger-pending:${projectId}:${floorQrToken}`;
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
 * Une seule demande suivie localement. Migre l’ancien format v2 (plusieurs id dans un bucket) vers
 * la plus ancienne entrée — un téléphone ne doit pas cumuler deux commandes actives pour le même QR.
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
      snaps.sort((a, b) => new Date(a.waitStartedAt).getTime() - new Date(b.waitStartedAt).getTime());
      return snaps[0] ?? null;
    }
    return parsePassengerPendingSnapshot(raw);
  } catch {
    return parsePassengerPendingSnapshot(raw);
  }
}

export function clearPassengerPendingRequest(projectId: string, floorQrToken: string, requestId?: string): void {
  if (typeof window === "undefined") return;
  const key = passengerPendingRequestStorageKey(projectId, floorQrToken);
  try {
    if (!requestId) {
      window.localStorage.removeItem(key);
      return;
    }
    const raw = window.localStorage.getItem(key);
    const snap = raw ? loadPassengerPendingSnapshot(raw) : null;
    if (snap?.requestId === requestId) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* quota / private mode */
  }
}

/** Remplace toute entrée precedente : une seule commande locale par QR sur cet appareil. */
export function savePassengerPendingRequest(projectId: string, floorQrToken: string, snapshot: PassengerPendingRequestSnapshot): void {
  if (typeof window === "undefined") return;
  const key = passengerPendingRequestStorageKey(projectId, floorQrToken);
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}
