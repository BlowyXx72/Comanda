import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // escucha en 0.0.0.0 dentro del contenedor
    port: 5173,
    strictPort: true,
    // HMR se conecta desde el navegador del host contra el puerto publicado por docker-compose
    hmr: {
      clientPort: 5173,
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
