const CACHE_NAME = "uni-app-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./bundle.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-badge.png",
];

// Install: cache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first, fallback to cache
self.addEventListener("fetch", (e) => {
  // Skip non-GET and Supabase API calls (always go to network)
  if (e.request.method !== "GET" || e.request.url.includes("supabase.co")) return;

  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then((res) => {
        // Cache successful responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push: notificación de un aviso nuevo en el Canal de Avisos (burbuja +
// sonido/vibración por defecto del sistema — la Web Notification API no deja
// elegir un sonido personalizado, solo la app nativa podría hacerlo).
//
// Siempre se muestra, tenga o no la pestaña enfocada — igual que WhatsApp Web:
// cada dispositivo (celular, laptop) sueña independiente según si a ESE
// dispositivo le llega el push, sin importar si tiene la app abierta en ese
// momento o qué esté pasando en otro dispositivo.
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data.json();
  } catch {
    data = { title: "UNI App", body: e.data ? e.data.text() : "Tienes un aviso nuevo" };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "UNI App", {
      body: data.body || "Tienes un aviso nuevo",
      icon: "icon-192.png",
      // El ícono chico de la barra de estado de Android solo usa el canal alfa de esta imagen (el
      // color se ignora siempre) — por eso icon-192.png (opaco, con fondo amarillo) salía como un
      // cuadrito blanco sólido. icon-badge.png es una silueta blanca del camión sobre fondo
      // transparente, generada a partir del mismo logo, para que se vea el ícono real.
      badge: "icon-badge.png",
      vibrate: [200, 100, 200],
      data: { avisoId: data.avisoId || null, incidenciaId: data.incidenciaId || null }
    })
  );
});

// Clic en la notificación: si la app ya está abierta en alguna pestaña, la enfoca y le avisa (por
// postMessage) a qué aviso/incidencia ir; si estaba cerrada, abre una pestaña nueva con
// ?avisoId=...&incidenciaId=... en la URL, que la app lee al cargar (ver el efecto correspondiente
// en ChoferApp/AztPanel).
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const avisoId = e.notification.data?.avisoId || null;
  const incidenciaId = e.notification.data?.incidenciaId || null;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "ir-a-aviso", avisoId, incidenciaId });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        const params = new URLSearchParams();
        if (avisoId) params.set("avisoId", avisoId);
        if (incidenciaId) params.set("incidenciaId", incidenciaId);
        const query = params.toString();
        return self.clients.openWindow(query ? `./?${query}` : "./");
      }
    })
  );
});
