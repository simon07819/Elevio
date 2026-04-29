"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/publicEnv";

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  const { url, anonKey } = env;

  return createBrowserClient(url, anonKey);
}
