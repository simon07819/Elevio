"use client";

import type { ReactNode } from "react";
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

function QrSheetHeader({ requestTitle, projectName, address }: { requestTitle: string; projectName: string; address: string }) {
  return (
    <header className="overflow-hidden border-b border-slate-200 bg-white print:border-slate-300">
      <div className="p-4 pb-3 sm:p-5 sm:pb-4 print:p-3 print:pb-2">
        <div className="space-y-1 text-balance break-words px-1 text-center sm:space-y-1.5 sm:px-0 print:space-y-0.5">
          <h3 className="text-xl font-black leading-snug tracking-tight text-slate-950 print:text-lg print:leading-tight">{requestTitle}</h3>
          <p className="text-lg font-black leading-snug text-slate-900 print:text-base">{projectName}</p>
          <p className="text-sm font-semibold leading-snug text-slate-600 print:text-xs">{address.trim() || "—"}</p>
        </div>
      </div>
    </header>
  );
}

function QrSheetFooterBranding({
  companyLogoUrl,
  projectLogoUrl,
}: {
  companyLogoUrl?: string | null;
  projectLogoUrl?: string | null;
}) {
  const hasClientLogos = Boolean(companyLogoUrl || projectLogoUrl);

  const outerClass =
    "qr-sheet-brand-footer mt-2 flex w-full flex-col items-center border-t border-slate-200 px-2 pt-2 sm:mt-3 sm:px-3 sm:pt-3 print:mt-1 print:px-2 print:pt-2";

  const rowClass =
    "qr-brand-footer-row inline-flex max-w-full flex-nowrap items-center justify-center gap-3 sm:gap-6 print:gap-4";

  const slotClass =
    "flex h-9 w-20 shrink-0 items-center justify-center sm:h-11 sm:w-[6.5rem] md:w-28 print:h-9 print:w-[5.25rem]";

  const imgInSlot = "qr-brand-logo-img max-h-full max-w-full object-contain";

  const elevioSoloClass =
    "h-8 max-h-9 w-auto max-w-[min(85%,220px)] print:h-8 print:max-h-[2rem] print:max-w-[min(75%,200px)]";

  if (!hasClientLogos) {
    return (
      <div className={outerClass}>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-print.svg" alt="" className={elevioSoloClass} />
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
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

function QrFloorPoster({
  floor,
  project,
  qrDataUrl,
  requestTitle,
  youAreAtText,
  floorHeadingText,
  withoutCameraHeading,
  instructions,
  companyLogoUrl,
  projectLogoUrl,
  printFloorId,
  onPrintFloor,
  onePageLabel,
  printOneLabel,
}: {
  floor: Floor;
  project: Project;
  qrDataUrl?: string;
  requestTitle: string;
  youAreAtText: string;
  floorHeadingText: string;
  withoutCameraHeading: string;
  instructions: ReactNode;
  companyLogoUrl?: string | null;
  projectLogoUrl?: string | null;
  printFloorId: string | null;
  onPrintFloor: (floorId: string) => void;
  onePageLabel: string;
  printOneLabel: string;
}) {
  return (
    <article
      data-floor-id={floor.id}
      data-print-selected={printFloorId === floor.id ? "true" : undefined}
      className="qr-floor-poster min-w-0 max-w-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-lg print:rounded-none print:shadow-none"
    >
      <QrSheetHeader requestTitle={requestTitle} projectName={project.name} address={project.address ?? ""} />

      <div className="grid min-w-0 place-items-center bg-slate-50 p-3 text-center sm:p-5 print:p-2 print:pb-2">
        <p className="break-words px-1 text-xs font-black uppercase tracking-[0.22em] text-slate-500 sm:text-sm print:text-[10px] print:leading-tight">
          {youAreAtText}
        </p>
        <p className="mt-1 max-w-full break-words px-1 text-3xl font-black leading-none sm:mt-2 sm:text-5xl print:mt-1 print:text-4xl">
          {floorHeadingText}
        </p>
        <div className="my-3 box-border max-w-full rounded-2xl border-4 border-slate-950 bg-white p-2 sm:my-4 sm:p-3 print:my-2 print:border-[3px] print:p-1.5">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR ${formatFloorLabel(floor)}`}
              className="mx-auto aspect-square w-[min(100%,10rem)] max-w-full sm:w-40 print:w-[9rem]"
            />
          ) : (
            <div className="mx-auto aspect-square w-[min(100%,10rem)] max-w-full animate-pulse rounded-2xl bg-slate-200 sm:w-40 print:w-[9rem]" />
          )}
        </div>
        <div className="w-full max-w-full min-w-0 rounded-2xl bg-slate-950 p-2 text-white sm:p-3 print:p-2">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300 sm:text-xs print:text-[9px]">
            {withoutCameraHeading}
          </p>
          <p className="mt-1 break-all rounded-xl bg-white px-2 py-2 font-mono text-xl font-black tracking-[0.08em] text-slate-950 sm:mt-2 sm:px-3 sm:text-3xl sm:tracking-[0.12em] print:mt-1 print:py-1.5 print:text-2xl print:tracking-[0.1em]">
            {floor.access_code}
          </p>
        </div>
        <div className="mt-2 w-full max-w-full min-w-0 rounded-2xl bg-yellow-100 p-2 sm:mt-3 sm:p-3 print:mt-2 print:p-2">
          <div className="qr-poster-instructions print:text-[10px] print:leading-snug [&_li]:print:text-[10px] [&_ol]:print:gap-1 [&_p]:print:text-[9px]">
            {instructions}
          </div>
        </div>
        <QrSheetFooterBranding companyLogoUrl={companyLogoUrl} projectLogoUrl={projectLogoUrl} />
      </div>

      <div className="bg-yellow-100 p-3 text-sm font-black text-slate-950 sm:p-4 print:p-2 print:text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{onePageLabel}</span>
          <button
            type="button"
            onClick={() => onPrintFloor(floor.id)}
            className="no-print rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-yellow-300"
          >
            <Printer className="mr-1 inline" size={14} />
            {printOneLabel}
          </button>
        </div>
      </div>
    </article>
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
        <div
          className={
            compact
              ? "mt-3 grid min-w-0 gap-3 text-left text-xs font-bold sm:grid-cols-2 print:mt-2 print:grid-cols-1 print:gap-2 print:[&>div]:p-2"
              : "mt-4 grid gap-4 text-left text-base font-bold md:grid-cols-2"
          }
        >
          {(["fr", "en"] as const).map((locale) => (
            <div key={locale} className="min-w-0 overflow-hidden rounded-2xl bg-white px-3 py-3 sm:px-4">
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
        <p
          className={
            compact
              ? "mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-black"
              : "mt-4 rounded-2xl bg-white px-4 py-3 text-base font-black"
          }
        >
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
      className="qr-print-sheet w-full max-w-full min-w-0 rounded-[2rem] bg-white px-3 py-4 text-slate-950 shadow-2xl sm:p-5 print:rounded-none print:p-0 print:shadow-none"
      data-print-floor-id={printFloorId ?? undefined}
      data-print-bw={printBlackWhite ? "true" : undefined}
    >
      <div className="no-print mb-5 flex flex-col gap-3 rounded-[1.5rem] bg-slate-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">Administration QR</p>
          <h2 className="text-2xl font-black">{t("qr.title")}</h2>
          <p className="mt-1 text-sm text-slate-300">{t("qr.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
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
      {message ? (
        <div className="no-print mb-5 rounded-2xl bg-emerald-100 p-3 text-sm font-black text-emerald-900">{message}</div>
      ) : null}

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
      </div>

      <div
        className={`qr-poster-grid grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 transition-[filter] duration-300 ease-out ${printBlackWhite ? "grayscale" : ""}`}
      >
        {floors.map((floor) => (
          <QrFloorPoster
            key={floor.id}
            floor={floor}
            project={project}
            qrDataUrl={codes[floor.id]}
            requestTitle={sheetText("qr.requestTitle")}
            youAreAtText={sheetText("qr.youAreAt")}
            floorHeadingText={sheetText("qr.floor", { floor: formatFloorLabel(floor) })}
            withoutCameraHeading={sheetText("qr.withoutCamera")}
            instructions={<SheetInstructions compact />}
            companyLogoUrl={companyLogoUrl}
            projectLogoUrl={projectLogoUrl}
            printFloorId={printFloorId}
            onPrintFloor={printFloor}
            onePageLabel={t("qr.onePage")}
            printOneLabel={t("qr.printOne")}
          />
        ))}
      </div>
    </section>
  );
}
