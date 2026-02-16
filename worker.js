const CACHE_NAME = "fom-print-cache-v4";
const SYNC_TAG = "sync-xml-data";
const XML_CACHE_NAME = "xml-cache-v1";
const XML_FEED_URL = "https://www.flatoutmotorcycles.com/unitinventory_univ.xml";

const urlsToCache = [
  "./",
  "./index.html",
  "./css/style.css",
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
              await cache.add(new Request(url, { cache: "reload" }));
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

/**
 * Build a cache-busted XML feed URL.
 * @param {string} baseUrl Base XML URL.
 * @returns {string} URL with cache-busting query.
 */
function buildXmlFeedUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("t", Date.now().toString());
  return url.toString();
}

// Function to sync XML data
async function syncXmlData() {
  try {
    // Fetch latest XML data
    const response = await fetch(buildXmlFeedUrl(XML_FEED_URL), {
      cache: "no-store",
      headers: {
        Accept: "application/xml, text/xml",
      },
    });
    if (!response.ok) {
      throw new Error(`XML fetch failed: ${response.status}`);
    }
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

/**
 * Decide if a request should bypass cache-first behavior.
 * @param {Request} request Fetch request.
 * @returns {boolean} True when network should be preferred.
 */
function shouldBypassCache(request) {
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isTvAsset = isSameOrigin && url.pathname.startsWith("/tv/");
  const isScriptOrStyle = request.destination === "script" || request.destination === "style";
  return isTvAsset || isScriptOrStyle;
}

/**
 * Use network-first for a request with cache fallback.
 * @param {Request} request Fetch request.
 * @returns {Promise<Response>} Response promise.
 */
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      // Only cache valid GET responses
      if (response.ok && request.method === "GET") {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
      }
      return response;
    })
    .catch(() => caches.match(request));
}

// Fetch event - serve from cache or network
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-http(s) requests (chrome-extension://, etc.)
  if (!url.protocol.startsWith("http")) {
    return;
  }
  
  // Skip POST and other non-GET requests (Cache API only supports GET)
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      networkFirst(event.request)
    );
    return;
  }

  // Handle XML data requests separately
  if (event.request.url.includes("/xml-data")) {
    event.respondWith(
      caches.open(XML_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match("/xml-data");
        const syncPromise = syncXmlData();
        if (cached) {
          event.waitUntil(syncPromise);
          return cached;
        }
        await syncPromise;
        const updated = await cache.match("/xml-data");
        return updated || fetch(event.request);
      })
    );
    return;
  }

  // Handle other requests
  if (shouldBypassCache(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
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
