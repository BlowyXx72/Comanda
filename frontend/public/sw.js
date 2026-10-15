// Service worker de la PWA mínima del mesero (CU-07). Lo registra
// src/offline/registrarServiceWorker.ts.
// DECISIÓN DE PROTOTIPO: escrito a mano (sin Workbox / vite-plugin-pwa) y con
// estrategia "red primero, caché de respaldo" para todo GET del mismo origen.
// Así funciona igual con el servidor de desarrollo de Vite (que es como corre
// el frontend en docker compose) y nunca sirve código viejo si hay red.
// Los datos de la API no pasan por aquí: los cachea la app en IndexedDB
// (src/offline/). Desde la Fase 13B la API está en el mismo origen (/api), así
// que se excluye explícitamente para no guardar respuestas autenticadas.
const CACHE = 'comanda-shell-v2';
const SIN_CACHE = ['/api/', '/socket.io/'];
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
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (SIN_CACHE.some((prefijo) => url.pathname.startsWith(prefijo))) return;

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
