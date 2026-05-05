import { AppShell } from "@/components/AppShell";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { T } from "@/components/i18n/LanguageProvider";
import { getCurrentProfile, requireAdmin } from "@/lib/auth";

export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { user, profile: adminProfile } = await requireAdmin();
  const profile = await getCurrentProfile();
  const onboarding = (await searchParams).onboarding === "1";

  if (!profile) {
    return (
      <AppShell userEmail={user.email} userRole={adminProfile.account_role} eyebrow={<T k="profile.eyebrow" />} title={<T k="profile.unavailableTitle" />} subtitle={<T k="profile.unavailableSubtitle" />}>
        <div className="glass-panel rounded-[2rem] p-5 text-sm font-bold text-slate-300">
          <T k="profile.unavailableBody" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      userEmail={user.email}
      userRole={adminProfile.account_role}
      eyebrow={<T k="profile.eyebrow" />}
      title={<T k="profile.title" />}
      subtitle={<T k="profile.subtitle" />}
    >
      <AdminProfileForm profile={profile} onboarding={onboarding} />
    </AppShell>
  );
}
