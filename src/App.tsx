import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/auth'
import { useLicenseStore } from './store/license'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import Purchases from './pages/Purchases'
import Returns from './pages/Returns'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Activation from './pages/Activation'
import Setup from './pages/Setup'
import Personnel from './pages/Personnel'
import Clients from './pages/Clients'
import Documents from './pages/Documents'
import PurchaseHistory from './pages/PurchaseHistory'
import Revisions from './pages/Revisions'
import Resortings from './pages/Resortings'
import Transfers from './pages/Transfers'
import NewTransfer from './pages/NewTransfer'
import ValuationReport from './pages/ValuationReport'
import CustomerDisplay from './pages/CustomerDisplay'
import OnScreenKeyboard from './components/OnScreenKeyboard'
import WindowControls from './components/WindowControls'
import UpdateNotification from './components/UpdateNotification'
import { useState, useEffect } from 'react'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <Layout>{children}</Layout>;
}

function App() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const { isActive, isChecking } = useLicenseStore()
  const [setupChecked, setSetupChecked] = useState(false)
  const [isSetupComplete, setIsSetupComplete] = useState(true) // default true to not block

  // Проверяем, прошла ли первоначальная настройка
  useEffect(() => {
    if (isActive && !isChecking) {
      window.electronAPI?.auth?.checkSetup?.().then(res => {
        if (res?.success && res.data) {
          setIsSetupComplete(res.data.isSetupComplete);
        }
        setSetupChecked(true);
      }).catch(() => {
        setSetupChecked(true);
      });
    }
  }, [isActive, isChecking]);

  // БАГ 3 FIX: Второе окно загружает #/customer-display, но лицензионная проверка
  // блокирует его ДО роутера. Определяем это по хэшу и рендерим напрямую.
  const isCustomerDisplayWindow = window.location.hash.includes('/customer-display')
  if (isCustomerDisplayWindow) {
    return <CustomerDisplay />
  }

  // Если идет проверка лицензии или она недействительна, показываем экран активации
  if (isChecking || !isActive) {
    return (
      <>
        <WindowControls />
        <Toaster position="top-right" />
        <UpdateNotification />
        <Activation />
        <OnScreenKeyboard />
      </>
    )
  }

  // Если лицензия активна, но первоначальная настройка не пройдена
  if (setupChecked && !isSetupComplete) {
    return (
      <>
        <WindowControls />
        <Toaster position="top-right" />
        <Setup onComplete={() => setIsSetupComplete(true)} />
        <OnScreenKeyboard />
      </>
    )
  }

  return (
    <>
      <WindowControls />
      <UpdateNotification />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <POS />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <Inventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchases"
            element={
              <ProtectedRoute>
                <Purchases />
              </ProtectedRoute>
            }
          />
          <Route
            path="/returns"
            element={
              <ProtectedRoute>
                <Returns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute>
                <Personnel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <Clients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <Documents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <PurchaseHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/revisions"
            element={
              <ProtectedRoute>
                <Revisions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resortings"
            element={
              <ProtectedRoute>
                <Resortings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transfers"
            element={
              <ProtectedRoute>
                <Transfers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transfers/new"
            element={
              <ProtectedRoute>
                <NewTransfer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/valuation"
            element={
              <ProtectedRoute>
                <ValuationReport />
              </ProtectedRoute>
            }
          />
          {/* Экран покупателя — без ProtectedRoute, т.к. открывается в отдельном окне */}
          <Route path="/customer-display" element={<CustomerDisplay />} />
        </Routes>
        <OnScreenKeyboard />
      </Router>
    </>
  )
}

export default App
