const STORAGE_PREFIX = "elevio-passenger-device";

/** Identifiant stable par chantier sur cet appareil (localStorage). Pas une identité personnelle. */
export function getOrCreatePassengerDeviceKey(projectId: string): string {
  if (typeof window === "undefined") return "";
  const key = `${STORAGE_PREFIX}:${projectId}`;
  try {
    const existing = window.localStorage.getItem(key)?.trim() ?? "";
    if (existing.length > 0) {
      return existing;
    }
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return "";
  }
}
