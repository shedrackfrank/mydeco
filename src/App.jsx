import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import BrowsePage from './pages/BrowsePage'
import ChatPage from './pages/ChatPage'
import ChooseRolePage from './pages/ChooseRolePage'
import DashboardPage from './pages/DashboardPage'
import DecoratorProfilePage from './pages/DecoratorProfilePage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import InboxPage from './pages/InboxPage'
import InfoPage from './pages/InfoPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import ReactivateAccountPage from './pages/ReactivateAccountPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SettingsPage from './pages/SettingsPage'
import SignupPage from './pages/SignupPage'

const protectedPage = (page) => <ProtectedRoute>{page}</ProtectedRoute>

// Split out from App so useLocation() has Router context to read from
// -- App itself renders BrowserRouter, so it can't call useLocation
// directly. This is what lets the shared Navbar hide itself
// specifically on "/", since LandingPage has its own self-contained
// header instead.
function AppShell() {
  const location = useLocation()
  const isLandingPage = location.pathname === '/'

  return (
    <>
      {!isLandingPage && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Deliberately NOT wrapped in ProtectedRoute -- each of
              these runs its own lighter auth check instead.
              ProtectedRoute would redirect these visitors away
              before their special session (a password-recovery
              link, or a fresh Google sign-in with no profile row
              yet) has a chance to be handled correctly. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/choose-role" element={<ChooseRolePage />} />

          <Route path="/browse" element={protectedPage(<BrowsePage />)} />
          <Route path="/decorator/:id" element={protectedPage(<DecoratorProfilePage />)} />
          <Route path="/dashboard" element={protectedPage(<DashboardPage />)} />
          <Route path="/inbox" element={protectedPage(<InboxPage />)} />
          <Route path="/chat/:conversationId" element={protectedPage(<ChatPage />)} />
          <Route path="/settings" element={protectedPage(<SettingsPage />)} />
          <Route path="/reactivate" element={protectedPage(<ReactivateAccountPage />)} />
          {/* Deliberately public -- FAQs/Privacy/Terms should be
              readable without an account, unlike every other page
              in this app. */}
          <Route path="/info" element={<InfoPage />} />
          {/* "/" is now the real front door, so an unmatched path goes
              there instead of straight to /login. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App