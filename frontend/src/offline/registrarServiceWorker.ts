// PWA mínima del mesero (CU-07): el service worker (public/sw.js) guarda el
// shell de la app para que /mesas abra aunque no haya red.
// Solo funciona en contexto seguro (https o localhost). Desde la Fase 13B,
// Nginx sirve la app por HTTPS, así que también funciona desde un teléfono en
// la red local (https://<ip>:8443, con NGINX_CERT_IP en el .env). Por
// http://<ip>:5173 el navegador sigue sin permitirlo.
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('No se pudo registrar el service worker', err);
    });
  });
}
