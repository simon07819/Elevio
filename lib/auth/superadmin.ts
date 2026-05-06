/**
 * Superadmin authentication — server-side only.
 *
 * Primary check: profile.account_role === 'superadmin' (DB-backed).
 * Fallback: email match (bootstrap for pre-migration DBs).
 *
 * All /superadmin routes MUST call requireSuperAdmin() before rendering.
 */

import { getCurrentUser, getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";

/** The canonical superadmin email (lowercase comparison) — bootstrap fallback only */
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();

/** Check if an email is the superadmin (bootstrap fallback) */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
}

/** Check if a profile has the superadmin role (primary check) */
export function isSuperAdminProfile(profile?: Profile | null): boolean {
  if (!profile) return false;
  return profile.account_role === "superadmin";
}

/** Combined check: profile.role first, email fallback for bootstrap */
export function isSuperAdmin(profile?: Profile | null, email?: string | null): boolean {
  if (isSuperAdminProfile(profile)) return true;
  // Bootstrap fallback: if DB not yet migrated, allow by email
  if (isSuperAdminEmail(email)) return true;
  return false;
}

/** Check if a user object is the superadmin (legacy — prefer isSuperAdmin with profile) */
export function canAccessSuperAdmin(user: User | null, profile?: Profile | null): boolean {
  if (!user) return false;
  return isSuperAdmin(profile, user.email);
}

/** Get the current user if they are superadmin, null otherwise */
export async function getCurrentSuperAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getCurrentProfile();
  if (!canAccessSuperAdmin(user, profile)) return null;
  return user;
}

/** Require superadmin — redirects to /admin/login if not authenticated or not superadmin */
export async function requireSuperAdmin(): Promise<{ user: User; profile: Profile }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/admin/login");
  }
  if (!canAccessSuperAdmin(user, profile)) {
    redirect("/admin/login");
  }
  return { user, profile };
}
