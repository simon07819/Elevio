"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBroadcastFireAndForget } from "@/lib/broadcastSend";

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
 * Strictement non-bloquant : aucune exception ne remonte à React, et un timeout
 * d'abonnement est journalisé en warning (pas en error Sentry critique).
 * Si Realtime est indisponible, le poll RPC reprend le relais cote passager.
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

  sendBroadcastFireAndForget({
    client,
    channelName: passengerProjectBroadcastChannel(projectId),
    event,
    payload: { requestIds },
    action: "broadcast_passengerNotify",
    context: { projectId, requestCount: requestIds.length },
  });
}
