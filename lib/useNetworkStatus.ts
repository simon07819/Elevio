"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Minimal network status hook.
 * - Tracks navigator.onLine + online/offline events
 * - Triggers immediate re-fetch callback when coming back online
 * - Uses ref for callback to prevent re-registering event listeners on every render
 */
export function useNetworkStatus(onBackOnline?: () => void) {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const wasOffline = useRef(false);
  const callbackRef = useRef(onBackOnline);

  useEffect(() => {
    callbackRef.current = onBackOnline;
  }, [onBackOnline]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        callbackRef.current?.();
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
  }, []);

  return online;
}
