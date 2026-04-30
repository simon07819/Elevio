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
      return fr ? "Aucune demande pour le moment." : "No requests right now.";
    case "idle_blocked":
      return fr
        ? "Cabine pleine ou groupe trop grand : déposer d'abord, ou attendre une autre cabine disponible."
        : "Cabin full or group too large: drop off passengers first, or wait for another available hoist.";
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
          ? "Ramasser en chemin"
          : "Pick up en route";
      const prio = detail.priority ? (fr ? " Priorité active." : " Active priority.") : "";
      const people = fr
        ? `${detail.passengerCount} personne(s) vers ${detail.destinationLabel}`
        : `${detail.passengerCount} ${detail.passengerCount === 1 ? "person" : "people"} to ${detail.destinationLabel}`;
      return `${prefix} : ${people}.${prio}`;
    }
    case "pickup_fallback":
      return fr
        ? `Ramasser ${detail.passengerCount} personne(s).`
        : `Pick up ${detail.passengerCount} ${detail.passengerCount === 1 ? "person" : "people"}.`;
    default:
      return fallbackReason;
  }
}
