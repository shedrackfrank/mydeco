import { supabase } from './supabaseClient'

// ------------------------------------------------------------------
// SIGN UP
// We do NOT insert into user_profiles here. When "Confirm email" is
// turned on, supabase.auth.signUp() does not hand back an active
// session -- there's no logged-in request to write the profile row
// with, and Row Level Security would reject the attempt anyway.
// Instead we stash everything in the auth user's own metadata, and
// create the real user_profiles row later, in ensureProfileExists(),
// the first time this person has a verified session.
//
// Takes a single options object rather than a long positional
// argument list -- with 6 different fields now (email, password,
// role, username, country, phoneNumber), positional arguments become
// too easy to pass in the wrong order by accident.
// ------------------------------------------------------------------
export async function signUpWithEmail({ email, password, role, username, country, phoneNumber, captchaToken }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role,
        username,
        country,
        // Only decorators collect a phone number on the signup form --
        // customers pass phoneNumber as undefined, which just means
        // phone_number stays null on their profile row.
        phone_number: phoneNumber || null,
      },
      captchaToken,
      // Without this, Supabase falls back to whatever "Site URL" is
      // configured in the dashboard -- almost always the bare origin
      // with no path. App.jsx has no route for "/", so that lands on
      // the catch-all route, which immediately navigates to /login.
      // That navigation changes the URL path, which wipes out the
      // #access_token=... Supabase put in the hash -- before the
      // client ever gets a chance to read it. Pointing this at a real,
      // already-defined route (same fix already used for password
      // reset below) is what lets the session actually get picked up.
      emailRedirectTo: `${window.location.origin}/login`,
    },
  })

  if (error) throw error
  return data // data.session is null until they verify -- that's expected
}

// ------------------------------------------------------------------
// SIGN IN
// Supabase returns a specific error code when the account exists but
// hasn't verified its email yet, separate from a wrong-password error.
// We re-throw that as a distinguishable error so the login page can
// show "please verify your email" instead of the more alarming
// "wrong password" message.
// ------------------------------------------------------------------
export async function signInWithEmail(email, password, captchaToken) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      const notConfirmedError = new Error('EMAIL_NOT_CONFIRMED')
      notConfirmedError.code = 'email_not_confirmed'
      throw notConfirmedError
    }
    throw error
  }

  return data
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // Same reasoning as emailRedirectTo in signUpWithEmail above --
    // window.location.origin alone lands on "/", which has no route
    // and loses the session in App.jsx's catch-all redirect. Google's
    // OAuth callback carries the same #access_token=... pattern, so it
    // needs the same fix.
    options: { redirectTo: `${window.location.origin}/login` },
  })

  if (error) throw error
  // No return value on purpose -- this redirects the whole page to
  // Google, so any code placed after this call never actually runs.
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ------------------------------------------------------------------
// PASSWORD RESET
// requestPasswordReset sends the email; updatePassword runs later, on
// the /reset-password page, once the person has clicked that email's
// link (which logs them into a short-lived recovery session).
// captchaToken on the request step stops this endpoint from being
// used to spam someone else's inbox with reset emails.
// ------------------------------------------------------------------
export async function requestPasswordReset(email, captchaToken) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
    captchaToken,
  })

  if (error) throw error
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// ------------------------------------------------------------------
// PROFILE
// One function covers two different situations:
//   1. An email/password user verifying for the first time -- their
//      role, username, country, and (for decorators) phone number are
//      already sitting in auth metadata from signUpWithEmail(), so we
//      create their profile row here, automatically.
//   2. A brand-new Google sign-in -- there's no metadata to work
//      with, so we return null and let the app send them to
//      /choose-role instead.
// ------------------------------------------------------------------
export async function ensureProfileExists() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: existingProfile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (existingProfile) return existingProfile

  const metaRole = user.user_metadata?.role
  const metaUsername = user.user_metadata?.username
  const metaCountry = user.user_metadata?.country
  const metaPhone = user.user_metadata?.phone_number

  // Role, username, and country are all required for a profile row --
  // if any are missing (always true for a fresh Google sign-in, which
  // has none of this metadata), send them to /choose-role instead.
  if (!metaRole || !metaUsername || !metaCountry) return null

  const { data: createdProfile, error: insertError } = await supabase
    .from('user_profiles')
    .insert({
      id: user.id,
      role: metaRole,
      username: metaUsername,
      country: metaCountry,
      phone_number: metaPhone ?? null,
    })
    .select()
    .single()

  if (insertError) throw insertError
  return createdProfile
}

