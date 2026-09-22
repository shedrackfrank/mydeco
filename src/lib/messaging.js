import { supabase } from './supabaseClient'
import { fetchUserProfilesByIds } from './auth'
import { notifyByEmail } from './notifications'

// ------------------------------------------------------------------
// CONVERSATIONS
// ------------------------------------------------------------------

// Returns the existing conversation between this customer and
// decorator, creating one if it doesn't exist yet. Safe to call every
// time a customer clicks "Message" on a profile -- upsert means a
// second click never creates a duplicate thread.
//
// Only ever call this as the CUSTOMER. The insert RLS policy requires
// auth.uid() = customer_id, and Postgres checks that policy even on
// the ON CONFLICT DO UPDATE path -- so a decorator calling this would
// be rejected even for a conversation they're already part of. A
// decorator doesn't need this function anyway: they reach existing
// threads through fetchConversations/InboxPage instead.
export async function findOrCreateConversation(customerId, decoratorId) {
  const { data, error } = await supabase
    .from('conversations')
    .upsert(
      { customer_id: customerId, decorator_id: decoratorId },
      { onConflict: 'customer_id,decorator_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

// Every conversation the given user is part of (as either the
// customer or the decorator side), newest activity first, with the
// OTHER participant's profile and their latest message attached --
// everything InboxPage.jsx needs in one call. Conversations this user
// has hidden (see hideConversation below) are excluded -- filtered
// here rather than in RLS, since hiding your own conversation from
// your own inbox isn't a security boundary, just a display
// preference, so there's no real need to enforce it at that level.
export async function fetchConversations(userId) {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, customer_id, decorator_id, last_message_at, hidden_for_customer, hidden_for_decorator')
    .or(`customer_id.eq.${userId},decorator_id.eq.${userId}`)
    .order('last_message_at', { ascending: false })

  if (error) throw error

  const visible = conversations.filter((c) => {
    const isCustomer = c.customer_id === userId
    return isCustomer ? !c.hidden_for_customer : !c.hidden_for_decorator
  })

  if (visible.length === 0) return []

  const otherUserIds = visible.map((c) => (c.customer_id === userId ? c.decorator_id : c.customer_id))
  const conversationIds = visible.map((c) => c.id)

  const [profiles, latestMessages] = await Promise.all([
    fetchUserProfilesByIds(otherUserIds),
    fetchLatestMessages(conversationIds),
  ])

  return visible.map((conversation) => {
    const otherUserId = conversation.customer_id === userId ? conversation.decorator_id : conversation.customer_id
    return {
      ...conversation,
      otherUser: profiles[otherUserId] || null,
      latestMessage: latestMessages[conversation.id] || null,
    }
  })
}

// Removes a conversation from the CALLER's own inbox only -- the
// other participant's copy, and every message in it, is completely
// untouched. role is whichever this user is IN this conversation
// ('customer' or 'decorator'), not their account-wide role.
export async function hideConversation(conversationId, role) {
  const column = role === 'customer' ? 'hidden_for_customer' : 'hidden_for_decorator'
  const { error } = await supabase
    .from('conversations')
    .update({ [column]: true })
    .eq('id', conversationId)

  if (error) throw error
}

// A single conversation's raw row -- used by ChatPage.jsx to figure
// out who the OTHER participant is (for the header, and for
// block/report actions), since fetchMessages alone doesn't carry
// that.
export async function fetchConversation(conversationId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, customer_id, decorator_id')
    .eq('id', conversationId)
    .single()

  if (error) throw error
  return data
}

// ------------------------------------------------------------------
// MESSAGES
// ------------------------------------------------------------------

export async function fetchMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

// conversations.last_message_at updates itself via the
// messages_touch_conversation trigger in the migration -- nothing
// extra to do here for that.
export async function sendMessage({ conversationId, senderId, body }) {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Message cannot be empty.')

  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: trimmed })
    .select()
    .single()

  if (error) throw error

  notifyByEmail({ type: 'message', conversationId })

  return data
}

// Edits the sender's own message body. The database trigger
// (messages_edit_rules in the migration) rejects this outright if the
// caller isn't the original sender, and stamps edited_at
// automatically -- this function never sets edited_at itself.
export async function editMessage(messageId, newBody) {
  const trimmed = newBody.trim()
  if (!trimmed) throw new Error('Message cannot be empty.')

  const { data, error } = await supabase
    .from('messages')
    .update({ body: trimmed })
    .eq('id', messageId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Hides a message from the CALLER's own view only -- the other
// participant's copy is untouched, and the row itself is never
// deleted (see the migration for why: this keeps the reports system
// meaningful). isSender should reflect whether the CURRENT user sent
// this particular message, not their role in the conversation
// generally.
export async function deleteMessageForMe(messageId, isSender) {
  const column = isSender ? 'deleted_for_sender' : 'deleted_for_recipient'
  const { error } = await supabase
    .from('messages')
    .update({ [column]: true })
    .eq('id', messageId)

  if (error) throw error
}

// Live-updates ChatPage.jsx when the other person sends a message,
// via Supabase Realtime. Call the returned function to unsubscribe --
// e.g. in a useEffect cleanup -- when the page unmounts or the
// conversation changes.
export function subscribeToMessages(conversationId, onNewMessage) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onNewMessage(payload.new)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ------------------------------------------------------------------
// INTERNAL HELPERS
// ------------------------------------------------------------------

async function fetchLatestMessages(conversationIds) {
  if (conversationIds.length === 0) return {}

  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id, body, created_at, sender_id')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  if (error) throw error

  // Rows come back newest-first, so the first row seen for each
  // conversation_id is already its latest message -- no separate
  // per-conversation sort needed.
  const latest = {}
  for (const message of data) {
    if (!latest[message.conversation_id]) latest[message.conversation_id] = message
  }
  return latest
}