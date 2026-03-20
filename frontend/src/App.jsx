import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Navbar } from './components/Navbar'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { authApi } from './api/client'

// Lazy-load heavier pages
import { lazy, Suspense } from 'react'

const SetsPage = lazy(() => import('./pages/SetsPage').then(m => ({ default: m.SetsPage })))
const AddEditSetPage = lazy(() => import('./pages/AddEditSetPage').then(m => ({ default: m.AddEditSetPage })))
const StoragePage = lazy(() => import('./pages/StoragePage').then(m => ({ default: m.StoragePage })))
const LabelsPage = lazy(() => import('./pages/LabelsPage').then(m => ({ default: m.LabelsPage })))
const NewSetsPage = lazy(() => import('./pages/NewSetsPage').then(m => ({ default: m.NewSetsPage })))
const BoxInventoryPage = lazy(() => import('./pages/BoxInventoryPage').then(m => ({ default: m.BoxInventoryPage })))
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })))
const BackupPage = lazy(() => import('./pages/BackupPage').then(m => ({ default: m.BackupPage })))

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-navy" />
    </div>
  )
}

function Layout({ children }) {
  const { user } = useAuth()
  if (!user) return children
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-6">
        <Suspense fallback={<LoadingSpinner />}>
          {children}
        </Suspense>
      </main>
    </div>
  )
}

function FirstRunGate({ children }) {
  const [hasUsers, setHasUsers] = useState(null)

  useEffect(() => {
    authApi.status().then(res => setHasUsers(res.data.has_users))
  }, [])

  if (hasUsers === null) return <LoadingSpinner />
  if (!hasUsers) return <Navigate to="/setup" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={
            <FirstRunGate>
              <LoginPage />
            </FirstRunGate>
          } />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/change-password" element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          } />

          {/* Protected routes with Navbar */}
          <Route path="/sets" element={
            <ProtectedRoute>
              <Layout><SetsPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sets/new" element={
            <ProtectedRoute requireAdmin>
              <Layout><AddEditSetPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sets/:id/edit" element={
            <ProtectedRoute requireAdmin>
              <Layout><AddEditSetPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/storage" element={
            <ProtectedRoute requireAdmin>
              <Layout><StoragePage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/labels" element={
            <ProtectedRoute>
              <Layout><LabelsPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/new-sets" element={
            <ProtectedRoute>
              <Layout><NewSetsPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/box-inventory" element={
            <ProtectedRoute>
              <Layout><BoxInventoryPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute requireAdmin>
              <Layout><UsersPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/backup" element={
            <ProtectedRoute requireAdmin>
              <Layout><BackupPage /></Layout>
            </ProtectedRoute>
          } />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/sets" replace />} />
          <Route path="*" element={<Navigate to="/sets" replace />} />
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
