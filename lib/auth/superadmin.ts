/**
 * Superadmin authentication — server-side only.
 *
 * Only one email is the global superadmin: simon@dsdconstruction.ca
 * This cannot be changed from the UI. Only via env var or code change.
 *
 * All /superadmin routes MUST call requireSuperAdmin() before rendering.
 */

import { getCurrentUser, getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile";

/** The canonical superadmin email (lowercase comparison) */
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL ?? "simon@dsdconstruction.ca").trim().toLowerCase();

/** Check if an email is the superadmin */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPERADMIN_EMAIL;
}

/** Check if a user object is the superadmin */
export function canAccessSuperAdmin(user: User | null): boolean {
  if (!user) return false;
  return isSuperAdminEmail(user.email);
}

/** Get the current user if they are superadmin, null otherwise */
export async function getCurrentSuperAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessSuperAdmin(user)) return null;
  return user;
}

/** Require superadmin — redirects to /admin/login if not authenticated, returns 403 if wrong user */
export async function requireSuperAdmin(): Promise<{ user: User; profile: Profile }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }
  if (!canAccessSuperAdmin(user)) {
    redirect("/admin/login");
  }
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/admin/login");
  }
  return { user, profile };
}
