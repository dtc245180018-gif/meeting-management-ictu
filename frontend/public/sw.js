const CACHE_NAME = "ictu-meeting-v9";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/assets/ICTU.png",
  "/assets/ICTU-192.png",
  "/assets/ICTU-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async (response) => {
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/", copy);
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) {
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, copy);
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
