import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CajaPage } from './pages/Caja'
import { CatalogoPage } from './pages/Catalogo'
import { CocinaPage } from './pages/Cocina'
import { HomePage } from './pages/Home'
import { InventarioPage } from './pages/Inventario'
import { LoginPage } from './pages/Login'
import { MenuPublicoPage } from './pages/MenuPublico'
import { MesasPage } from './pages/Mesas'
import { PanelPage } from './pages/Panel'
import { SimuladorPlataformaPage } from './pages/SimuladorPlataforma'
import { SedeProvider } from './sede/SedeContext'

function App() {
  return (
    <AuthProvider>
      <SedeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/menu/:cadenaId/:sedeId" element={<MenuPublicoPage />} />
            {/* Fase 20B: desde el subdominio de la cadena (lacadena.dominio/menu/:sedeId) */}
            <Route path="/menu/:sedeId" element={<MenuPublicoPage />} />
            {/* Fase 12B: hace de plataforma externa, así que no usa sesión (va con API key). */}
            <Route path="/simulador-plataforma" element={<SimuladorPlataformaPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mesas"
              element={
                <ProtectedRoute roles={['MESERO', 'ADMIN']}>
                  <MesasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cocina"
              element={
                <ProtectedRoute>
                  <CocinaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/caja"
              element={
                <ProtectedRoute roles={['CAJERO', 'ADMIN']}>
                  <CajaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/panel"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <PanelPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/catalogo"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <CatalogoPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventario"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <InventarioPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SedeProvider>
    </AuthProvider>
  )
}

export default App
