"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { signUpMobile } from "@/lib/mobileAuth";
import { ArrowLeft, ArrowRight, Building2, Check, HardHat, Crown, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = "account" | "company" | "role" | "plan" | "done";

const PLANS = [
  { id: "free", name: "Free", price: "0 $", desc: "1 chantier test, 1 opérateur" },
  { id: "starter", name: "Starter", price: "29 $/mois", desc: "1 chantier, 2 opérateurs, QR" },
  { id: "pro", name: "Pro", price: "79 $/mois", desc: "5 chantiers, opérateurs illimités", popular: true },
  { id: "enterprise", name: "Enterprise", price: "Sur mesure", desc: "Illimité, multi-sites, intégrations" },
];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Account fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Company fields
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [siteCount, setSiteCount] = useState("1");

  // Role
  const [role, setRole] = useState<"owner" | "admin" | "operator">("operator");

  // Plan
  const [planId, setPlanId] = useState("free");

  function canAdvance(): boolean {
    switch (step) {
      case "account":
        return firstName.length > 0 && lastName.length > 0 && email.length > 0 && password.length >= 6;
      case "company":
        return company.length > 0 && phone.length > 0;
      case "role":
        return true;
      case "plan":
        return true;
      default:
        return false;
    }
  }

  async function handleSignup() {
    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("firstName", firstName);
      formData.append("lastName", lastName);
      formData.append("email", email);
      formData.append("password", password);
      formData.append("company", company);
      formData.append("phone", phone);
      formData.append("role", role);
      formData.append("planId", planId);

      const result = await signUpMobile(formData);
      if (result.ok) {
        setStep("done");
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
    } catch {
      // redirect() throws — normal
    } finally {
      setLoading(false);
    }
  }

  const steps: Step[] = ["account", "company", "role", "plan", "done"];
  const stepIdx = steps.indexOf(step);

  return (
    <main className="flex min-h-dvh flex-col bg-slate-950 px-6 py-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        {stepIdx > 0 && step !== "done" ? (
          <button
            type="button"
            onClick={() => setStep(steps[stepIdx - 1])}
            className="touch-target rounded-2xl p-2 text-slate-400 hover:text-white"
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <Link href="/welcome" className="touch-target rounded-2xl p-2 text-slate-400 hover:text-white">
            <ArrowLeft size={22} />
          </Link>
        )}
        <BrandLogo size="sm" priority tone="light" />
        <div className="w-10" />
      </div>

      {/* Progress dots */}
      {step !== "done" && (
        <div className="mx-auto mt-6 flex gap-2">
          {steps.slice(0, 4).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i <= stepIdx ? "w-8 bg-yellow-400" : "w-4 bg-white/15"
              }`}
            />
          ))}
        </div>
      )}

      {/* Step content */}
      <div className="mt-8 flex-1">
        {step === "account" && (
          <div>
            <h1 className="text-2xl font-black">Votre compte</h1>
            <p className="mt-2 text-sm font-bold text-slate-400">
              Créez votre profil pour commencer.
            </p>
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Prénom</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400/50"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Nom</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400/50"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Courriel</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@compagnie.ca"
                  className="mt-1 w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-bold text-white placeholder:text-slate-600 outline-none focus:border-yellow-400/50"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6 caractères minimum"
                  className="mt-1 w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-bold text-white placeholder:text-slate-600 outline-none focus:border-yellow-400/50"
                  required
                  minLength={6}
                />
              </div>
            </div>
          </div>
        )}

        {step === "company" && (
          <div>
            <h1 className="text-2xl font-black">Votre entreprise</h1>
            <p className="mt-2 text-sm font-bold text-slate-400">
              Ces informations apparaîtront sur vos QR et vos chantiers.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Nom de la compagnie</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="DSD Construction inc."
                  className="mt-1 w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-bold text-white placeholder:text-slate-600 outline-none focus:border-yellow-400/50"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Téléphone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(514) 555-1234"
                  className="mt-1 w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-bold text-white placeholder:text-slate-600 outline-none focus:border-yellow-400/50"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Nombre de chantiers</label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {["1", "2-5", "6-20", "20+"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSiteCount(opt)}
                      className={`touch-target rounded-2xl px-3 py-3 text-sm font-black transition active:scale-[0.98] ${
                        siteCount === opt
                          ? "bg-yellow-400 text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "role" && (
          <div>
            <h1 className="text-2xl font-black">Votre rôle</h1>
            <p className="mt-2 text-sm font-bold text-slate-400">
              Comment utiliserez-vous Elevio ?
            </p>
            <div className="mt-6 space-y-3">
              {[
                { id: "owner" as const, icon: Crown, label: "Propriétaire", desc: "Gère l'entreprise et tous les chantiers" },
                { id: "admin" as const, icon: Building2, label: "Admin chantier", desc: "Gère un ou plusieurs chantiers" },
                { id: "operator" as const, icon: HardHat, label: "Opérateur", desc: "Conduit l'ascenseur sur le chantier" },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={`touch-target flex w-full items-center gap-4 rounded-3xl border p-5 text-left transition active:scale-[0.98] ${
                    role === r.id
                      ? "border-yellow-400/40 bg-yellow-400/5 ring-2 ring-yellow-400/20"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <r.icon size={28} className={role === r.id ? "text-yellow-400" : "text-slate-400"} />
                  <div className="flex-1">
                    <p className="text-base font-black">{r.label}</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-400">{r.desc}</p>
                  </div>
                  {role === r.id && <Check size={20} className="text-yellow-400" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "plan" && (
          <div>
            <h1 className="text-2xl font-black">Choisissez votre forfait</h1>
            <p className="mt-2 text-sm font-bold text-slate-400">
              Commencez gratuitement. Changez à tout moment.
            </p>
            <div className="mt-6 space-y-3">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  className={`touch-target relative flex w-full items-center gap-4 rounded-3xl border p-5 text-left transition active:scale-[0.98] ${
                    planId === plan.id
                      ? "border-yellow-400/40 bg-yellow-400/5 ring-2 ring-yellow-400/20"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[10px] font-black text-slate-950 uppercase">
                      Populaire
                    </span>
                  )}
                  <div className="flex-1">
                    <p className="text-base font-black">{plan.name}</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-400">{plan.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black">{plan.price}</p>
                  </div>
                  {planId === plan.id && <Check size={20} className="text-yellow-400" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="grid size-16 place-items-center rounded-3xl bg-emerald-400/15 text-emerald-400">
              <Check size={32} />
            </div>
            <h1 className="mt-6 text-2xl font-black">Compte créé !</h1>
            <p className="mt-3 text-sm font-bold text-slate-400">
              {message ?? "Vérifiez votre courriel pour confirmer votre accès."}
            </p>
            <Link
              href="/welcome"
              className="touch-target mt-8 rounded-2xl bg-yellow-400 px-8 py-4 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-[0.98]"
            >
              Se connecter
            </Link>
          </div>
        )}
      </div>

      {/* Message */}
      {message && step !== "done" && (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
          {message}
        </p>
      )}

      {/* Bottom CTA */}
      {step !== "done" && (
        <div className="mt-6 pb-6">
          {step === "plan" ? (
            <button
              type="button"
              onClick={handleSignup}
              disabled={loading || !canAdvance()}
              className="touch-target w-full rounded-2xl bg-yellow-400 px-6 py-4 text-base font-black text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? "Création en cours..." : "Créer mon compte"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(steps[stepIdx + 1])}
              disabled={!canAdvance()}
              className="touch-target flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-6 py-4 text-base font-black text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50 active:scale-[0.98]"
            >
              Continuer <ArrowRight size={18} />
            </button>
          )}
        </div>
      )}
    </main>
  );
}
