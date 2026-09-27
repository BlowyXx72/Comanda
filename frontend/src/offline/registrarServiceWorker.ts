// PWA mínima del mesero (CU-07): el service worker (public/sw.js) guarda el
// shell de la app para que /mesas abra aunque no haya red.
// Solo funciona en contexto seguro (https o localhost); desde la IP de la red
// local por http el navegador no lo permite y la app sigue igual, sin offline.
// TODO PRODUCCIÓN: servir por HTTPS (ver docs/prototipo-slice.md).
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('No se pudo registrar el service worker', err);
    });
  });
}
