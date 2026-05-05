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
    // Redirect to the right workspace based on role
    if (profile?.account_role === "operator") {
      redirect("/operator");
    }
    redirect("/admin");
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-6 pb-10">
      <header className="mb-6 flex shrink-0 items-center justify-between gap-4">
        <BrandLogo size="sm" priority />
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
