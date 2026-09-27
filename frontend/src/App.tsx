import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CajaPage } from './pages/Caja'
import { CocinaPage } from './pages/Cocina'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { MesasPage } from './pages/Mesas'
import { SedeProvider } from './sede/SedeContext'
import { SelectorSedeGlobal } from './sede/SelectorSedeGlobal'

function App() {
  return (
    <AuthProvider>
      <SedeProvider>
        <SelectorSedeGlobal />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SedeProvider>
    </AuthProvider>
  )
}

export default App
