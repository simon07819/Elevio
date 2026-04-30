import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/publicEnv";

export async function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  const { url, anonKey } = env;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headersToApply) {
        void headersToApply;
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components can read cookies but cannot always mutate them.
        }
      },
    },
  });
}
