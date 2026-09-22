import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchConversations } from '../lib/messaging'

function truncate(text, maxLength = 60) {
  if (!text || text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

function InboxPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const rows = await fetchConversations(user.id)
        if (isMounted) setConversations(rows)
      } catch (err) {
        if (isMounted) setLoadError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => { isMounted = false }
  }, [user])

  if (loading) {
    return <p>Loading...</p>
  }

  if (loadError) {
    return <p className="form-error">{loadError}</p>
  }

  return (
    <section>
      <h1>Inbox</h1>

      {conversations.length === 0 && <p>No conversations yet.</p>}

      <div className="conversation-list">
        {conversations.map((conversation) => {
          const otherName = conversation.otherUser?.username || 'Unknown user'
          const preview = conversation.latestMessage
            ? `${conversation.latestMessage.sender_id === user.id ? 'You: ' : ''}${truncate(conversation.latestMessage.body)}`
            : 'No messages yet.'

          return (
            <Link key={conversation.id} to={`/chat/${conversation.id}`} className="conversation-item">
              <div
                className="decorator-avatar"
                style={conversation.otherUser?.avatar_url ? { backgroundImage: `url(${conversation.otherUser.avatar_url})`, backgroundSize: 'cover' } : undefined}
              >
                {!conversation.otherUser?.avatar_url && (otherName[0]?.toUpperCase() || '?')}
              </div>
              <div>
                <p className="conversation-name">{otherName}</p>
                <p className="conversation-preview">{preview}</p>
              </div>
              <p className="conversation-time">{new Date(conversation.last_message_at).toLocaleString()}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default InboxPage