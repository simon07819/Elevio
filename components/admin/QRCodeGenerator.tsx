"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link as LinkIcon, Mail, Printer, Share2 } from "lucide-react";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { translations, type Locale, type TranslationKey } from "@/lib/i18n";
import { formatFloorLabel, makeQrUrl } from "@/lib/utils";
import type { Floor, Project } from "@/types/hoist";

type SheetLanguage = Locale | "both";

const instructionKeys: TranslationKey[] = ["qr.step1", "qr.step2", "qr.step3", "qr.step4"];

function interpolate(text: string, values?: Record<string, string | number>) {
  let result = text;

  for (const [key, value] of Object.entries(values ?? {})) {
    result = result.replaceAll(`{${key}}`, String(value));
  }

  return result;
}

function tr(locale: Locale, key: TranslationKey, values?: Record<string, string | number>) {
  return interpolate(translations[locale][key] ?? translations.fr[key] ?? key, values);
}

function QrSheetHeader({
  variant,
  requestTitle,
  projectName,
  address,
}: {
  variant: "card" | "print";
  requestTitle: string;
  projectName: string;
  address: string;
}) {
  const isCard = variant === "card";

  const titleClass = isCard ? "text-xl font-black leading-snug tracking-tight text-slate-950" : "text-2xl font-black leading-tight tracking-tight text-slate-950";
  const projectClass = isCard ? "text-lg font-black leading-snug text-slate-900" : "text-xl font-black leading-snug text-slate-900";
  const addressClass = isCard ? "text-sm font-semibold leading-snug text-slate-600" : "text-sm font-semibold leading-snug text-slate-600";

  return (
    <header
      className={
        isCard
          ? "overflow-hidden border-b border-slate-200 bg-white"
          : "qr-page-header border-b border-slate-900 pb-4"
      }
    >
      <div className={isCard ? "p-5 pb-4" : ""}>
        <div className="space-y-1.5 text-center text-balance">
          {isCard ? (
            <h3 className={titleClass}>{requestTitle}</h3>
          ) : (
            <h1 className={titleClass}>{requestTitle}</h1>
          )}
          <p className={projectClass}>{projectName}</p>
          <p className={addressClass}>{address.trim() || "—"}</p>
        </div>
      </div>
    </header>
  );
}

