"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/errorTracking";

/** Emis par l'operateur apres "Vider la liste" ; payload : IDs des demandes annulees. */
export const PASSENGER_BROADCAST_QUEUE_CLEARED = "queue_cleared";
/** Emis par l'operateur des "Ramasser" ; payload : IDs des demandes embarquees. */
export const PASSENGER_BROADCAST_REQUEST_BOARDED = "request_boarded";
/** Emis par l'operateur quand il annule une demande individuelle ; payload : ID de la demande. */
export const PASSENGER_BROADCAST_REQUEST_CANCELLED = "request_cancelled";
/** Emis par l'operateur apres "Deposer" ; payload : IDs des demandes completees. */
export const PASSENGER_BROADCAST_REQUEST_COMPLETED = "request_completed";

export function passengerProjectBroadcastChannel(projectId: string) {
  return `proj:${projectId}:passengers`;
}

/**
 * Notifie les telephones passagers (canal Realtime Broadcast, pas Postgres).
 * Ne bloque pas l'UI -- si ca echoue, le poll RPC reprend le relais.
 */
export function broadcastPassengerQueueCleared(client: SupabaseClient, projectId: string, requestIds: string[]): void {
  broadcastPassengerRequestIds(client, projectId, PASSENGER_BROADCAST_QUEUE_CLEARED, requestIds);
}

export function broadcastPassengerRequestBoarded(client: SupabaseClient, projectId: string, requestIds: string[]): void {
  broadcastPassengerRequestIds(client, projectId, PASSENGER_BROADCAST_REQUEST_BOARDED, requestIds);
}

export function broadcastPassengerRequestCancelled(client: SupabaseClient, projectId: string, requestId: string): void {
  broadcastPassengerRequestIds(client, projectId, PASSENGER_BROADCAST_REQUEST_CANCELLED, [requestId]);
}

export function broadcastPassengerRequestCompleted(client: SupabaseClient, projectId: string, requestIds: string[]): void {
  broadcastPassengerRequestIds(client, projectId, PASSENGER_BROADCAST_REQUEST_COMPLETED, requestIds);
}

function broadcastPassengerRequestIds(
  client: SupabaseClient,
  projectId: string,
  event: string,
  requestIds: string[],
): void {
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
        event,
        payload: { requestIds },
      });
    } catch (err) {
      captureError(err, { action: "broadcast_passengerNotify", event, projectId, requestIds: requestIds.length });
    } finally {
      client.removeChannel(channel);
    }
  })();
}
