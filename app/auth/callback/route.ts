import { NextResponse, type NextRequest } from "next/server";
import { ensureProfileForUser } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/paywall";

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=missing_code", requestUrl.origin));
  }

  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/admin/login?error=supabase", requestUrl.origin));
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/admin/login?error=confirmation", requestUrl.origin));
  }

  await ensureProfileForUser(supabase, data.user);

  // Block open redirects: only allow internal paths starting with "/"
  let safeNext = "/paywall";
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    try {
      const parsed = new URL(next, requestUrl.origin);
      if (parsed.origin === requestUrl.origin) {
        safeNext = next;
      }
    } catch {
      // Invalid URL — use fallback
    }
  }

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
}
