"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Elevator, HoistRequest, RequestStatus } from "@/types/hoist";
import { statusPriority, isTerminalStatus, resolveMerge, logSync, logMerge } from "./stateResolution";

/** Log realtime errors via logSync + structured [Elevio Error] tag. */
function captureRealtimeError(message: string, details: Record<string, unknown>) {
  logSync("realtimeError", { message, ...details });
  // Structured log for admin metrics page
  if (typeof window !== "undefined") {
    const debug = window.localStorage.getItem("elevio_debug_sync") === "true"
      || process.env.NEXT_PUBLIC_DEBUG_SYNC === "true";
    if (debug) console.log(`[Elevio Error]`, message, details);
  }
  // Also capture to error tracking so it's visible in production
  try {
    // Dynamic import to avoid SSR issues — eslint disabled for require
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { captureError } = require("@/lib/errorTracking");
    captureError(new Error(message), { action: "realtime_error", ...details });
  } catch {
    // errorTracking not available (SSR, test) — non-critical
  }
}

const TERMINAL_REQUEST_STATUSES: RequestStatus[] = ["completed", "cancelled"];

/** Re-export statusPriority for backward compatibility. */
export { statusPriority as STATUS_PRIORITY_NUMBER } from "./stateResolution";

/** Fusionne une ligne du poll operateur avec l'état local : évite de réinjecter une ligne encore « ouverte » après annulation / fin côté realtime. Boarded beats pending/assigned. */
export function mergeOperatorPollRequest(existing: HoistRequest | undefined, incoming: HoistRequest): HoistRequest {
  const result = resolveMerge(existing, incoming);
  if (existing && existing.status !== result.status) {
    logMerge("mergeOperatorPollRequest", {
      id: existing.id,
      fromStatus: existing.status,
      toStatus: result.status,
      fromPriority: statusPriority(existing.status),
      toPriority: statusPriority(result.status),
      winner: result === existing ? "existing" : "incoming",
    });
  }
  return result;
}

/**
 * Fusionne le prop `requests` (SSR / router.refresh) dans l’état live de la tablette.
 * Sans ceci, un refresh avec données encore ouvertes écrase un « Vider la liste » optimiste pendant plusieurs secondes.
 */
export function mergeRequestsPropIntoLive(live: HoistRequest[], fromProps: HoistRequest[]): HoistRequest[] {
  const ids = new Set<string>();
  for (const row of live) {
    ids.add(row.id);
  }
  for (const row of fromProps) {
    ids.add(row.id);
  }
  const liveById = new Map(live.map((row) => [row.id, row]));
  const propsById = new Map(fromProps.map((row) => [row.id, row]));
  const out: HoistRequest[] = [];
  for (const id of ids) {
    const l = liveById.get(id);
    const p = propsById.get(id);
    if (!l) {
      if (p) out.push(p);
      continue;
    }
    if (!p) {
      out.push(l);
      continue;
    }
    out.push(mergeOperatorPollRequest(l, p));
  }
  return out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

type RealtimeHandler<T> = (payload: T) => void;

export type RequestRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: HoistRequest;
  old: Partial<HoistRequest>;
};

export type ElevatorRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Elevator;
  old: Partial<Elevator>;
};

export function mergeRealtimeRequest(current: HoistRequest[], payload: RequestRealtimePayload) {
  if (payload.eventType === "DELETE") {
    logSync("mergeRealtimeRequest", { event: "DELETE", id: payload.old.id });
    return current.filter((request) => request.id !== payload.old.id);
  }

  const nextRequest = payload.new;
  const exists = current.some((request) => request.id === nextRequest.id);

  if (!exists) {
    logSync("mergeRealtimeRequest", { event: "INSERT", id: nextRequest.id, status: nextRequest.status });
    return [nextRequest, ...current];
  }

  const merged = current.map((request) =>
    request.id === nextRequest.id ? mergeOperatorPollRequest(request, nextRequest) : request,
  );
  logSync("mergeRealtimeRequest", { event: "UPDATE", id: nextRequest.id, incomingStatus: nextRequest.status });
  return merged;
}

