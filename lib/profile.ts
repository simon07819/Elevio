import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AccountRole = "passenger" | "operator" | "admin" | "superadmin";

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
  suspended?: boolean | null;
  suspended_reason?: string | null;
  suspended_at?: string | null;
};

export function superadminEmails() {
  const fromList = (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const single = (process.env.SUPERADMIN_EMAIL ?? "simon@dsdconstruction.ca").trim().toLowerCase();
  if (single && !fromList.includes(single)) {
    fromList.push(single);
  }
  return fromList;
}

export function roleForEmail(email?: string | null): AccountRole {
  return email && superadminEmails().includes(email.toLowerCase()) ? "superadmin" : "operator";
}

function metadataValue(metadata: User["user_metadata"], snakeKey: string, camelKey?: string) {
  return String(metadata[snakeKey] ?? (camelKey ? metadata[camelKey] : "") ?? "").trim();
}

export async function ensureProfileForUser(supabase: SupabaseClient, user: User) {
  const metadata = user.user_metadata ?? {};
  const email = user.email?.toLowerCase() ?? "";
  const emailRole = roleForEmail(email);
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
    // NEVER downgrade a role — DB is source of truth for account_role.
    // Only promote: email-based role can upgrade (e.g. new superadmin email),
    // but an existing superadmin/admin must never be demoted by email logic.
    const currentRole = existingProfile.account_role as AccountRole;
    const rolePriority: AccountRole[] = ["passenger", "operator", "admin", "superadmin"];
    const currentIdx = rolePriority.indexOf(currentRole);
    const emailIdx = rolePriority.indexOf(emailRole);
    const accountRole = emailIdx > currentIdx ? emailRole : currentRole;

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
    account_role: emailRole,
  };

  await supabase.from("profiles").insert(payload);
  return payload;
}
