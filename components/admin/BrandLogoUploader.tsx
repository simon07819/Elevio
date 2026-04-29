"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { removeBrandLogo, uploadBrandLogo, type BrandLogoKind } from "@/lib/brandUpload";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type Props = {
  kind: BrandLogoKind;
  projectId?: string;
  currentUrl: string | null;
  titleKey: "brand.companyTitle" | "brand.projectTitle" | "brand.siteTitle";
  bodyKey: "brand.companyBody" | "brand.projectBody" | "brand.siteBody";
  /** When false, formats + auto-upload hints stay outside (e.g. profile page). Default true for project site logo. */
  showHints?: boolean;
};

export function BrandLogoUploader({ kind, projectId, currentUrl, titleKey, bodyKey, showHints = true }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const showThumbnail = Boolean(currentUrl) && !isPending;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setMessage(null);

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);
    if (projectId) formData.set("projectId", projectId);

    startTransition(async () => {
      const result = await uploadBrandLogo(formData);
      setMessage(result.message);
      setSuccess(result.ok);
      if (result.ok) {
        router.refresh();
      }
    });

    input.value = "";
  }

  const bodyText = t(bodyKey).trim();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">{t(titleKey)}</p>
      {bodyText ? <p className="mt-1 text-sm font-bold text-slate-400">{bodyText}</p> : null}

      {showThumbnail || isPending ? (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/40">
          <div className="flex min-h-[112px] items-center justify-center p-3">
            {showThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUrl!} alt="" className="max-h-28 max-w-full object-contain" />
            ) : null}
          </div>
          {isPending ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 backdrop-blur-[2px]"
              aria-busy="true"
            >
              <Loader2 className="size-8 animate-spin text-yellow-300" aria-hidden />
              <span className="text-xs font-black text-white">{t("brand.uploading")}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <label
        className={`${showThumbnail || isPending ? "mt-3" : "mt-4"} flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15`}
      >
        <Upload size={18} aria-hidden />
        <span>{t("brand.chooseFile")}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={isPending}
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>

      {currentUrl ? (
        <div className="mt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const result = await removeBrandLogo(kind, projectId);
                setMessage(result.message);
                setSuccess(result.ok);
                if (result.ok) {
                  router.refresh();
                }
              });
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-400/30 px-4 py-2 text-xs font-black text-red-200 hover:bg-red-500/10 disabled:opacity-60"
          >
            <Trash2 size={16} aria-hidden />
            {t("brand.remove")}
          </button>
        </div>
      ) : null}

      {showHints ? (
        <div className="mt-3">
          <p className="text-[11px] leading-snug font-medium text-slate-400/85">{t("brand.formatsHelp")}</p>
          <p className="mt-1 text-[11px] leading-snug font-medium text-slate-500/70">{t("brand.autoUploadHint")}</p>
          <div className="mt-3 border-t border-white/10" aria-hidden />
        </div>
      ) : null}

      {message && (
        <p className={`mt-3 text-xs font-bold ${success ? "text-emerald-200" : "text-red-200"}`}>{message}</p>
      )}
    </div>
  );
}
