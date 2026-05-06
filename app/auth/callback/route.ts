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

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
