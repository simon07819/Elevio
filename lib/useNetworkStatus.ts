"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal network status hook.
 * - Tracks navigator.onLine + online/offline events
 * - Triggers immediate re-fetch callback when coming back online
 */
export function useNetworkStatus(onBackOnline?: () => void) {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const wasOffline = useRef(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        onBackOnline?.();
      }
    };
    const goOffline = () => {
      setOnline(false);
      wasOffline.current = true;
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [onBackOnline]);

  return online;
}
