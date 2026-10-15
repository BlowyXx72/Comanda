import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // escucha en 0.0.0.0 dentro del contenedor
    port: 5173,
    strictPort: true,
    // Fase 13B: sin `hmr.clientPort` fijo, el cliente de HMR usa el mismo
    // origen de la página, así funciona tanto por http://localhost:5173 como
    // por Nginx (https://localhost:8443, WebSocket sobre TLS).

    // Fase 13B: con VITE_API_URL=/api la app llama a la API en su propio
    // origen. Por Nginx eso ya va a los backends; entrando directo a Vite, este
    // proxy hace lo mismo. `backend` es el alias de red de backend-1 y
    // backend-2 (ver docker-compose.yml).
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        rewrite: (ruta) => ruta.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: 'http://backend:3000',
        ws: true,
      },
    },
    // DECISIÓN DE PROTOTIPO: se fuerza polling porque los eventos de
    // filesystem no llegan de forma confiable a través del volumen
    // bind-mount de Docker Desktop en Windows; sin esto, guardar un archivo
    // en el host no dispara HMR.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
})
