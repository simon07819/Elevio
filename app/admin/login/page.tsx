import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { T } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminLoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/admin/projects");
  }

  return (
    <main className="relative z-10 grid min-h-dvh place-items-center px-4 py-8">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full">
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
