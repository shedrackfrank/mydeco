import { supabase } from './supabaseClient'

// Fire-and-forget on purpose, same reasoning as logProfileView in
// analytics.js -- a failed notification email should never break the
// actual action (sending a message, following someone, etc.) that
// triggered it. Errors are swallowed here; if you need to debug why
// an email didn't arrive, check the send-notification-email function
// logs in the Supabase dashboard instead.
export function notifyByEmail(payload) {
  supabase.functions.invoke('send-notification-email', { body: payload })
    .catch((err) => console.error('Notification email failed to send:', err.message))
}