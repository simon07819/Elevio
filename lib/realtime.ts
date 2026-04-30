"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Elevator, HoistRequest } from "@/types/hoist";

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

  const channel = client
    .channel(`realtime:${table}:${filter ?? "all"}`)
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
