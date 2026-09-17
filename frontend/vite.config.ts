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
  },
})
