"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Émis après désactivation admin d’une tablette (`elevators.operator_session_id` effacé). */
export const OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED = "elevator_operator_session_cleared";

export function operatorProjectBroadcastChannel(projectId: string) {
  return `proj:${projectId}:operators`;
}

/** Notifie les autres navigateurs opérateur du chantier (Realtime Broadcast). */
export function broadcastOperatorElevatorSessionCleared(client: SupabaseClient, projectId: string, elevatorId: string): void {
  const channel = client.channel(operatorProjectBroadcastChannel(projectId));

  void (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("broadcast subscribe timeout")), 5000);
        channel.subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeoutId);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            window.clearTimeout(timeoutId);
            reject(err ?? new Error(String(status)));
          }
        });
      });
      await channel.send({
        type: "broadcast",
        event: OPERATOR_BROADCAST_ELEVATOR_SESSION_CLEARED,
        payload: { elevatorId },
      });
    } catch {
      /* Realtime ou Postgres finira par aligner */
    } finally {
      client.removeChannel(channel);
    }
  })();
}
