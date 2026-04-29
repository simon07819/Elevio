import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AccountRole = "admin" | "superadmin";

export type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  account_role: AccountRole;
  created_at: string;
  updated_at: string;
  company_logo_url?: string | null;
  project_logo_url?: string | null;
};

export function superadminEmails() {
  return (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function roleForEmail(email?: string | null): AccountRole {
  return email && superadminEmails().includes(email.toLowerCase()) ? "superadmin" : "admin";
}

function metadataValue(metadata: User["user_metadata"], snakeKey: string, camelKey?: string) {
  return String(metadata[snakeKey] ?? (camelKey ? metadata[camelKey] : "") ?? "").trim();
}

export async function ensureProfileForUser(supabase: SupabaseClient, user: User) {
  const metadata = user.user_metadata ?? {};
  const email = user.email?.toLowerCase() ?? "";
  const accountRole = roleForEmail(email);
  const metadataProfile = {
    first_name: metadataValue(metadata, "first_name", "firstName"),
    last_name: metadataValue(metadata, "last_name", "lastName"),
    company: metadataValue(metadata, "company"),
    phone: metadataValue(metadata, "phone"),
  };

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    const profileUpdate = {
      email,
      account_role: accountRole,
      first_name: existingProfile.first_name || metadataProfile.first_name,
      last_name: existingProfile.last_name || metadataProfile.last_name,
      company: existingProfile.company || metadataProfile.company,
      phone: existingProfile.phone || metadataProfile.phone,
    };

    const { data } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id)
      .select("*")
      .single();

    return (data ?? existingProfile) as Profile;
  }

  const payload = {
    id: user.id,
    email,
    ...metadataProfile,
    account_role: accountRole,
  };

  await supabase.from("profiles").insert(payload);
  return payload;
}
