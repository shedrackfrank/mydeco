import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  // AuthContext is still checking the initial session -- render
  // nothing meaningful yet rather than flash a wrong screen.
  if (loading) {
    return <p>Loading...</p>
  }

  // 1. No session at all -- send them to log in.
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // 2. Logged in, but hasn't clicked the verification link yet. We
  // deliberately don't redirect anywhere here -- every other page
  // requires this same check, so there's nowhere useful to send them.
  // Just explain what's blocking them.
  if (!user.email_confirmed_at) {
    return (
      <section>
        <h1>Verify your email</h1>
        <p>
          We sent a verification link to {user.email}. Click it, then
          refresh this page to continue.
        </p>
      </section>
    )
  }

  // 3. Verified, but no profile row yet -- this only happens for a
  // brand-new Google sign-in (see ensureProfileExists in auth.js).
  if (!profile) {
    return <Navigate to="/choose-role" replace />
  }

  // 4. Account was deleted (soft-deleted, technically -- see the
  // migration for why). Send them to decide whether to restore it,
  // UNLESS they're already on that page -- checking the path here is
  // what stops this from being an infinite redirect loop.
  if (profile.deactivated_at && location.pathname !== '/reactivate') {
    return <Navigate to="/reactivate" replace />
  }

  // 5. Fully signed in, verified, has a profile, and active -- show
  // the page.
  return children
}

export default ProtectedRoute