// Used by AuthContext: returns the auth user and their profile
// together. profile comes back null when ensureProfileExists()
// decided this person still needs to visit /choose-role.
export async function getCurrentUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const profile = await ensureProfileExists()
  return { user, profile }
}

// Looks up someone else's already-existing profile by id -- unlike
// getCurrentUserProfile/ensureProfileExists, this never creates a row.
// Used by DecoratorProfilePage.jsx to show a decorator's display name.
export async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

// Batched version of fetchUserProfile -- one query for a list of ids
// instead of one per id. Used by messaging.js to attach the OTHER
// participant's name to every conversation in the inbox without an
// N+1 query. Returns a map keyed by user id.
export async function fetchUserProfilesByIds(userIds) {
  if (!userIds || userIds.length === 0) return {}

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .in('id', userIds)

  if (error) throw error
  return Object.fromEntries(data.map((profile) => [profile.id, profile]))
}
// ------------------------------------------------------------------
// EMAIL CHANGE
// Supabase's own default flow: this sends a confirmation link to the
// NEW address, and the email only actually changes once that link is
// clicked -- so this function returning success just means "the
// confirmation email went out," not "the email is already changed."
// Available to both customers and decorators; unlike phone number,
// there's no restriction here.
// ------------------------------------------------------------------
export async function updateEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) throw error
}

// ------------------------------------------------------------------
// ACCOUNT DEACTIVATION
// Deleting an account doesn't delete anything immediately -- see the
// migration (20260809000001_account_deactivation.sql) for the full
// reasoning. This just records when, and -- for a decorator -- hides
// their profile from customers the same way is_disabled always has.
// Actually signing the person out afterward is the caller's job (see
// SettingsPage.jsx), not this function's.
// ------------------------------------------------------------------
export async function deactivateAccount(userId, role) {
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ deactivated_at: new Date().toISOString() })
    .eq('id', userId)

  if (profileError) throw profileError

  if (role === 'decorator') {
    const { error: decoratorError } = await supabase
      .from('decorator_profiles')
      .update({ is_disabled: true })
      .eq('user_id', userId)

    if (decoratorError) throw decoratorError
  }
}

// Reverses deactivateAccount -- called from ReactivateAccountPage.jsx
// when someone logs back in within the 30-day window and confirms
// they want their account back.
export async function reactivateAccount(userId, role) {
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ deactivated_at: null })
    .eq('id', userId)

  if (profileError) throw profileError

  if (role === 'decorator') {
    const { error: decoratorError } = await supabase
      .from('decorator_profiles')
      .update({ is_disabled: false })
      .eq('user_id', userId)

    if (decoratorError) throw decoratorError
  }
}

// ------------------------------------------------------------------
// USERNAME CHANGE
// The 30-day cooldown is enforced for real by a database trigger (see
// 20260810000001_username_cooldown.sql) -- this just attempts the
// update and lets whatever comes back (a cooldown rejection, or a
// uniqueness conflict from the existing case-insensitive unique
// index) surface as a normal thrown error.
// ------------------------------------------------------------------
export async function changeUsername(userId, newUsername) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ username: newUsername })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Saves the new avatar reference after uploadAvatar() succeeds --
// call order is deleteAvatar() (if replacing one) -> uploadAvatar() ->
// updateAvatar(), same as the portfolio photo flow.
export async function updateAvatar(userId, avatarUrl, avatarPublicId) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ avatar_url: avatarUrl, avatar_public_id: avatarPublicId })
    .eq('id', userId)

  if (error) throw error
}