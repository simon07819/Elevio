/**
 * Lit et valide NEXT_PUBLIC_SUPABASE_* pour éviter les crashs
 * ("Invalid supabaseUrl") si la valeur Vercel est mal collée (espaces, sans https, etc.).
 */
export function getSupabasePublicEnv(): { url: string; anonKey: string } | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !anonKey) {
    return null;
  }

  let candidate = rawUrl;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const url = parsed.href.replace(/\/$/, "");
    return { url, anonKey };
  } catch {
    return null;
  }
}
