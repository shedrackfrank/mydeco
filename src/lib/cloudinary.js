import { supabase } from './supabaseClient'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

// Checked client-side first for instant feedback, and again inside
// uploadPortfolioPhoto as a safety net -- someone could otherwise call
// that function directly and skip this check.
export function validatePhotoFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Please upload a JPEG, PNG, or WebP image.'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'Image must be smaller than 10MB.'
  }
  return null // no error
}

// Uploads a single photo to Cloudinary in two steps:
//   1. Ask our Edge Function for a signed permission slip -- this also
//      confirms the caller is really a logged-in decorator (see
//      supabase/functions/cloudinary-sign/index.ts).
//   2. Send the actual file straight from the browser to Cloudinary
//      using that permission slip. The file itself never passes
//      through our own server or Edge Function -- only the small
//      signature request does, which keeps uploads fast and keeps our
//      free Edge Function usage low.
export async function uploadPortfolioPhoto(file) {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  const { data: signData, error: signError } = await supabase.functions.invoke('cloudinary-sign')

  if (signError) throw signError
  if (signData?.error) throw new Error(signData.error)

  const { signature, timestamp, folder, apiKey, cloudName } = signData

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', apiKey)
  formData.append('timestamp', timestamp)
  formData.append('signature', signature)
  formData.append('folder', folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Upload failed. Please try again.')
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  }
}

// Counterpart to uploadPortfolioPhoto -- removes both the file on
// Cloudinary and the portfolio_items row in one call, via the
// cloudinary-delete Edge Function (see
// supabase/functions/cloudinary-delete/index.ts). This is what closes
// the gap noted when portfolio.js was first built: deleting used to
// only remove the database record and silently leave the actual photo
// sitting in Cloudinary storage forever.
export async function deletePortfolioPhoto(portfolioItemId) {
  const { data, error } = await supabase.functions.invoke('cloudinary-delete', {
    body: { portfolioItemId },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return data
}

// ------------------------------------------------------------------
// AVATAR (both customers and decorators)
// Same two-step pattern as uploadPortfolioPhoto, but via
// cloudinary-sign-avatar instead of cloudinary-sign -- that one is
// decorator-only, this one is open to any logged-in user.
// ------------------------------------------------------------------

export async function uploadAvatar(file) {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  const { data: signData, error: signError } = await supabase.functions.invoke('cloudinary-sign-avatar')

  if (signError) throw signError
  if (signData?.error) throw new Error(signData.error)

  const { signature, timestamp, folder, apiKey, cloudName } = signData

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', apiKey)
  formData.append('timestamp', timestamp)
  formData.append('signature', signature)
  formData.append('folder', folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Upload failed. Please try again.')
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  }
}

// Removes the CURRENT user's own avatar from Cloudinary and clears it
// in user_profiles, via cloudinary-delete-avatar. Call this before
// uploadAvatar() when replacing an existing avatar, so the old file
// doesn't linger in Cloudinary storage -- and call it on its own for
// a plain "remove my photo" action.
export async function deleteAvatar() {
  const { data, error } = await supabase.functions.invoke('cloudinary-delete-avatar')

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return data
}