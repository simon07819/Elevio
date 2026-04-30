/** Cle localStorage par chantier + QR d'étage : rouvrir le meme lien restaure la demande en cours. */
export function passengerPendingRequestStorageKey(projectId: string, floorQrToken: string): string {
  return `elevio-passenger-pending:${projectId}:${floorQrToken}`;
}

export type PassengerPendingRequestSnapshot = {
  requestId: string;
  waitStartedAt: string;
  fromFloorId: string;
  toFloorId: string;
  passengerCount: number;
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
    };
  } catch {
    return null;
  }
}

export function clearPassengerPendingRequest(projectId: string, floorQrToken: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(passengerPendingRequestStorageKey(projectId, floorQrToken));
  } catch {
    /* quota / private mode */
  }
}

export function savePassengerPendingRequest(projectId: string, floorQrToken: string, snapshot: PassengerPendingRequestSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(passengerPendingRequestStorageKey(projectId, floorQrToken), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}
