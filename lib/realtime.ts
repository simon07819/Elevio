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
