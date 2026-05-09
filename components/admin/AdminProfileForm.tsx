"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Save } from "lucide-react";
import { BrandLogoUploader } from "@/components/admin/BrandLogoUploader";
import { signOutAdmin, updateCurrentProfile } from "@/lib/authActions";
import { isCapacitorNative } from "@/lib/platform";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import type { Profile } from "@/lib/profile";

export function AdminProfileForm({ profile, onboarding }: { profile: Profile; onboarding?: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();
  const router = useRouter();

  // After successful profile save during onboarding, redirect to pricing.
  // iOS: /app-pricing (RevenueCat IAP). Web: /paywall (Stripe).
  if (success && onboarding) {
    const target = isCapacitorNative() ? "/app-pricing" : "/paywall";
    router.push(target);
  }

  return (
    <section className="grid gap-5">
      {onboarding && (
        <div className="glass-panel rounded-[2rem] border border-yellow-300/40 bg-yellow-300/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("profile.onboardingEyebrow")}</p>
          <h2 className="mt-2 text-2xl font-black text-white">{t("profile.onboardingTitle")}</h2>
          <p className="mt-2 text-sm font-bold text-slate-300">{t("profile.onboardingBody")}</p>
          <div className="mt-4 max-w-xl grid gap-4">
            <BrandLogoUploader
              kind="company"
              currentUrl={profile.company_logo_url ?? null}
              titleKey="brand.companyTitle"
              bodyKey="brand.companyBody"
              showHints={false}
            />
          </div>
          <div className="mt-3">
            <p className="text-[11px] leading-snug font-medium text-slate-400/90">{t("brand.formatsHelp")}</p>
            <p className="mt-1 text-[11px] leading-snug font-medium text-slate-500/75">{t("brand.autoUploadHint")}</p>
            <div className="mt-3 border-t border-yellow-300/15" aria-hidden />
          </div>
        </div>
      )}

      <form
        action={(formData) => {
          startTransition(async () => {
            const result = await updateCurrentProfile(formData);
            setMessage(result.message);
            setSuccess(result.ok);
          });
        }}
        className="glass-panel rounded-[2rem] p-5"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("profile.eyebrow")}</p>
          <h2 className="text-2xl font-black text-white">{t("profile.editTitle")}</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">
            {t("profile.editBody")}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-black text-slate-200">
            {t("profile.firstName")}
            <input
              name="firstName"
              required
              defaultValue={profile.first_name}
              className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-200">
            {t("profile.lastName")}
            <input
              name="lastName"
              required
              defaultValue={profile.last_name}
              className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-200">
            {t("profile.company")}
            <input
              name="company"
              required
              defaultValue={profile.company}
              className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-slate-200">
            {t("profile.phone")}
            <input
              name="phone"
              required
              type="tel"
              defaultValue={profile.phone}
              className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
            />
          </label>
        </div>

        <label className="mt-3 grid gap-2 text-sm font-black text-slate-200">
          Email
          <input
            value={profile.email}
            readOnly
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 font-bold text-slate-300 outline-none"
          />
        </label>

        {!onboarding && (
          <div className="mt-6 border-t border-white/10 pt-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("profile.logosEyebrow")}</p>
            <p className="mt-1 text-sm font-bold text-slate-400">{t("profile.logosIntro")}</p>
            <div className="mt-4 max-w-xl grid gap-4">
              <BrandLogoUploader
                kind="company"
                currentUrl={profile.company_logo_url ?? null}
                titleKey="brand.companyTitle"
                bodyKey="brand.companyBody"
                showHints={false}
              />
            </div>
            <div className="mt-3">
              <p className="text-[11px] leading-snug font-medium text-slate-400/85">{t("brand.formatsHelp")}</p>
              <p className="mt-1 text-[11px] leading-snug font-medium text-slate-500/70">{t("brand.autoUploadHint")}</p>
              <div className="mt-3 border-t border-white/10" aria-hidden />
            </div>
          </div>
        )}

        {message && (
          <div className={success ? "mt-4 rounded-2xl bg-emerald-400/15 p-3 text-sm font-bold text-emerald-100" : "mt-4 rounded-2xl bg-red-500/15 p-3 text-sm font-bold text-red-100"}>
            {message}
          </div>
        )}

        <button
          disabled={isPending}
          className="touch-target mt-5 flex items-center justify-center gap-2 rounded-2xl bg-yellow-300 px-5 py-4 text-lg font-black text-slate-950 disabled:opacity-60"
        >
          <Save size={20} />
          {isPending ? t("profile.saving") : t("profile.save")}
        </button>
      </form>

      <aside className="glass-panel rounded-[2rem] p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">{t("profile.session")}</p>
        <h2 className="mt-1 text-2xl font-black text-white">{t("profile.activeSession")}</h2>
        <p className="mt-2 text-sm font-bold text-slate-400">
          {t("profile.sessionBody")}
        </p>
        <form action={signOutAdmin}>
          <button className="touch-target mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/30 bg-red-500/15 px-5 py-4 font-black text-red-100">
            <LogOut size={20} />
            {t("profile.signOut")}
          </button>
        </form>
      </aside>
    </section>
  );
}
