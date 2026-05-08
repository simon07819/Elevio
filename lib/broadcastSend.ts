"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureWarning, captureError } from "@/lib/errorTracking";

/**
 * Fire-and-forget Supabase Realtime broadcast send.
 *
 * Goals (cf. mission "broadcast subscribe timeout"):
 *  - Never throw to the caller / React render — all failures are swallowed.
 *  - One short subscribe with timeout, then one retry with backoff.
 *  - Always remove the ephemeral channel (no leak in React Strict Mode / unmount).
 *  - Subscribe timeouts go to Sentry as `warning`, never as a hard error.
 *  - The operator UI keeps working even if Realtime is unavailable —
 *    Postgres polling / RPC fallback already aligns the state.
 */

type BroadcastSendArgs = {
  client: SupabaseClient;
  channelName: string;
  event: string;
  payload: Record<string, unknown>;
  /** Tag forwarded to Sentry (e.g. "broadcast_passengerNotify"). */
  action: string;
  /** Extra context attached to logs (projectId, elevatorId, ids, …). */
  context?: Record<string, unknown>;
  /** Subscribe timeout per attempt, ms. */
  subscribeTimeoutMs?: number;
  /** Total attempts (1 = no retry). */
  maxAttempts?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.setTimeout(resolve, ms);
  });
}

async function attemptOnce(
  client: SupabaseClient,
  channelName: string,
  event: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const channel = client.channel(channelName);
  let timeoutId: number | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      timeoutId =
        typeof window !== "undefined"
          ? window.setTimeout(() => reject(new Error("subscribe_timeout")), timeoutMs)
          : null;
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          if (timeoutId !== null && typeof window !== "undefined") window.clearTimeout(timeoutId);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (timeoutId !== null && typeof window !== "undefined") window.clearTimeout(timeoutId);
          reject(err ?? new Error(String(status).toLowerCase()));
        }
      });
    });

    await channel.send({ type: "broadcast", event, payload });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timeoutId !== null && typeof window !== "undefined") window.clearTimeout(timeoutId);
    try {
      client.removeChannel(channel);
    } catch {
      // already removed — non-critical
    }
  }
}

/**
 * Best-effort broadcast send. Returns void: callers must NOT await this for correctness.
 * The function itself awaits internally so the channel cleanup happens, but no exception
 * ever propagates to React.
 */
export function sendBroadcastFireAndForget(args: BroadcastSendArgs): void {
  const {
    client,
    channelName,
    event,
    payload,
    action,
    context = {},
    subscribeTimeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = args;

  void (async () => {
    let lastReason = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await attemptOnce(client, channelName, event, payload, subscribeTimeoutMs);
        if (res.ok) {
          return;
        }
        lastReason = res.reason;
      } catch (err) {
        // attemptOnce never throws, but be defensive — convert to warning
        lastReason = err instanceof Error ? err.message : String(err);
      }
      if (attempt < maxAttempts) {
        // Linear backoff: 400ms, 800ms, …
        await sleep(400 * attempt);
      }
    }

    // All attempts failed. This is recoverable: realtime poll/RPC will catch up.
    // Report as warning so Sentry doesn't fire a critical alert.
    if (lastReason === "subscribe_timeout" || lastReason === "timed_out" || lastReason === "channel_error" || lastReason === "closed") {
      captureWarning("broadcast subscribe timeout", {
        action,
        event,
        channelName,
        retryCount: maxAttempts,
        reason: lastReason,
        ...context,
      });
    } else {
      // Unexpected error — keep visibility but do not throw.
      captureError(new Error(`broadcast_failed:${lastReason || "unknown"}`), {
        action,
        event,
        channelName,
        retryCount: maxAttempts,
        ...context,
      });
    }
  })();
}