/**
 * Fusionne le snapshot SSR avec l’état realtime : évite qu’un `router.refresh()` avec données
 * légèrement en retard écrase des lignes déjà reçues sur le canal.
 */
export function mergeServerRequestsWithLive(previous: HoistRequest[], server: HoistRequest[]): HoistRequest[] {
  const merged = new Map<string, HoistRequest>();
  for (const row of server) {
    merged.set(row.id, row);
  }
  for (const row of previous) {
    const existing = merged.get(row.id);
    if (!existing) {
      merged.set(row.id, row);
    } else {
      merged.set(row.id, mergeOperatorPollRequest(existing, row));
    }
  }
  return [...merged.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export type RealtimeChannelStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED";

export function subscribeToTable<T>({
  client,
  table,
  filter,
  onChange,
  onStatus,
}: {
  client: SupabaseClient | null;
  table: string;
  filter?: string;
  onChange: RealtimeHandler<T>;
  /**
   * Optional connection status callback. Used by the operator UI to gate the
   * fallback polling loop: when realtime is SUBSCRIBED, the LTE-friendly slow
   * poll (every 30s) is skipped; on CHANNEL_ERROR / TIMED_OUT / CLOSED it
   * resumes so the operator stays live without burning data.
   */
  onStatus?: (status: RealtimeChannelStatus) => void;
}): RealtimeChannel | null {
  if (!client) {
    return null;
  }

  const channelId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = client
    .channel(`realtime:${table}:${filter ?? "all"}:${channelId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter,
      },
      (payload) => onChange(payload as T),
    )
    .subscribe((status: string) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        captureRealtimeError(`realtime_subscribe_failed: ${status}`, { table, filter, status });
      }
      if (
        status === "SUBSCRIBED" ||
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        onStatus?.(status);
      }
    });

  return channel;
}

export function unsubscribe(client: SupabaseClient | null, channel: RealtimeChannel | null) {
  if (client && channel) {
    client.removeChannel(channel);
  }
}

/**
 * Attends une session Supabase puis souscrit au realtime ; recree le canal apres connexion / refresh JWT.
 * Sans ca (Safari, iPad, premier rendu Next), `subscribe()` part souvent avant les cookies auth :
 * le canal reste anonyme, la policy SELECT requests bloque → aucune mise a jour live tant que refresh manuel.
 *
 * Also recreates the channel when the WebSocket reconnects after a network interruption,
 * so the subscriber gets a fresh channel with current server state.
 */
export function bindRealtimeWithAuthSession(
  client: SupabaseClient | null,
  subscribeFn: () => RealtimeChannel | null,
): () => void {
  if (!client) {
    return () => {};
  }

  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  const teardown = () => {
    unsubscribe(client, channel);
    channel = null;
  };

  const attachIfSession = async () => {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (cancelled) return;
    teardown();
    if (session) {
      channel = subscribeFn();
      logSync("realtimeChannelAttached", { userId: session.user.id.slice(0, 8) });
    } else {
      logSync("realtimeNoSession", {});
    }
  };

  void attachIfSession();

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    if (cancelled) return;
    teardown();
    if (session) {
      channel = subscribeFn();
      logSync("realtimeAuthChange", { event: _event, hasSession: true });
    } else {
      logSync("realtimeAuthChange", { event: _event, hasSession: false });
    }
  });

  // Re-create channel on network reconnect so missed events are recovered via poll.
  const onOnline = () => {
    if (cancelled) return;
    logSync("realtimeNetworkReconnect", {});
    void attachIfSession();
  };
  window.addEventListener("online", onOnline);

  return () => {
    cancelled = true;
    subscription.unsubscribe();
    teardown();
    window.removeEventListener("online", onOnline);
  };
}
