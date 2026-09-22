import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { reactivateAccount, signOut } from '../lib/auth'

const GRACE_PERIOD_DAYS = 30

function ReactivateAccountPage() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const deactivatedAt = new Date(profile.deactivated_at)
  const deleteAt = new Date(deactivatedAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
  const daysLeft = Math.max(0, Math.ceil((deleteAt - Date.now()) / (24 * 60 * 60 * 1000)))

  async function handleReactivate() {
    setError(null)
    setLoading(true)
    try {
      await reactivateAccount(profile.id, profile.role)
      // Pulls the now-updated profile (deactivated_at is null again)
      // into AuthContext directly, so ProtectedRoute stops redirecting
      // here on the very next render instead of needing a full reload.
      await refreshProfile()
      navigate(profile.role === 'decorator' ? '/dashboard' : '/browse', { replace: true })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <section>
      <h1>Your account is deactivated</h1>
      <p>
        You deleted your account on {deactivatedAt.toLocaleDateString()}. It's
        being kept for now and can still be restored -- but it will be
        permanently deleted on {deleteAt.toLocaleDateString()}
        {daysLeft > 0 ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} from now)` : ''}
        {' '}unless you restore it before then.
      </p>

      {error && <p className="form-error">{error}</p>}

      <button type="button" onClick={handleReactivate} disabled={loading}>
        {loading ? 'Restoring…' : 'Restore my account'}
      </button>
      <button type="button" onClick={handleSignOut} disabled={loading}>
        Sign out
      </button>
    </section>
  )
}

export default ReactivateAccountPage