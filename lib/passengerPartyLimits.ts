import type { Elevator } from "@/types/hoist";

/** Plafond passagers lorsque le chantier désactive les limites de capacité (dispatch « illimité »). */
export const PASSENGER_PARTY_MAX_WHEN_CAPACITY_DISABLED = 20;

/**
 * Nombre maximum de personnes qu’un passager peut indiquer pour une demande.
 * Capacité activée : plus grande capacité parmi les ascenseurs actifs du projet.
 * Capacité désactivée : {@link PASSENGER_PARTY_MAX_WHEN_CAPACITY_DISABLED}.
 */
export function maxPassengerPartySize(
  capacityEnabled: boolean,
  elevators: Pick<Elevator, "capacity" | "active">[],
): number {
  if (!capacityEnabled) {
    return PASSENGER_PARTY_MAX_WHEN_CAPACITY_DISABLED;
  }
  const caps = elevators
    .filter((e) => e.active !== false)
    .map((e) => Number(e.capacity))
    .filter((c) => Number.isFinite(c) && c >= 1);
  if (caps.length === 0) {
    return 1;
  }
  return Math.floor(Math.max(...caps));
}
