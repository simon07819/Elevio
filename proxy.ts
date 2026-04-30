import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/publicEnv";

/** Next.js 16 Proxy (ex-middleware) — aligné sur @supabase/ssr (setAll + headers anti-cache). */
export async function proxy(request: NextRequest) {
  const env = getSupabasePublicEnv();

  if (!env) {
    return NextResponse.next({ request });
  }

  const { url, anonKey } = env;

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToApply) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headersToApply).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    });

    await supabase.auth.getUser();
  } catch (error) {
    console.error("[proxy] Supabase session refresh failed:", error);
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg|manifest.webmanifest).*)"],
};
