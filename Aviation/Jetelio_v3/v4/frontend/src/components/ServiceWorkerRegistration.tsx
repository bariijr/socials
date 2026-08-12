"use client";

import { useEffect } from "react";

// Registers the app-shell service worker (public/sw.js) so the browser's
// PWA installability checks pass. See that file for what it does and
// doesn't cache — no API or page caching, network passthrough only.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a progressive enhancement — a failed
        // registration shouldn't be user-visible.
      });
    }
  }, []);

  return null;
}
