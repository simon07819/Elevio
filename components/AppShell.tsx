import Link from "next/link";
import type { ReactNode } from "react";
import { AppNavigation } from "@/components/AppNavigation";
import { BrandLogo } from "@/components/BrandLogo";
import { BackButton } from "@/components/BackButton";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth";
import { isSuperAdmin, isSuperAdminProfile } from "@/lib/auth/superadmin";
import type { AccountRole } from "@/lib/profile";

export async function AppShell({
  children,
  eyebrow = "Elevio",
  title,
  subtitle,
  noPrintTitleSection,
  /** Pre-computed user email (avoids a second Supabase call if the page already fetched the user). */
  userEmail,
  /** Pre-computed account role from profile (primary source for superadmin check). */
  userRole,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  noPrintTitleSection?: boolean;
  userEmail?: string | null;
  userRole?: AccountRole | null;
}) {
  // Fallback: fetch profile + user only if role not provided
  let showSuperadmin = false;
  if (userRole) {
    showSuperadmin = userRole === "superadmin";
  } else {
    const profile = await getCurrentProfile();
    if (isSuperAdminProfile(profile)) {
      showSuperadmin = true;
    } else {
      // Bootstrap fallback: check email if DB not yet migrated
      const resolvedUser = userEmail ? null : await getCurrentUser();
      const email = userEmail ?? resolvedUser?.email ?? null;
      showSuperadmin = isSuperAdmin(profile, email);
    }
  }
  // Support link: only for operator/admin/superadmin (not passengers)
  const showSupport = userRole ? userRole !== "passenger" : showSuperadmin;

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl min-w-0 flex-col overflow-x-clip px-4 py-5 pb-20 sm:pb-16 lg:px-8">
      <header className="no-print mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center">
            <BrandLogo size="md" priority />
          </Link>
          <BackButton />
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <AppNavigation compact showSuperadmin={showSuperadmin} showSupport={showSupport} />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="no-print mb-5 flex flex-wrap gap-2 sm:hidden">
        <LanguageSwitcher />
      </div>

      {(title || subtitle) && (
        <section className={`mb-6 ${noPrintTitleSection ? "no-print" : ""}`}>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.32em] text-yellow-300">{eyebrow}</p>
          {title && <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">{title}</h1>}
          {subtitle && <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">{subtitle}</p>}
        </section>
      )}

      {children}

      <MobileBottomNav />
    </main>
  );
}
