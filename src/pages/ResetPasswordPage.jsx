import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PasswordInput from '../components/PasswordInput'
import { updatePassword } from '../lib/auth'
import { getPasswordRequirements, isPasswordValid } from '../lib/validation'

function ResetPasswordPage() {
  const { user, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const passwordRequirements = getPasswordRequirements()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!isPasswordValid(password)) {
      setError('Please meet all the password requirements below.')
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // AuthContext is still figuring out whether the reset link created a
  // valid session -- wait rather than flash the wrong screen.
  if (loading) {
    return <p>Loading...</p>
  }

  // No session means the link was invalid, already used, or expired --
  // Supabase reset links are one-time use.
  if (!user) {
    return (
      <section>
        <h1>This reset link isn't valid</h1>
        <p>
          It may have already been used or expired. Request a new one
          from the <Link to="/forgot-password">forgot password page</Link>.
        </p>
      </section>
    )
  }

  if (done) {
    return (
      <section>
        <h1>Password updated</h1>
        <p>Your password has been changed.</p>
        <button onClick={() => navigate('/login')}>Go to log in</button>
      </section>
    )
  }

  return (
    <section>
      <h1>Set a new password</h1>

      <form onSubmit={handleSubmit}>
        <label>
          New password
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        <label>
          Confirm new password
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        {/* Same live checklist as signup -- consistent expectations
            everywhere a password gets set, not just at signup. */}
        {password.length > 0 && (
          <ul className="password-requirements">
            {passwordRequirements.map((requirement) => (
              <li key={requirement.id} className={requirement.test(password) ? 'met' : 'unmet'}>
                {requirement.test(password) ? '✓' : '✗'} {requirement.label}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  )
}

export default ResetPasswordPage