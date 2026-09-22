import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import PasswordInput from '../components/PasswordInput'
import { supabase } from '../lib/supabaseClient'
import { signUpWithEmail, signInWithGoogle } from '../lib/auth'
import {
  isDisposableEmail,
  isValidUsername,
  isValidPhoneNumber,
  formatPhoneNumberE164,
  getPasswordRequirements,
  isPasswordValid,
  getPasswordStrength,
} from '../lib/validation'
import { COUNTRIES } from '../lib/countries'

function SignupPage() {
  const [role, setRole] = useState('customer')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle') // idle | checking | available | taken | invalid
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [country, setCountry] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [captchaToken, setCaptchaToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const captchaRef = useRef(null)

  const passwordRequirements = getPasswordRequirements()
  const passwordStrength = getPasswordStrength(password)

  // Debounced live username availability check -- waits 500ms after
  // typing stops before querying the database, rather than firing a
  // request on every keystroke.
  useEffect(() => {
    if (!username) {
      setUsernameStatus('idle')
      return
    }
    if (!isValidUsername(username)) {
      setUsernameStatus('invalid')
      return
    }

    setUsernameStatus('checking')
    const timeout = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('is_username_taken', {
          check_username: username,
        })
        if (rpcError) throw rpcError
        setUsernameStatus(data ? 'taken' : 'available')
      } catch {
        // Fails open -- if the availability check itself breaks, don't
        // block the person from attempting to submit. The database's
        // own unique constraint is still the real backstop.
        setUsernameStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [username])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!isValidUsername(username)) {
      setError('Username must be 3-20 characters: letters, numbers, underscores, and periods only.')
      return
    }

    if (usernameStatus === 'taken') {
      setError('That username is already taken. Please choose another.')
      return
    }

    if (isDisposableEmail(email)) {
      setError("Please sign up with a permanent email address -- temporary/disposable emails aren't accepted.")
      return
    }

    if (!isPasswordValid(password)) {
      setError('Please meet all the password requirements below.')
      return
    }

    if (!country) {
      setError('Please select your country.')
      return
    }

    if (role === 'decorator') {
      if (!phoneNumber) {
        setError('Please enter a phone number.')
        return
      }
      if (!isValidPhoneNumber(phoneNumber, country)) {
        setError('Please enter a valid phone number for the selected country.')
        return
      }
    }

    if (!captchaToken) {
      setError('Please complete the CAPTCHA before submitting.')
      return
    }

    setLoading(true)

    try {
      await signUpWithEmail({
        email,
        password,
        role,
        username,
        country,
        // Stored as full E.164 ("+2348012345678"), not the raw local
        // input ("8012345678") -- a bare local number is ambiguous
        // outside its own country and isn't directly usable on its
        // own. isValidPhoneNumber already confirmed this parses
        // cleanly, so formatPhoneNumberE164 shouldn't fail here.
        phoneNumber: role === 'decorator' ? formatPhoneNumberE164(phoneNumber, country) : undefined,
        captchaToken,
      })
      setSubmitted(true)
    } catch (err) {
      setError(err.message && err.message !== '{}' ? err.message : 'Something went wrong creating your account. Please try again in a moment.')
      captchaRef.current?.resetCaptcha()
      setCaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignup() {
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message && err.message !== '{}' ? err.message : 'Something went wrong signing up with Google. Please try again.')
    }
  }

  if (submitted) {
    return (
      <section>
        <h1>Check your email</h1>
        <p>
          We sent a verification link to {email}. Click it to activate
          your account, then come back and log in.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h1>Sign up</h1>

      <button onClick={handleGoogleSignup} type="button">
        Continue with Google
      </button>

      <p>or sign up with email</p>

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>I am a...</legend>
          <label>
            <input
              type="radio"
              name="role"
              value="customer"
              checked={role === 'customer'}
              onChange={() => setRole('customer')}
            />
            Customer, looking for a decorator
          </label>
          <label>
            <input
              type="radio"
              name="role"
              value="decorator"
              checked={role === 'decorator'}
              onChange={() => setRole('decorator')}
            />
            Decorator, showcasing my work
          </label>
        </fieldset>

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <p className={`username-status username-status--${usernameStatus}`}>
          {usernameStatus === 'checking' && 'Checking availability…'}
          {usernameStatus === 'available' && '✓ Username available'}
          {usernameStatus === 'taken' && '✗ Username already taken'}
          {usernameStatus === 'invalid' && username.length > 0 &&
            '3-20 characters: letters, numbers, underscores, and periods only'}
        </p>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)} required>
            <option value="">Select your country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </label>

        {/* Only decorators provide a phone number -- see the note in
            validation.js about why it's format-checked, not SMS-verified. */}
        {role === 'decorator' && (
          <label>
            Phone number
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder=" "
              required
            />
          </label>
        )}

        <label>
          Password
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        {password.length > 0 && (
          <div className="password-strength">
            <div className="password-strength-track">
              <div
                className="password-strength-bar"
                style={{ width: `${passwordStrength.percent}%`, backgroundColor: passwordStrength.color }}
              />
            </div>
            <span className="password-strength-label" style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
          </div>
        )}

        {password.length > 0 && (
          <ul className="password-requirements">
            {passwordRequirements.map((requirement) => (
              <li key={requirement.id} className={requirement.test(password) ? 'met' : 'unmet'}>
                {requirement.test(password) ? '✓' : '✗'} {requirement.label}
              </li>
            ))}
          </ul>
        )}

        <HCaptcha
          ref={captchaRef}
          sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  )
}

export default SignupPage