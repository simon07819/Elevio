"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBroadcastFireAndForget } from "@/lib/broadcastSend";

/** Émis après désactivation admin d’une tablette (`elevators.operator_session_id` effacé). */
export const OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED = "elevator_operator_session_cleared";

export function operatorProjectBroadcastChannel(projectId: string) {
  return `proj:${projectId}:operators`;
}

/**
 * Notifie les autres navigateurs opérateur du chantier (Realtime Broadcast).
 * Strictement non-bloquant : un échec d'abonnement est journalisé en warning,
 * Postgres / poll alignera l'état si le canal est indisponible.
 */
export function broadcastOperatorElevatorSessionCleared(
  client: SupabaseClient,
  projectId: string,
  elevatorId: string,
): void {
  sendBroadcastFireAndForget({
    client,
    channelName: operatorProjectBroadcastChannel(projectId),
    event: OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED,
    payload: { elevatorId },
    action: "broadcast_operatorSessionCleared",
    context: { projectId, elevatorId },
  });
}
