import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { updateEmail, updateAvatar, deactivateAccount, changeUsername, signOut } from '../lib/auth'
import { isAllowedEmailProvider, isValidUsername } from '../lib/validation'
import { validatePhotoFile, uploadAvatar, deleteAvatar } from '../lib/cloudinary'
import { fetchDecoratorProfile, saveDecoratorProfile, CATEGORIES } from '../lib/portfolio'
import { fetchBlockedUsers, unblockUser } from '../lib/moderation'

const USERNAME_COOLDOWN_DAYS = 30

function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState(null)

  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState(null)
  const [emailSubmitted, setEmailSubmitted] = useState(false)

  const [newUsername, setNewUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle') // idle | checking | available | taken | invalid
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameError, setUsernameError] = useState(null)
  const [usernameSuccess, setUsernameSuccess] = useState(false)

  // Decorator-only: bio + the one-time category choice
  const [decoratorProfile, setDecoratorProfile] = useState(null)
  const [decoratorLoading, setDecoratorLoading] = useState(profile.role === 'decorator')
  const [bio, setBio] = useState('')
  const [category, setCategory] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [profileSaved, setProfileSaved] = useState(false)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const [blockedUsers, setBlockedUsers] = useState([])
  const [blockedLoading, setBlockedLoading] = useState(true)
  const [unblockingId, setUnblockingId] = useState(null)
  const [blockedError, setBlockedError] = useState(null)

  // Only decorators have a decorator_profiles row at all -- a
  // customer never triggers this fetch.
  useEffect(() => {
    if (profile.role !== 'decorator') return
    let isMounted = true

    fetchDecoratorProfile(user.id)
      .then((existing) => {
        if (!isMounted) return
        setDecoratorProfile(existing)
        if (existing) {
          setBio(existing.bio || '')
          setCategory(existing.category || '')
        }
      })
      .catch((err) => { if (isMounted) setProfileError(err.message) })
      .finally(() => { if (isMounted) setDecoratorLoading(false) })

    return () => { isMounted = false }
  }, [user.id, profile.role])

  // Everyone in Settings sees their own blocked list, regardless of
  // role -- both customers and decorators can block someone in chat.
  useEffect(() => {
    let isMounted = true

    fetchBlockedUsers(user.id)
      .then((rows) => { if (isMounted) setBlockedUsers(rows) })
      .catch((err) => { if (isMounted) setBlockedError(err.message) })
      .finally(() => { if (isMounted) setBlockedLoading(false) })

    return () => { isMounted = false }
  }, [user.id])

  // Same debounced live-availability pattern as SignupPage.jsx --
  // waits 500ms after typing stops before checking, rather than
  // querying on every keystroke.
  useEffect(() => {
    if (!newUsername) {
      setUsernameStatus('idle')
      return
    }
    if (!isValidUsername(newUsername)) {
      setUsernameStatus('invalid')
      return
    }
    if (newUsername.toLowerCase() === profile.username.toLowerCase()) {
      setUsernameStatus('idle')
      return
    }

    setUsernameStatus('checking')
    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('is_username_taken', { check_username: newUsername })
        if (error) throw error
        setUsernameStatus(data ? 'taken' : 'available')
      } catch {
        // Fails open, same reasoning as signup -- the database's own
        // unique index is still the real backstop either way.
        setUsernameStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [newUsername, profile.username])

  const cooldownActive = profile.username_changed_at
    && new Date(profile.username_changed_at).getTime() > Date.now() - USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  const nextEligibleDate = profile.username_changed_at
    && new Date(new Date(profile.username_changed_at).getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)

  async function handleAvatarSubmit(e) {
    e.preventDefault()
    setAvatarError(null)

    if (!avatarFile) {
      setAvatarError('Please choose a photo.')
      return
    }
    const validationError = validatePhotoFile(avatarFile)
    if (validationError) {
      setAvatarError(validationError)
      return
    }

    setAvatarSaving(true)
    try {
      // Clean up the old Cloudinary file first (if any) before
      // uploading its replacement -- see cloudinary.js for why this
      // order matters.
      if (profile.avatar_public_id) await deleteAvatar()
      const { url, publicId } = await uploadAvatar(avatarFile)
      await updateAvatar(user.id, url, publicId)
      await refreshProfile()
      setAvatarFile(null)
      e.target.reset()
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError(null)
    setAvatarSaving(true)
    try {
      await deleteAvatar()
      await refreshProfile()
    } catch (err) {
      setAvatarError(err.message)
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleProfileSubmit(e) {
    e.preventDefault()
    setProfileError(null)
    setProfileSaved(false)

    if (!category) {
      setProfileError('Please select a category.')
      return
    }

    setProfileSaving(true)
    try {
      const saved = await saveDecoratorProfile({ userId: user.id, bio, category })
      setDecoratorProfile(saved)
      setProfileSaved(true)
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setEmailError(null)

    if (!newEmail || newEmail === user.email) {
      setEmailError('Enter a different email address than your current one.')
      return
    }
    if (!isAllowedEmailProvider(newEmail)) {
      setEmailError('Please use an email from a major provider (Gmail, Outlook, Yahoo, iCloud, etc.).')
      return
    }

    setEmailSaving(true)
    try {
      await updateEmail(newEmail)
      setEmailSubmitted(true)
    } catch (err) {
      setEmailError(err.message)
    } finally {
      setEmailSaving(false)
    }
  }

  async function handleUsernameSubmit(e) {
    e.preventDefault()
    setUsernameError(null)
    setUsernameSuccess(false)

    if (!isValidUsername(newUsername)) {
      setUsernameError('Username must be 3-20 characters: letters, numbers, underscores, and periods only.')
      return
    }
    if (usernameStatus === 'taken') {
      setUsernameError('That username is already taken. Please choose another.')
      return
    }

    setUsernameSaving(true)
    try {
      await changeUsername(user.id, newUsername)
      await refreshProfile() // so the new username shows up in the Navbar etc. right away
      setUsernameSuccess(true)
      setNewUsername('')
      setUsernameStatus('idle')
    } catch (err) {
      setUsernameError(err.message)
    } finally {
      setUsernameSaving(false)
    }
  }

  async function handleUnblock(blockedId) {
    setBlockedError(null)
    setUnblockingId(blockedId)
    try {
      await unblockUser(user.id, blockedId)
      setBlockedUsers((prev) => prev.filter((row) => row.blocked_id !== blockedId))
    } catch (err) {
      setBlockedError(err.message)
    } finally {
      setUnblockingId(null)
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null)
    setDeleting(true)
    try {
      await deactivateAccount(user.id, profile.role)
      await signOut()
      navigate('/login')
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  return (
    <section>
      <h1>Settings</h1>

      <section aria-labelledby="avatar-heading">
        <h2 id="avatar-heading">Profile photo</h2>

        <div className="decorator-avatar" style={profile.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover' } : undefined}>
          {!profile.avatar_url && (profile.username?.[0]?.toUpperCase() || '?')}
        </div>

        <form onSubmit={handleAvatarSubmit}>
          <label>
            {profile.avatar_url ? 'Replace photo' : 'Upload a photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setAvatarFile(e.target.files[0] || null)}
            />
          </label>

          {avatarError && <p className="form-error">{avatarError}</p>}

          <button type="submit" disabled={avatarSaving}>
            {avatarSaving ? 'Saving…' : 'Save photo'}
          </button>
          {profile.avatar_url && (
            <button type="button" onClick={handleRemoveAvatar} disabled={avatarSaving}>
              Remove photo
            </button>
          )}
        </form>
      </section>

      {profile.role === 'decorator' && !decoratorLoading && (
        <section aria-labelledby="decorator-profile-heading">
          <h2 id="decorator-profile-heading">Your bio and category</h2>
          <form onSubmit={handleProfileSubmit}>
            <label>
              Bio
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
            </label>

            {decoratorProfile?.category ? (
              <p>
                Category: <strong>{decoratorProfile.category}</strong>
                {' '}-- this is permanent and can't be changed here. Contact us if you picked the wrong one.
              </p>
            ) : (
              <fieldset>
                <legend>Category (choose carefully -- this is permanent once set)</legend>
                {CATEGORIES.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name="category"
                      value={option}
                      checked={category === option}
                      onChange={() => setCategory(option)}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            )}

            {profileError && <p className="form-error">{profileError}</p>}
            {profileSaved && <p className="form-success">Profile saved.</p>}

            <button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="email-heading">
        <h2 id="email-heading">Email address</h2>
        <p>Current email: {user.email}</p>

        {emailSubmitted ? (
          <p>
            Check {newEmail} for a confirmation link your email won't
            actually change until you click it.
          </p>
        ) : (
          <form onSubmit={handleEmailSubmit}>
            <label>
              New email
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </label>
          

            {emailError && <p className="form-error">{emailError}</p>}

            <button type="submit" disabled={emailSaving}>
              {emailSaving ? 'Saving…' : 'Update email'}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="username-heading">
        <h2 id="username-heading">Username</h2>
        <p>Current username: {profile.username}</p>

        {cooldownActive ? (
          <p>
            You can change your username again on {nextEligibleDate.toLocaleDateString()}
            {' '}-- it's limited to once every {USERNAME_COOLDOWN_DAYS} days.
          </p>
        ) : (
          <form onSubmit={handleUsernameSubmit}>
            <label>
              New username
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </label>
            <p className={`username-status username-status--${usernameStatus}`}>
              {usernameStatus === 'checking' && 'Checking availability…'}
              {usernameStatus === 'available' && '✓ Username available'}
              {usernameStatus === 'taken' && '✗ Username already taken'}
              {usernameStatus === 'invalid' && newUsername.length > 0 &&
                '3-20 characters: letters, numbers, underscores, and periods only'}
            </p>
            <p>Once changed, you won't be able to change it again for {USERNAME_COOLDOWN_DAYS} days.</p>

            {usernameError && <p className="form-error">{usernameError}</p>}
            {usernameSuccess && <p className="form-success">Username updated.</p>}

            <button type="submit" disabled={usernameSaving || usernameStatus === 'taken' || usernameStatus === 'invalid'}>
              {usernameSaving ? 'Saving…' : 'Update username'}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="blocked-heading">
        <h2 id="blocked-heading">Blocked users</h2>

        {blockedError && <p className="form-error">{blockedError}</p>}

        {blockedLoading ? (
          <p>Loading...</p>
        ) : blockedUsers.length === 0 ? (
          <p>You haven't blocked anyone.</p>
        ) : (
          <div className="blocked-list">
            {blockedUsers.map((row) => {
              const blockedUser = row.user_profiles
              return (
                <div key={row.blocked_id} className="blocked-item">
                  <div
                    className="decorator-avatar"
                    style={blockedUser?.avatar_url ? { backgroundImage: `url(${blockedUser.avatar_url})`, backgroundSize: 'cover' } : undefined}
                  >
                    {!blockedUser?.avatar_url && (blockedUser?.username?.[0]?.toUpperCase() || '?')}
                  </div>
                  <p>{blockedUser?.username || 'Unknown user'}</p>
                  <button
                    type="button"
                    onClick={() => handleUnblock(row.blocked_id)}
                    disabled={unblockingId === row.blocked_id}
                  >
                    {unblockingId === row.blocked_id ? 'Unblocking…' : 'Unblock'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="danger-heading">
        <h2 id="danger-heading">Delete account</h2>

        {!confirmingDelete ? (
          <button type="button" onClick={() => setConfirmingDelete(true)}>
            Delete my account
          </button>
        ) : (
          <div>
            <p>
              Your account will be deactivated immediately
              {profile.role === 'decorator' && ' and your profile hidden from customers'}.
              It's kept for 30 days in case you want it back  after that,
              it's permanently deleted. Are you sure?
            </p>

            {deleteError && <p className="form-error">{deleteError}</p>}

            <button type="button" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
        )}
      </section>
    </section>
  )
}

export default SettingsPage