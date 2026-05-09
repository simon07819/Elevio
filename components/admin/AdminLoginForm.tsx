"use client";

import { useState, useTransition, useEffect } from "react";
import { LockKeyhole, LogIn, UserPlus, Apple } from "lucide-react";
import { signInAdmin, signUpAdmin } from "@/lib/authActions";
import { useAppleSignIn } from "@/hooks/useAppleSignIn";
import { isCapacitorNative } from "@/lib/platform";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export function AdminLoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { signIn: handleApple, appleLoading, appleError } = useAppleSignIn();
  const [isNative, setIsNative] = useState(false);
  useEffect(() => { setIsNative(isCapacitorNative()); }, []);
  const { t } = useLanguage();

  const action = mode === "signin" ? signInAdmin : signUpAdmin;

  return (
    <section className="mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-white/10 p-5 text-white shadow-2xl backdrop-blur">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-yellow-300 text-slate-950">
          <LockKeyhole />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">{t("login.eyebrow")}</p>
          <h1 className="text-3xl font-black">{mode === "signin" ? t("login.signIn") : t("login.signUp")}</h1>
        </div>
      </div>

      <form
        action={(formData) => {
          startTransition(async () => {
            const result = await action(formData);
            if (result) {
              setMessage(result.message);
              setSuccess(Boolean(result.ok));
            }
          });
        }}
        className="grid gap-3"
      >
        {mode === "signup" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="firstName"
                required
                placeholder={t("profile.firstName")}
                className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
              />
              <input
                name="lastName"
                required
                placeholder={t("profile.lastName")}
                className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
              />
            </div>
            <input
              name="company"
              required
              placeholder={t("profile.company")}
              className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
            />
            <input
              name="phone"
              required
              type="tel"
              placeholder={t("profile.phone")}
              className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
            />
          </>
        )}
        <input
          name="email"
          type="email"
          required
          placeholder={t("login.email")}
          className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
        />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder={t("login.password")}
          className="rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 outline-none"
        />
        <button
          disabled={isPending}
          className="touch-target mt-2 flex items-center justify-center gap-2 rounded-2xl bg-yellow-300 px-5 py-4 text-lg font-black text-slate-950 disabled:opacity-60"
        >
          {mode === "signin" ? <LogIn size={20} /> : <UserPlus size={20} />}
          {isPending ? t("login.wait") : mode === "signin" ? t("login.signInButton") : t("login.signUpButton")}
        </button>
      </form>

      {/* Apple Sign-In — native iOS only */}
      {isNative && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-white/15" />
            <span className="text-xs font-black uppercase text-slate-500">ou</span>
            <div className="h-px flex-1 bg-white/15" />
          </div>
          <button
            type="button"
            onClick={handleApple}
            disabled={appleLoading || isPending}
            className="touch-target flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-base font-black text-slate-950 transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
          >
            <Apple size={20} />
            {appleLoading ? "Connexion…" : "Continuer avec Apple"}
          </button>
        </div>
      )}

      {isNative && appleError && (
        <div className="mt-4 rounded-2xl bg-red-500/15 p-3 text-sm font-bold text-red-100">
          {appleError}
        </div>
      )}

      {(message && !appleError) && (
        <div className={success ? "mt-4 rounded-2xl bg-emerald-400/15 p-3 text-sm font-bold text-emerald-100" : "mt-4 rounded-2xl bg-red-500/15 p-3 text-sm font-bold text-red-100"}>
          {message}
          {success && mode === "signup" && (
            <p className="mt-2 text-xs text-emerald-50">
              {t("login.checkEmail")}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setSuccess(false);
          setMode((current) => (current === "signin" ? "signup" : "signin"));
        }}
        className="mt-4 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-slate-100"
      >
        {mode === "signin" ? t("login.createAdmin") : t("login.hasAccount")}
      </button>
    </section>
  );
}
