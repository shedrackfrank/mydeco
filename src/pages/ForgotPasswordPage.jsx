import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { requestPasswordReset } from '../lib/auth'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [captchaToken, setCaptchaToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const captchaRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!captchaToken) {
      setError('Please complete the CAPTCHA before submitting.')
      return
    }

    setLoading(true)

    try {
      await requestPasswordReset(email, captchaToken)
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
      captchaRef.current?.resetCaptcha()
      setCaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <section>
        <h1>Check your email</h1>
        {/* Deliberately doesn't confirm whether an account exists --
            matches Supabase's own privacy-conscious behavior, so this
            form can't be used to check who's registered. */}
        <p>
          If an account exists for {email}, we've sent a link to reset
          its password.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h1>Forgot your password?</h1>
      <p>Enter your email and we'll send you a link to reset it.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <HCaptcha
          ref={captchaRef}
          sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p><Link to="/login">Back to log in</Link></p>
    </section>
  )
}

export default ForgotPasswordPage