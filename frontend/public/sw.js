// Service worker de la PWA mínima del mesero (CU-07). Lo registra
// src/offline/registrarServiceWorker.ts.
// DECISIÓN DE PROTOTIPO: escrito a mano (sin Workbox / vite-plugin-pwa) y con
// estrategia "red primero, caché de respaldo" para todo GET del mismo origen.
// Así funciona igual con el servidor de desarrollo de Vite (que es como corre
// el frontend en docker compose) y nunca sirve código viejo si hay red.
// Los datos de la API (otro origen, puerto 3000) no pasan por aquí: los cachea
// la app en IndexedDB (src/offline/).
const CACHE = 'comanda-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        const guardada = await caches.match(request);
        if (guardada) return guardada;
        // Rutas del SPA (/mesas, /cocina...) que no se visitaron antes: el
        // index.html sirve para todas.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
