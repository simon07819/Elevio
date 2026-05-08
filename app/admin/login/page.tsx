import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { BrandLogo } from "@/components/BrandLogo";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth";

export default async function AdminLoginPage() {
  const user = await getCurrentUser();

  if (user) {
    const profile = await getCurrentProfile();
    // Superadmins go to their workspace.
    if (profile?.account_role === "superadmin") {
      redirect("/superadmin");
    }
    // Admins go to the admin dashboard.
    if (profile?.account_role === "admin") {
      redirect("/admin");
    }
    // Operators go to the operator terminal (regardless of plan).
    // Free operators see an upgrade prompt there; no redirect loop.
    if (profile?.account_role === "operator") {
      redirect("/operator");
    }
    // Passengers and other roles: redirect to home scan page.
    // They don't have access to admin/operator areas.
    redirect("/");
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-6 pb-10">
      <header className="mb-6 flex shrink-0 items-center justify-between gap-4">
        <Link href="/" className="flex items-center">
          <BrandLogo size="sm" priority />
        </Link>
        <LanguageSwitcher />
      </header>
      <div className="flex flex-1 flex-col justify-center">
        <AdminLoginForm />
        <div className="mt-4 text-center">
          <Link href="/" className="text-sm font-black text-yellow-200">
            <T k="login.backScan" />
          </Link>
        </div>
      </div>
    </main>
  );
}
