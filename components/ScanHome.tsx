"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type BarcodeDetectorShape = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

function requestPathFromValue(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    const projectId = url.searchParams.get("projectId");
    const floorToken = url.searchParams.get("floorToken");

    if (!projectId || !floorToken) {
      return null;
    }

    return `/request?projectId=${encodeURIComponent(projectId)}&floorToken=${encodeURIComponent(floorToken)}`;
  } catch {
    return null;
  }
}

function normalizeAccessCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function ScanHome() {
  const { t } = useLanguage();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) {
      return;
    }

    let cancelled = false;
    let detector: BarcodeDetectorShape | null = null;

    async function start() {
      try {
        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorShape;
          }
        ).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setMessage(t("scan.unsupported"));
          setScanning(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

        async function tick() {
          if (cancelled || !videoRef.current || !detector) {
            return;
          }

          const results = await detector.detect(videoRef.current);
          const nextPath = results[0]?.rawValue ? requestPathFromValue(results[0].rawValue) : null;

          if (nextPath) {
            router.push(nextPath);
            return;
          }

          window.setTimeout(tick, 500);
        }

        tick();
      } catch {
        setMessage(t("scan.unsupported"));
        setScanning(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [router, scanning, t]);

  async function openManual() {
    const code = normalizeAccessCode(accessCode);

    if (!code) {
      setMessage(t("scan.unsupported"));
      return;
    }

    const response = await fetch(`/api/floor-code?code=${encodeURIComponent(code)}`);
    const result = (await response.json()) as { ok: boolean; path?: string };

    if (response.ok && result.path) {
      router.push(result.path);
      return;
    }

    setMessage(t("scan.codeNotFound"));
  }

  return (
    <main className="relative z-10 min-h-dvh px-4 py-5 text-white">
      <header className="mx-auto flex max-w-md items-center justify-between">
        <BrandLogo size="sm" priority />
        <LanguageSwitcher />
      </header>

      <section className="mx-auto mt-6 grid min-h-[calc(100dvh-7rem)] max-w-md content-center gap-4">
        <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
          <div className="inline-flex rounded-[1.4rem] border border-white/10 bg-slate-950/85 px-4 py-3 shadow-lg">
            <BrandLogo size="md" />
          </div>
          <h1 className="mt-5 text-4xl font-black leading-tight">{t("scan.title")}</h1>
          <p className="mt-3 text-base font-bold leading-7 text-slate-300">{t("scan.subtitle")}</p>

          {scanning && (
            <video
              ref={videoRef}
              muted
              playsInline
              className="mt-5 aspect-square w-full rounded-[1.5rem] border border-yellow-300/30 bg-slate-950 object-cover"
            />
          )}

          <button
            type="button"
            onClick={() => setScanning((current) => !current)}
            className="touch-target mt-5 flex w-full items-center justify-center gap-3 rounded-[1.5rem] bg-yellow-300 px-5 py-5 text-xl font-black text-slate-950"
          >
            <Camera size={24} />
            {scanning ? t("scan.stop") : t("scan.start")}
          </button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/15" />
            <span className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-yellow-200">
              {t("scan.or")}
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>

          <div className="mt-4 rounded-[1.5rem] bg-slate-950/70 p-4">
            <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{t("scan.manual")}</label>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
              placeholder={t("scan.placeholder")}
              className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none"
            />
            <button
              type="button"
              onClick={openManual}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 font-black text-white"
            >
              <KeyRound size={18} />
              {t("scan.open")}
            </button>
          </div>

          {message && <p className="mt-3 rounded-2xl bg-white/10 p-3 text-sm font-bold text-slate-200">{message}</p>}
        </div>

        <Link href="/admin/login" className="text-center text-sm font-black text-yellow-200">
          {t("scan.adminLogin")}
        </Link>
      </section>
    </main>
  );
}
