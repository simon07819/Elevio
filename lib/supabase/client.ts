"use client";

import { processLock } from "@supabase/auth-js";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/publicEnv";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  const { url, anonKey } = env;

  browserClient ??= createBrowserClient(url, anonKey, {
    auth: {
      /**
       * Évite `navigator.locks` (Web Locks API). Sinon erreurs du type
       * « Lock was released because another request stole it » sur Safari / iPad,
       * ou quand plusieurs hooks appellent `getSession` / auth en parallèle.
       * `processLock` sérialise dans l’onglet (pas entre onglets).
       */
      lock: processLock,
    },
  });

  return browserClient;
}
