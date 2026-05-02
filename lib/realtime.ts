"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Elevator, HoistRequest, RequestStatus } from "@/types/hoist";

const TERMINAL_REQUEST_STATUSES: RequestStatus[] = ["completed", "cancelled"];

/** Fusionne une ligne du poll operateur avec l’état local : évite de réinjecter une ligne encore « ouverte » après annulation / fin côté realtime. */
export function mergeOperatorPollRequest(existing: HoistRequest | undefined, incoming: HoistRequest): HoistRequest {
  if (!existing) {
    return incoming;
  }
  const existingTerminal = TERMINAL_REQUEST_STATUSES.includes(existing.status);
  const incomingTerminal = TERMINAL_REQUEST_STATUSES.includes(incoming.status);
  if (existingTerminal && !incomingTerminal) {
    return existing;
  }
  if (!existingTerminal && incomingTerminal) {
    return incoming;
  }
  return new Date(incoming.updated_at) >= new Date(existing.updated_at) ? incoming : existing;
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
    return current.filter((request) => request.id !== payload.old.id);
  }

  const nextRequest = payload.new;
  const exists = current.some((request) => request.id === nextRequest.id);

  if (!exists) {
    return [nextRequest, ...current];
  }

  return current.map((request) => (request.id === nextRequest.id ? nextRequest : request));
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
    if (!merged.has(row.id)) {
      merged.set(row.id, row);
    }
  }
  return [...merged.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function subscribeToTable<T>({
  client,
  table,
  filter,
  onChange,
}: {
  client: SupabaseClient | null;
  table: string;
  filter?: string;
  onChange: RealtimeHandler<T>;
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
    .subscribe();

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
    }
  });

  return () => {
    cancelled = true;
    subscription.unsubscribe();
    teardown();
  };
}
