import { AppShell } from "@/components/AppShell";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { T } from "@/components/i18n/LanguageProvider";
import { getCurrentProfile, getCurrentUser, requireUser } from "@/lib/auth";

export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  // During onboarding, the user may not have an active subscription yet.
  // Use requireUser() (auth-only) instead of requireAdmin() (auth+subscription).
  const onboarding = (await searchParams).onboarding === "1";
  const user = onboarding ? await requireUser() : (await getCurrentUser());
  if (!user) {
    return null;
  }
  const profile = await getCurrentProfile();

  const userEmail = user.email ?? "";
  const userRole = profile?.account_role ?? "operator";

  if (!profile) {
    return (
      <AppShell userEmail={userEmail} userRole={userRole} eyebrow={<T k="profile.eyebrow" />} title={<T k="profile.unavailableTitle" />} subtitle={<T k="profile.unavailableSubtitle" />}>
        <div className="glass-panel rounded-[2rem] p-5 text-sm font-bold text-slate-300">
          <T k="profile.unavailableBody" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      userEmail={userEmail}
      userRole={userRole}
      eyebrow={<T k="profile.eyebrow" />}
      title={<T k="profile.title" />}
      subtitle={<T k="profile.subtitle" />}
    >
      <AdminProfileForm profile={profile} onboarding={onboarding} />
    </AppShell>
  );
}
