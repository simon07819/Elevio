import Link from "next/link";
import type { ReactNode } from "react";
import { AppNavigation } from "@/components/AppNavigation";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export function AppShell({
  children,
  eyebrow = "Elevio",
  title,
  subtitle,
  /** Masque titre/sous-titre à l’impression (ex. page Codes QR : n’imprimer que les affiches). */
  noPrintTitleSection,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  noPrintTitleSection?: boolean;
}) {
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl min-w-0 flex-col overflow-x-clip px-4 py-5 pb-16 sm:px-6 lg:px-8">
      <header className="no-print mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo size="md" priority />
        </Link>
        <div className="hidden items-center gap-3 sm:flex">
          <AppNavigation compact />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="no-print mb-5 flex flex-wrap gap-2 sm:hidden">
        <AppNavigation compact />
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
    </main>
  );
}
