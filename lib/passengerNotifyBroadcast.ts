"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Émis par l’opérateur après « Vider la liste » ; payload : IDs des demandes annulées. */
export const PASSENGER_BROADCAST_QUEUE_CLEARED = "queue_cleared";

export function passengerProjectBroadcastChannel(projectId: string) {
  return `proj:${projectId}:passengers`;
}

/**
 * Notifie les téléphones passagers (canal Realtime Broadcast, pas Postgres).
 * Ne bloque pas l’UI — si ça échoue, le poll RPC reprend le relais.
 */
export function broadcastPassengerQueueCleared(client: SupabaseClient, projectId: string, requestIds: string[]): void {
  if (requestIds.length === 0) {
    return;
  }

  const channel = client.channel(passengerProjectBroadcastChannel(projectId));

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
        event: PASSENGER_BROADCAST_QUEUE_CLEARED,
        payload: { requestIds },
      });
    } catch {
      /* volontairement silencieux */
    } finally {
      client.removeChannel(channel);
    }
  })();
}