function QrSheetFooterBranding({
  companyLogoUrl,
  projectLogoUrl,
  variant,
}: {
  companyLogoUrl?: string | null;
  projectLogoUrl?: string | null;
  variant: "card" | "print";
}) {
  const hasClientLogos = Boolean(companyLogoUrl || projectLogoUrl);

  const isPrint = variant === "print";

  /** Bloc centré sur la page : rangée en inline-flex + slots largeur fixe (pas en % de toute la ligne). */
  const outerClass = "mt-3 flex w-full flex-col items-center border-t border-slate-200 px-3 pt-3";

  const rowClass = isPrint
    ? "qr-brand-footer-row qr-brand-footer-row--print inline-flex max-w-full flex-nowrap items-center justify-center gap-5 print:gap-7"
    : "qr-brand-footer-row inline-flex max-w-full flex-nowrap items-center justify-center gap-4 sm:gap-6";

  const slotClass = isPrint
    ? "flex h-[3.25rem] w-[7rem] shrink-0 items-center justify-center sm:w-[7.5rem] print:h-[3.5rem] print:w-[7.5rem]"
    : "flex h-11 w-[6.5rem] shrink-0 items-center justify-center sm:w-28";

  const imgInSlot = "qr-brand-logo-img max-h-full max-w-full object-contain";

  const elevioSoloClass = isPrint
    ? "h-10 max-h-11 w-auto max-w-[min(88%,260px)] print:h-11"
    : "h-8 max-h-9 w-auto max-w-[min(85%,220px)] print:h-9";

  if (!hasClientLogos) {
    return (
      <div className={`qr-sheet-brand-footer ${outerClass}`}>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-print.svg" alt="" className={elevioSoloClass} />
        </div>
      </div>
    );
  }

  return (
    <div className={`qr-sheet-brand-footer ${outerClass}`}>
      <div className={rowClass}>
        <div className={slotClass}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-print.svg" alt="" className={imgInSlot} />
        </div>
        <div className={slotClass}>
          {companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companyLogoUrl} alt="" className={imgInSlot} />
          ) : null}
        </div>
        <div className={slotClass}>
          {projectLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={projectLogoUrl} alt="" className={imgInSlot} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
export function QRCodeGenerator({
  project,
  floors,
  companyLogoUrl,
  projectLogoUrl,
}: {
  project: Project;
  floors: Floor[];
  companyLogoUrl?: string | null;
  projectLogoUrl?: string | null;
}) {
  const { t } = useLanguage();
  const [origin] = useState(() =>
    typeof window === "undefined" ? "https://elevio.app" : window.location.origin,
  );
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [printFloorId, setPrintFloorId] = useState<string | null>(null);
  const [sheetLanguage, setSheetLanguage] = useState<SheetLanguage>("both");
  const [printBlackWhite, setPrintBlackWhite] = useState(false);
  const bundleUrl = `${origin}/admin/qrcodes?projectId=${encodeURIComponent(project.id)}`;

  function sheetText(key: TranslationKey, values?: Record<string, string | number>) {
    if (sheetLanguage === "both") {
      return `${tr("fr", key, values)} / ${tr("en", key, values)}`;
    }

    return tr(sheetLanguage, key, values);
  }

  function SheetInstructions({ compact = false }: { compact?: boolean }) {
    if (sheetLanguage === "both") {
      return (
        <div className={compact ? "mt-3 grid gap-3 text-left text-xs font-bold sm:grid-cols-2" : "mt-4 grid gap-4 text-left text-base font-bold md:grid-cols-2"}>
          {(["fr", "en"] as const).map((locale) => (
            <div key={locale} className="rounded-2xl bg-white px-4 py-3">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                {locale === "fr" ? "Français" : "English"}
              </p>
              <ol className="grid gap-2">
                {instructionKeys.map((key) => (
                  <li key={key}>{tr(locale, key)}</li>
                ))}
              </ol>
              <p className="mt-3 rounded-xl bg-yellow-50 px-3 py-2 text-xs font-black">
                {tr(locale, "qr.noCameraHelp")}
              </p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <>
        <ol className={compact ? "mt-3 grid gap-2 text-left text-xs font-bold" : "mt-4 grid gap-3 text-xl font-bold"}>
          {instructionKeys.map((key) => (
            <li key={key}>{sheetText(key)}</li>
          ))}
        </ol>
        <p className={compact ? "mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-black" : "mt-4 rounded-2xl bg-white px-4 py-3 text-base font-black"}>
          {sheetText("qr.noCameraHelp")}
        </p>
      </>
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function buildCodes() {
      const entries = await Promise.all(
        floors.map(async (floor) => [
          floor.id,
          await QRCode.toDataURL(makeQrUrl(origin, project.id, floor.qr_token), {
            margin: 1,
            width: 200,
            color: { dark: "#05070A", light: "#FFFFFF" },
          }),
        ]),
      );

      if (!cancelled) {
        setCodes(Object.fromEntries(entries));
      }
    }

    buildCodes();
    return () => {
      cancelled = true;
    };
  }, [floors, origin, project.id]);

  async function shareBundle() {
    const text = t("qr.shareText", { project: project.name });

    if (navigator.share) {
      await navigator.share({
        title: t("qr.emailSubject", { project: project.name }),
        text,
        url: bundleUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(bundleUrl);
    setMessage(t("qr.linkCopied"));
  }

  async function copyBundleLink() {
    await navigator.clipboard.writeText(bundleUrl);
    setMessage(t("qr.linkCopied"));
  }

  function emailBundle() {
    const subject = encodeURIComponent(t("qr.emailSubject", { project: project.name }));
    const body = encodeURIComponent(t("qr.emailBody", { project: project.name, url: bundleUrl }));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function printFloor(floorId: string) {
    setPrintFloorId(floorId);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrintFloorId(null), 500);
    }, 50);
  }

  return (
    <section
      className="qr-print-sheet rounded-[2rem] bg-white p-5 text-slate-950 shadow-2xl print:rounded-none print:p-0 print:shadow-none"
      data-print-floor-id={printFloorId ?? undefined}
      data-print-bw={printBlackWhite ? "true" : undefined}
    >
      <div className="no-print mb-5 flex flex-col gap-3 rounded-[1.5rem] bg-slate-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">Administration QR</p>
          <h2 className="text-2xl font-black">{t("qr.title")}</h2>
          <p className="mt-1 text-sm text-slate-300">
            {t("qr.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.print()}
            className="touch-target rounded-2xl bg-yellow-300 px-5 py-4 text-lg font-black text-slate-950"
          >
            <Printer className="inline" /> {t("qr.printAll")}
          </button>
          <button
            type="button"
            onClick={shareBundle}
            className="touch-target rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-lg font-black text-white"
          >
            <Share2 className="inline" /> {t("qr.share")}
          </button>
          <button
            type="button"
            onClick={emailBundle}
            className="touch-target rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-lg font-black text-white"
          >
            <Mail className="inline" /> {t("qr.email")}
          </button>
          <button
            type="button"
            onClick={copyBundleLink}
            className="touch-target rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-lg font-black text-white"
          >
            <LinkIcon className="inline" /> {t("qr.copyLink")}
          </button>
        </div>
      </div>
      {message && <div className="no-print mb-5 rounded-2xl bg-emerald-100 p-3 text-sm font-black text-emerald-900">{message}</div>}

      <div className="no-print mb-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{t("qr.sheetLanguage")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ["fr", t("qr.sheetFr")],
            ["en", t("qr.sheetEn")],
            ["both", t("qr.sheetBoth")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSheetLanguage(value as SheetLanguage)}
              className={
                sheetLanguage === value
                  ? "rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-yellow-300"
                  : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm">
          <input
            type="checkbox"
            checked={printBlackWhite}
            onChange={(event) => setPrintBlackWhite(event.target.checked)}
            className="mt-1 size-5 shrink-0 rounded border-slate-300 accent-slate-950"
          />
          <span>
            <span className="block text-sm font-black text-slate-900">{t("qr.printBlackWhite")}</span>
            <span className="mt-0.5 block text-xs font-bold leading-snug text-slate-600">{t("qr.printBlackWhiteHint")}</span>
          </span>
        </label>
      </div>

      <div className="no-print mb-5">
        <div className="mb-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{t("qr.previewTitle")}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">{t("qr.previewBody")}</p>
        </div>
        <div
          className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 transition-[filter] duration-300 ease-out ${printBlackWhite ? "grayscale" : ""}`}
        >
          {floors.map((floor) => (
            <article key={floor.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-lg">
              <QrSheetHeader
                variant="card"
                requestTitle={sheetText("qr.requestTitle")}
                projectName={project.name}
                address={project.address ?? ""}
              />

              <div className="grid place-items-center bg-slate-50 p-5 text-center">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-slate-500">{sheetText("qr.youAreAt")}</p>
                <p className="mt-2 text-5xl font-black leading-none">
                  {sheetText("qr.floor", { floor: formatFloorLabel(floor) })}
                </p>
                <div className="my-5 rounded-2xl border-4 border-slate-950 bg-white p-3">
                  {codes[floor.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={codes[floor.id]} alt={`QR ${formatFloorLabel(floor)}`} className="size-40" />
                  ) : (
                    <div className="size-40 animate-pulse rounded-2xl bg-slate-200" />
                  )}
                </div>
                <div className="w-full rounded-2xl bg-slate-950 p-3 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">{sheetText("qr.withoutCamera")}</p>
                  <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-3xl font-black tracking-[0.12em] text-slate-950">
                    {floor.access_code}
                  </p>
                </div>
                <div className="mt-4 w-full rounded-2xl bg-yellow-100 p-3">
                  <SheetInstructions compact />
                </div>
                <QrSheetFooterBranding variant="card" companyLogoUrl={companyLogoUrl} projectLogoUrl={projectLogoUrl} />
              </div>

              <div className="bg-yellow-100 p-4 text-sm font-black text-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{t("qr.onePage")}</span>
                  <button
                    type="button"
                    onClick={() => printFloor(floor.id)}
                    className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-yellow-300"
                  >
                    <Printer className="mr-1 inline" size={14} />
                    {t("qr.printOne")}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="qr-pages">
        {floors.map((floor) => (
          <article
            key={floor.id}
            data-floor-id={floor.id}
            data-print-selected={printFloorId === floor.id ? "true" : undefined}
            className="qr-sheet-print qr-page bg-white text-slate-950"
          >
            <QrSheetHeader
              variant="print"
              requestTitle={sheetText("qr.requestTitle")}
              projectName={project.name}
              address={project.address ?? ""}
            />

            <main className="qr-page-body grid place-items-center py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{sheetText("qr.youAreAt")}</p>
              <h2 className="mt-1 text-6xl font-black leading-none">{sheetText("qr.floor", { floor: formatFloorLabel(floor) })}</h2>
              <div className="my-3 rounded-2xl border-4 border-slate-950 bg-white p-3">
                {codes[floor.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={codes[floor.id]} alt={`QR ${formatFloorLabel(floor)}`} className="mx-auto size-48" />
                ) : (
                  <div className="mx-auto size-48 animate-pulse rounded-2xl bg-slate-200" />
                )}
              </div>
              <div className="mt-2 w-full max-w-xl rounded-2xl border-4 border-slate-950 bg-slate-950 px-4 py-3 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">
                  {sheetText("qr.withoutCamera")}
                </p>
                <p className="mt-1 text-xs font-black leading-snug">
                  {sheetText("qr.withoutCameraBody")}
                </p>
                <p className="mt-2 rounded-xl bg-white px-4 py-2 font-mono text-4xl font-black tracking-[0.12em] text-slate-950">
                  {floor.access_code}
                </p>
              </div>
            </main>

            <section className="qr-page-instructions mt-2 rounded-xl bg-yellow-100 px-3 py-3">
              <h3 className="text-lg font-black leading-tight text-slate-950">{sheetText("qr.howTitle")}</h3>
              <SheetInstructions compact />
            </section>

            <footer className="qr-page-footer mt-3 rounded-xl bg-slate-950 px-4 py-3 text-center text-white">
              <p className="text-base font-black leading-tight">{sheetText("qr.important")}</p>
              <p className="mt-1 text-xs font-bold leading-snug">
                {sheetText("qr.importantBody")}
              </p>
            </footer>

            <QrSheetFooterBranding variant="print" companyLogoUrl={companyLogoUrl} projectLogoUrl={projectLogoUrl} />
          </article>
        ))}
      </div>
    </section>
  );
}
