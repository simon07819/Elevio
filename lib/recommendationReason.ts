import type { Locale } from "@/lib/i18n";
import type { DispatchRecommendationReason } from "@/types/hoist";

export function formatDispatchRecommendationReason(
  detail: DispatchRecommendationReason | undefined,
  locale: Locale,
  fallbackReason: string,
): string {
  if (!detail) {
    return fallbackReason;
  }

  const fr = locale === "fr";

  switch (detail.kind) {
    case "idle_empty":
      return "";
    case "idle_blocked":
      return fr
        ? "Cabine pleine ou groupe trop grand : déposer d'abord, ou attendre une autre cabine disponible."
        : "Cabin full or group too large: drop off passengers first, or wait for another available hoist.";
    case "idle_manual_full":
      return fr
        ? "Mode PLEIN actif : ramassages bloqués. Déposer les passagers embarqués, puis reprendre pour réactiver les ramassages."
        : "FULL mode active: pickups blocked. Drop off onboard passengers, then resume to re-enable pickups.";
    case "dropoff_before_pickups":
      return fr
        ? `Déposer ${detail.passengers} personne(s) avant de reprendre les appels paliers.`
        : `Drop off ${detail.passengers} passenger(s) before picking up hall calls again.`;
    case "pickup": {
      const prefix = detail.atCurrentFloor
        ? fr
          ? "Ramasser ici"
          : "Pick up here"
        : fr
          ? `Ramasser a l'etage ${detail.pickupLabel}`
          : `Pick up at floor ${detail.pickupLabel}`;
      const prio = detail.priority ? (fr ? " Priorité active." : " Active priority.") : "";
      const people = fr
        ? `${detail.passengerCount} personne(s) vers ${detail.destinationLabel}`
        : `${detail.passengerCount} ${detail.passengerCount === 1 ? "person" : "people"} to ${detail.destinationLabel}`;
      // Lister les autres ramassages planifiés du même cycle pour que l'opérateur ne lise
      // pas « vers ${destinationLabel} » comme « prochain arrêt » alors que ce n'est que la
      // destination du passager. Étages dans l'ordre de visite.
      const upcoming = detail.upcomingPickupLabels ?? [];
      const upcomingLine =
        upcoming.length > 0
          ? fr
            ? ` Ramassages prévus en chemin : ${upcoming.join(", ")}.`
            : ` Planned pickups en route: ${upcoming.join(", ")}.`
          : "";
      const dropoffs = detail.plannedDropoffLabels ?? [];
      const dropoffLine =
        dropoffs.length > 0
          ? fr
            ? ` Déposes prévues : ${dropoffs.join(", puis ")}.`
            : ` Planned dropoffs: ${dropoffs.join(", then ")}.`
          : "";
      return `${prefix} : ${people}.${upcomingLine}${dropoffLine}${prio}`;
    }
    case "pickup_fallback":
      return fr
        ? `Ramasser ${detail.passengerCount} personne(s).`
        : `Pick up ${detail.passengerCount} ${detail.passengerCount === 1 ? "person" : "people"}.`;
    default:
      return fallbackReason;
  }
}
