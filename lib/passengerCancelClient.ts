"use client";

import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";

/** Meme contrat que pour la reprise passager : RPC depuis le navigateur (JWT anon du QR). */
export async function cancelPassengerRequestClient(
  projectId: string,
  floorQrToken: string,
  requestId: string,
  note: string,
): Promise<{ ok: true } | { ok: false }> {
  const client = createClient();
  if (!client) {
    return { ok: false };
  }

  if (!isUuid(projectId) || !isUuid(requestId)) {
    return { ok: false };
  }

  const token = floorQrToken?.trim();
  if (!token) {
    return { ok: false };
  }

  const { data, error } = await client.rpc("cancel_passenger_request", {
    p_request_id: requestId,
    p_project_id: projectId,
    p_floor_token: token,
    p_note: note ?? "",
  });

  if (!error && data != null) {
    const payload = (Array.isArray(data) ? data[0] : data) as { ok?: boolean };
    if (payload?.ok === true) {
      return { ok: true };
    }
  }

  const { data: directRow, error: directError } = await client
    .from("requests")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      note: note ?? "Annule par le passager.",
    })
    .eq("id", requestId)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  return directError || !directRow ? { ok: false } : { ok: true };
}
