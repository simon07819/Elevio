"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * When running inside the Capacitor native shell (iOS/Android),
 * redirect from the web landing page to the mobile welcome screen.
 *
 * Detection: window.Capacitor.isNativePlatform() returns true
 * when the JS is running inside Capacitor's WebView.
 *
 * Returns: { ready: boolean } — caller should render nothing until ready.
 */
export function useCapacitorRedirect() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isNative =
      typeof window !== "undefined" &&
      typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === "function" &&
      (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();

    if (isNative) {
      router.replace("/welcome");
      // Don't set ready — keep showing nothing while redirect happens
      return;
    }

    setReady(true);
  }, [router]);

  return { ready };
}
