// Minimal service worker — exists to satisfy PWA installability (Chrome
// requires a registered SW with a fetch handler before showing the native
// install prompt). Deliberately does NOT cache API responses or app pages:
// this is an operational tool where permit deadlines/verdicts must always
// be current, never served stale from a cache. Network passthrough only.

const SHELL_CACHE = "jetelio-shell-v1";
const SHELL_ASSETS = ["/icons/icon-192.png", "/icons/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Only ever serve the static icon/manifest shell from cache — everything
  // else (pages, /api/*) always goes to the network.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
