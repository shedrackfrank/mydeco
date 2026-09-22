import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchConversation,
  fetchMessages,
  sendMessage,
  subscribeToMessages,
  editMessage,
  deleteMessageForMe,
  hideConversation,
} from '../lib/messaging'
import { fetchUserProfile } from '../lib/auth'
import { blockUser, unblockUser, isBlocked, fileReport, hasReported } from '../lib/moderation'

function ChatPage() {
  const { conversationId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [conversationRole, setConversationRole] = useState(null) // 'customer' | 'decorator', for THIS conversation
  const [otherUser, setOtherUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  const [blocked, setBlocked] = useState(false)
  const [blockActionLoading, setBlockActionLoading] = useState(false)
  const [reported, setReported] = useState(false)
  const [reportActionLoading, setReportActionLoading] = useState(false)
  const [deletingConversation, setDeletingConversation] = useState(false)
  const [actionError, setActionError] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [messageActionError, setMessageActionError] = useState(null)

  const bottomRef = useRef(null)

  // Loads the thread plus who the other participant is (for the
  // header and for block/report), then subscribes to new messages for
  // as long as this conversation stays open. New messages this user
  // sent themself are skipped in the subscription -- handleSend
  // already adds them to state immediately, so re-adding them from
  // the realtime event would show every sent message twice.
  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const conversation = await fetchConversation(conversationId)
        const role = conversation.customer_id === user.id ? 'customer' : 'decorator'
        const otherUserId = role === 'customer' ? conversation.decorator_id : conversation.customer_id

        const [otherUserRow, messageRows, alreadyBlocked, alreadyReported] = await Promise.all([
          fetchUserProfile(otherUserId),
          fetchMessages(conversationId),
          isBlocked(user.id, otherUserId),
          hasReported(user.id, 'user', otherUserId),
        ])

        if (!isMounted) return
        setConversationRole(role)
        setOtherUser(otherUserRow)
        setMessages(messageRows)
        setBlocked(alreadyBlocked)
        setReported(alreadyReported)
      } catch (err) {
        if (isMounted) setLoadError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()

    const unsubscribe = subscribeToMessages(conversationId, (newMessage) => {
      if (newMessage.sender_id === user.id) return
      setMessages((prev) => [...prev, newMessage])
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [conversationId, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim()) return

    setSendError(null)
    setSending(true)
    try {
      const saved = await sendMessage({ conversationId, senderId: user.id, body: draft })
      setMessages((prev) => [...prev, saved])
      setDraft('')
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  function startEditing(message) {
    setEditingId(message.id)
    setEditDraft(message.body)
  }

  async function handleSaveEdit(messageId) {
    setMessageActionError(null)
    try {
      const updated = await editMessage(messageId, editDraft)
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)))
      setEditingId(null)
    } catch (err) {
      setMessageActionError(err.message)
    }
  }

  async function handleDeleteMessage(message) {
    setMessageActionError(null)
    try {
      await deleteMessageForMe(message.id, message.sender_id === user.id)
      setMessages((prev) => prev.filter((m) => m.id !== message.id))
    } catch (err) {
      setMessageActionError(err.message)
    }
  }

  async function handleToggleBlock() {
    setActionError(null)
    setBlockActionLoading(true)
    try {
      if (blocked) {
        await unblockUser(user.id, otherUser.id)
        setBlocked(false)
      } else {
        await blockUser(user.id, otherUser.id)
        setBlocked(true)
      }
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBlockActionLoading(false)
    }
  }

  async function handleReport() {
    // window.prompt is a deliberately low-effort choice here -- this
    // is a rare, occasional action, not a core flow worth a full form
    // and extra state for.
    const reason = window.prompt('Briefly, why are you reporting this person?')
    if (!reason) return

    setActionError(null)
    setReportActionLoading(true)
    try {
      await fileReport({ reporterId: user.id, targetType: 'user', targetId: otherUser.id, reason })
      setReported(true)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setReportActionLoading(false)
    }
  }

  async function handleDeleteConversation() {
    if (!window.confirm("Delete this conversation? It'll disappear from your inbox -- the other person keeps their copy.")) return

    setActionError(null)
    setDeletingConversation(true)
    try {
      await hideConversation(conversationId, conversationRole)
      navigate('/inbox')
    } catch (err) {
      setActionError(err.message)
      setDeletingConversation(false)
    }
  }

  if (loading) {
    return <p>Loading...</p>
  }

  if (loadError) {
    return <p className="form-error">{loadError}</p>
  }

  return (
    <section className="chat-page">
      <div className="chat-header">
        <div className="chat-header-identity">
          <div
            className="decorator-avatar"
            style={otherUser?.avatar_url ? { backgroundImage: `url(${otherUser.avatar_url})`, backgroundSize: 'cover' } : undefined}
          >
            {!otherUser?.avatar_url && (otherUser?.username?.[0]?.toUpperCase() || '?')}
          </div>
          <h1>{otherUser?.username || 'Conversation'}</h1>
        </div>
        <div className="chat-header-actions">
          <button type="button" onClick={handleToggleBlock} disabled={blockActionLoading}>
            {blocked ? 'Unblock' : 'Block'}
          </button>
          <button type="button" onClick={handleReport} disabled={reportActionLoading || reported}>
            {reported ? 'Reported' : 'Report'}
          </button>
          <button type="button" onClick={handleDeleteConversation} disabled={deletingConversation}>
            {deletingConversation ? 'Deleting…' : 'Delete conversation'}
          </button>
        </div>
      </div>
      {actionError && <p className="form-error">{actionError}</p>}
      {blocked && <p className="form-notice">You've blocked this person. Neither of you can send new messages here until you unblock them.</p>}

      <div className="chat-messages">
        {messages.map((message) => {
          const isOwn = message.sender_id === user.id
          const isEditing = editingId === message.id
          return (
            <div key={message.id} className={isOwn ? 'chat-message chat-message-own' : 'chat-message'}>
              {isEditing ? (
                <div className="chat-message-edit">
                  <input
                    type="text"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                  />
                  <button type="button" onClick={() => handleSaveEdit(message.id)}>Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <p>{message.body}</p>
                  <p className="chat-message-time">
                    {new Date(message.created_at).toLocaleTimeString()}
                    {message.edited_at && ' · edited'}
                  </p>
                  <div className="chat-message-actions">
                    {isOwn && <button type="button" onClick={() => startEditing(message)}>Edit</button>}
                    <button type="button" onClick={() => handleDeleteMessage(message)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {messageActionError && <p className="form-error">{messageActionError}</p>}

      <form onSubmit={handleSend} className="chat-composer">
        <label className="sr-only" htmlFor="chat-draft">Message</label>
        <input
          id="chat-draft"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          disabled={blocked}
        />
        <button type="submit" disabled={sending || !draft.trim() || blocked}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {sendError && <p className="form-error">{sendError}</p>}
    </section>
  )
}

export default ChatPage