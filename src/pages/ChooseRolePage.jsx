import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { isValidUsername, isValidPhoneNumber, formatPhoneNumberE164 } from '../lib/validation'
import { COUNTRIES } from '../lib/countries'

function ChooseRolePage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const [role, setRole] = useState('customer')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle') // idle | checking | available | taken | invalid
  const [country, setCountry] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  // Same debounced availability check as SignupPage -- all hooks stay
  // above the early returns below, since conditionally skipping a
  // hook call between renders is exactly what React's rules of hooks
  // forbid.
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
        setUsernameStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [username])

  if (loading) {
    return <p>Loading...</p>
  }

  // Not logged in at all -- shouldn't normally happen (Google sign-in
  // is what lands people here), but guard it anyway.
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Already has a profile -- nothing left to choose, send them in.
  if (profile) {
    return <Navigate to="/browse" replace />
  }

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

    setSubmitting(true)

    const { error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        id: user.id,
        role,
        username,
        country,
        // E.164 ("+2348012345678"), not the raw local input --
        // see the note in validation.js for why.
        phone_number: role === 'decorator' ? formatPhoneNumberE164(phoneNumber, country) : null,
      })

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    // Updates AuthContext immediately, so the navbar and every
    // ProtectedRoute check see the new profile without a page reload.
    await refreshProfile()
    navigate('/browse')
  }

  return (
    <section>
      <h1>Welcome! One more step.</h1>
      <p>Tell us a bit about yourself to finish setting up your account.</p>

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
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)} required>
            <option value="">Select your country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </label>

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

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </section>
  )
}

export default ChooseRolePage