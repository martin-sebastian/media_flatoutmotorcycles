const CACHE_NAME = "fom-print-cache-v2";
const SYNC_TAG = "sync-xml-data";
const XML_CACHE_NAME = "xml-cache-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./css/bootstrap.css",
  "./css/bootstrap-icons.css",
  "./css/style.css",
  "./js/bootstrap.bundle.js",
  "./js/popper.js",
  "./js/numeral.min.js",
  "./js/moment.js",
  "./js/app.js",
  "./img/fom-app-logo-01.svg",
  "./img/favicon-16x16.png",
  "./img/favicon-32x32.png",
  "./img/apple-touch-icon-152x152.png",
  "./img/apple-touch-icon-167x167.png",
  "./img/apple-touch-icon-180x180.png",
];

// Install event - cache assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        // Cache files one by one to identify which files fail
        return Promise.allSettled(
          urlsToCache.map(async (url) => {
            try {
              await cache.add(url);
              console.log(`Successfully cached: ${url}`);
            } catch (error) {
              console.error(`Failed to cache: ${url}`, error);
            }
          })
        );
      }),
      caches.open(XML_CACHE_NAME)
    ])
  );
});

// Sync event - handle background sync
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncXmlData());
  }
});

// Periodic sync - check for updates every few hours
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "periodic-xml-sync") {
    event.waitUntil(syncXmlData());
  }
});

// Function to sync XML data
async function syncXmlData() {
  try {
    // Fetch latest XML data
    const response = await fetch("/path/to/your/xml/data.xml");
    const xmlData = await response.text();

    // Cache the XML data
    const cache = await caches.open(XML_CACHE_NAME);
    await cache.put("/xml-data", new Response(xmlData));

    // Broadcast message to update SQLite
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "UPDATE_XML_DATA",
        data: xmlData,
      });
    });

    return true;
  } catch (error) {
    console.error("Error syncing XML data:", error);
    return false;
  }
}

// Fetch event - serve from cache or network
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Handle XML data requests separately
  if (event.request.url.includes("/xml-data")) {
    event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
    return;
  }

  // Handle other requests
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME, XML_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      ).then(() => self.clients.claim());
    })
  );
});
