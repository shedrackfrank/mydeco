import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import PasswordInput from '../components/PasswordInput'
import { signInWithEmail, signInWithGoogle } from '../lib/auth'
import { useAuth } from '../context/AuthContext'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000

function LoginPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [now, setNow] = useState(Date.now())
  const captchaRef = useRef(null)
  const navigate = useNavigate()

  // Handles landing here already authenticated -- which now happens
  // on purpose: signUpWithEmail's emailRedirectTo and signInWithGoogle's
  // redirectTo both point at /login specifically (see auth.js for why),
  // so a confirmation-link click or a completed Google sign-in both
  // land here. Once AuthContext finishes picking up that session, this
  // moves the person forward instead of leaving them stuck looking at
  // a login form they don't need.
  useEffect(() => {
    if (authLoading || !user) return
    navigate(profile ? '/browse' : '/choose-role', { replace: true })
  }, [authLoading, user, profile, navigate])

  // Ticks once a second while locked out, purely so the countdown
  // message stays accurate and the form re-enables itself the moment
  // the lockout expires -- no page refresh needed.
  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  const isLocked = lockedUntil !== null && now < lockedUntil
  const secondsRemaining = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNeedsVerification(false)

    if (isLocked) return

    if (!captchaToken) {
      setError('Please complete the CAPTCHA before submitting.')
      return
    }

    setLoading(true)

    try {
      await signInWithEmail(email, password, captchaToken)
      setFailedAttempts(0)
      navigate('/browse')
    } catch (err) {
      if (err.code === 'email_not_confirmed') {
        setNeedsVerification(true)
      } else {
        setError('Incorrect email or password. Please try again.')

        const nextAttempts = failedAttempts + 1
        setFailedAttempts(nextAttempts)

        // Soft, client-side speed bump only -- see note above. Real
        // brute-force protection is server-side (Supabase rate limits
        // + CAPTCHA), not this.
        if (nextAttempts >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS)
          setNow(Date.now())
        }
      }

      captchaRef.current?.resetCaptcha()
      setCaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section>
      <h1>Log in</h1>

      <button onClick={handleGoogleLogin} type="button">
        Continue with Google
      </button>

      <p>or log in with email</p>

      {needsVerification && (
        <p className="form-notice">
          This account exists, but its email hasn't been verified yet.
          Check your inbox for the verification link before logging in.
        </p>
      )}

      {isLocked && (
        <p className="form-notice">
          Too many failed attempts. Please wait {secondsRemaining} second{secondsRemaining === 1 ? '' : 's'} before trying again.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLocked}
          />
        </label>

        <label>
          Password
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={isLocked}
          />
        </label>

        <HCaptcha
          ref={captchaRef}
          sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={loading || isLocked}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p><Link to="/forgot-password">Forgot password?</Link></p>
      <p>New here? <Link to="/signup">Create an account</Link></p>
    </section>
  )
}

export default LoginPage