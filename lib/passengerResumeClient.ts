"use client";

import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { PassengerResumeSnapshot, RequestStatus } from "@/types/hoist";

const REQUEST_STATUS_VALUES: RequestStatus[] = [
  "pending",
  "assigned",
  "arriving",
  "boarded",
  "completed",
  "cancelled",
];

function coerceRequestStatus(value: string): RequestStatus | null {
  return REQUEST_STATUS_VALUES.includes(value as RequestStatus) ? (value as RequestStatus) : null;
}

/** Meme contrat que la server action `resumePassengerRequest` : RPC depuis le navigateur (JWT anon du tel QR). */
export async function resumePassengerRequestClient(
  projectId: string,
  floorQrToken: string,
  requestId: string,
): Promise<{ ok: true; snapshot: PassengerResumeSnapshot } | { ok: false; snapshot: null }> {
  const client = createClient();
  if (!client) {
    return { ok: false, snapshot: null };
  }

  if (!isUuid(projectId) || !isUuid(requestId)) {
    return { ok: false, snapshot: null };
  }

  const token = floorQrToken?.trim();
  if (!token) {
    return { ok: false, snapshot: null };
  }

  const { data, error } = await client.rpc("resume_passenger_request", {
    p_request_id: requestId,
    p_project_id: projectId,
    p_floor_token: token,
  });

  if (error || data == null) {
    return { ok: false, snapshot: null };
  }

  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0] as {
    id?: string;
    status?: string;
    wait_started_at?: string;
    from_floor_id?: string;
    to_floor_id?: string;
    passenger_count?: number;
  };

  if (!row?.id || !row.status || !row.wait_started_at) {
    return { ok: false, snapshot: null };
  }

  const status = coerceRequestStatus(row.status);
  if (!status) {
    return { ok: false, snapshot: null };
  }

  return {
    ok: true,
    snapshot: {
      requestId: row.id,
      status,
      waitStartedAt: row.wait_started_at,
      fromFloorId: row.from_floor_id as string,
      toFloorId: row.to_floor_id as string,
      passengerCount: Number(row.passenger_count ?? 0),
    },
  };
}
