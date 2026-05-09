"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Back navigation button.
 * - Uses router.back() if there's browser history
 * - Falls back to "/" (QR home) if on root entry
 * - Hidden on mobile: iOS has native swipe-back, Capacitor has hardware back
 * - Only shown on sm+ screens where no native back exists
 */
export function BackButton({ fallback = "/" }: { fallback?: string } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const isRoot = pathname === "/" || pathname === "/scan";

  if (isRoot) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // If we can go back in history, do it; otherwise go to fallback
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.97] touch-target"
      aria-label="Retour"
    >
      <ArrowLeft size={14} />
      <span>Retour</span>
    </button>
  );
}
