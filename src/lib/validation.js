import { isValidPhoneNumber as libIsValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js'

// ------------------------------------------------------------------
// DISPOSABLE EMAIL BLOCKING
// This list is NOT exhaustive -- new temp-mail services appear
// constantly, and this can only block the well-known, commonly-used
// ones. Treat it as one layer alongside CAPTCHA (which makes it
// harder to automate mass signups in the first place), not a
// guarantee against every possible fake email.
// ------------------------------------------------------------------
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  '10minutemail.net',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'trashmail.com',
  'trashmail.net',
  'dispostable.com',
  'fakeinbox.com',
  'getnada.com',
  'maildrop.cc',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'emailondeck.com',
  'tempinbox.com',
  'mailnesia.com',
  'spamgourmet.com',
  'mailcatch.com',
  'discard.email',
  'discardmail.com',
  'anonbox.net',
  'burnermail.io',
  'crazymailing.com',
  'incognitomail.com',
  'mytemp.email',
  'tempr.email',
  'mailtemp.top',
  'fakemailgenerator.com',
])

export function isDisposableEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  return DISPOSABLE_EMAIL_DOMAINS.has(domain)
}

// ------------------------------------------------------------------
// ALLOWED EMAIL PROVIDERS (Settings' "change email" flow only)
// The OPPOSITE approach from the blocklist above: instead of trying to
// name every disposable service (impossible to keep complete), this
// only allows a curated set of large, well-known providers. Stricter
// than signup on purpose -- someone already has a working account at
// this point, so there's no reason to accept an email domain we don't
// recognize just to change TO it. Not exhaustive by design; add to
// this list if a legitimate provider is missing.
// ------------------------------------------------------------------
const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'gmx.com',
  'gmx.us',
  'mail.com',
  'yandex.com',
])

export function isAllowedEmailProvider(email) {
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  return ALLOWED_EMAIL_DOMAINS.has(domain)
}

// ------------------------------------------------------------------
// USERNAME VALIDATION
// Kept byte-for-byte identical to the database's own CHECK constraint
// (see the migration) on purpose -- if these two rules ever drift
// apart, you get the confusing situation where the form accepts a
// username the database then rejects, or vice versa.
// ------------------------------------------------------------------
export function isValidUsername(username) {
  return /^[A-Za-z0-9._]{3,20}$/.test(username)
}

// ------------------------------------------------------------------
// PHONE NUMBER VALIDATION
// Validates FORMAT only -- confirms this looks like a real,
// correctly-structured number for the given country. It cannot detect
// whether the number is a temporary/virtual one; that would require a
// paid lookup service (e.g. Twilio Lookup), which is a separate,
// much cheaper option than full SMS verification if that's ever
// worth revisiting later.
// countryCode is the two-letter country code (e.g. "NG", "US") from
// the country dropdown -- needed so a locally-formatted number
// (without a + prefix) can be interpreted correctly.
// ------------------------------------------------------------------
export function isValidPhoneNumber(phoneNumber, countryCode) {
  if (!phoneNumber || !countryCode) return false
  try {
    return libIsValidPhoneNumber(phoneNumber, countryCode)
  } catch {
    return false
  }
}

// Turns a locally-typed number ("8012345678") into a full E.164
// number ("+2348012345678") using the selected country as context.
// This is what should actually get stored, not the raw local-format
// input -- a bare local number is ambiguous outside its own country
// and isn't directly usable/dialable on its own. Call this AFTER
// isValidPhoneNumber() already confirmed the number is valid; returns
// null if parsing fails for any reason (defensive -- shouldn't happen
// if the validity check already passed).
export function formatPhoneNumberE164(phoneNumber, countryCode) {
  try {
    return parsePhoneNumber(phoneNumber, countryCode).format('E.164')
  } catch {
    return null
  }
}

// ------------------------------------------------------------------
// PASSWORD COMPLEXITY (pass/fail checklist)
// Exposed as a list of individual checks, not just one pass/fail
// function -- this lets the signup form show a live checklist of
// which requirements are met as the person types, instead of a single
// vague "invalid password" error after they hit submit.
// ------------------------------------------------------------------
export function getPasswordRequirements() {
  return [
    { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
    { id: 'uppercase', label: 'At least one uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
    { id: 'number', label: 'At least one number', test: (pw) => /[0-9]/.test(pw) },
    { id: 'symbol', label: 'At least one symbol (e.g. ! @ # $)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
  ]
}

export function isPasswordValid(password) {
  return getPasswordRequirements().every((requirement) => requirement.test(password))
}

// ------------------------------------------------------------------
// PASSWORD STRENGTH (visual meter, separate from pass/fail)
// The checklist above is a hard gate -- meet it or the form won't
// submit. Strength is softer: it rewards going beyond the minimum,
// purely as feedback, not as a submission requirement.
// ------------------------------------------------------------------
const STRENGTH_LEVELS = [
  { label: 'Very weak', color: '#d32f2f' },
  { label: 'Weak', color: '#f57c00' },
  { label: 'Fair', color: '#fbc02d' },
  { label: 'Good', color: '#7cb342' },
  { label: 'Strong', color: '#388e3c' },
]

export function getPasswordStrength(password) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const clampedScore = Math.min(score, STRENGTH_LEVELS.length - 1)
  const level = STRENGTH_LEVELS[clampedScore]

  return {
    score: clampedScore,
    percent: Math.round((clampedScore / (STRENGTH_LEVELS.length - 1)) * 100),
    label: level.label,
    color: level.color,
  }
}