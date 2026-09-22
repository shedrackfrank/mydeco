import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'
import { fetchUserProfile } from '../lib/auth'
import { fetchDecoratorProfile, fetchPortfolioItems } from '../lib/portfolio'
import { findOrCreateConversation } from '../lib/messaging'
import {
  logProfileView,
  fetchDecoratorStats,
  fetchReactionCountsForItems,
  fetchMyReactionsForItems,
  setReaction,
  removeReaction,
  isFollowing,
  followDecorator,
  unfollowDecorator,
  fetchMyReview,
  submitReview,
  deleteReview,
} from '../lib/analytics'
import { getCategoryTheme } from '../lib/theme'
import { fileReport, hasReported } from '../lib/moderation'

const REACTION_TYPES = [
  { type: 'like', icon: 'ti-thumb-up', label: 'Like' },
  { type: 'love', icon: 'ti-heart', label: 'Love' },
  { type: 'wow', icon: 'ti-sparkles', label: 'Wow' },
]

function DecoratorProfilePage() {
  const { id: decoratorId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isOwnProfile = user?.id === decoratorId
  const canInteract = !isOwnProfile && profile?.role === 'customer'

  const [decoratorUser, setDecoratorUser] = useState(null)
  const [decoratorProfile, setDecoratorProfile] = useState(null)
  const [portfolioItems, setPortfolioItems] = useState([])
  const [stats, setStats] = useState(null)
  const [reactionCounts, setReactionCounts] = useState({}) // { [itemId]: { like: N, ... } }
  const [myReactions, setMyReactions] = useState({}) // { [itemId]: type }
  const [following, setFollowing] = useState(false)
  const [myReview, setMyReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [messageError, setMessageError] = useState(null)
  const [messaging, setMessaging] = useState(false)
  const [reportedDecorator, setReportedDecorator] = useState(false)
  const [reportedReviewIds, setReportedReviewIds] = useState(new Set())
  const [reportActionError, setReportActionError] = useState(null)

  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const [userRow, profileRow, items, decoratorStats] = await Promise.all([
          fetchUserProfile(decoratorId),
          fetchDecoratorProfile(decoratorId),
          fetchPortfolioItems(decoratorId),
          fetchDecoratorStats(decoratorId),
        ])

        if (!isMounted) return

        setDecoratorUser(userRow)
        setDecoratorProfile(profileRow)
        setPortfolioItems(items)
        setStats(decoratorStats)

        const itemIds = items.map((item) => item.id)
        const counts = await fetchReactionCountsForItems(itemIds)
        if (!isMounted) return
        setReactionCounts(counts)

        // The reaction/follow/review checks below only matter for a
        // customer looking at someone else's profile -- skipped
        // entirely when a decorator is previewing their own page.
        if (user && canInteract && profileRow) {
          logProfileView(decoratorId, user.id)
          const [myItemReactions, follows, existingReview, alreadyReported] = await Promise.all([
            fetchMyReactionsForItems(itemIds, user.id),
            isFollowing(decoratorId, user.id),
            fetchMyReview(decoratorId, user.id),
            hasReported(user.id, 'user', decoratorId),
          ])
          if (!isMounted) return
          setMyReactions(myItemReactions)
          setFollowing(follows)
          setMyReview(existingReview)
          setReportedDecorator(alreadyReported)
          if (existingReview) {
            setReviewRating(existingReview.rating)
            setReviewComment(existingReview.comment || '')
          }
        }
      } catch (err) {
        if (isMounted) setLoadError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => { isMounted = false }
  }, [decoratorId, user, canInteract])

  if (loading) {
    return <p>Loading...</p>
  }

  if (loadError) {
    return <p className="form-error">{loadError}</p>
  }

  if (!decoratorProfile) {
    if (isOwnProfile) {
      return (
        <section>
          <h1>You haven't set up your profile yet</h1>
          <p><Link to="/settings">Go to Settings</Link> to add a bio and choose your category.</p>
        </section>
      )
    }
    return (
      <section>
        <h1>Profile not available</h1>
        <p>This decorator's profile doesn't exist or isn't currently visible.</p>
      </section>
    )
  }

  const theme = getCategoryTheme(decoratorProfile.category)

  async function handleToggleFollow() {
    try {
      if (following) {
        await unfollowDecorator(decoratorId, user.id)
        setFollowing(false)
        setStats((prev) => ({ ...prev, followerCount: prev.followerCount - 1 }))
      } else {
        await followDecorator(decoratorId, user.id)
        setFollowing(true)
        setStats((prev) => ({ ...prev, followerCount: prev.followerCount + 1 }))
      }
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function handleMessage() {
    setMessageError(null)
    setMessaging(true)
    try {
      const conversation = await findOrCreateConversation(user.id, decoratorId)
      navigate(`/chat/${conversation.id}`)
    } catch (err) {
      setMessageError(err.message)
    } finally {
      setMessaging(false)
    }
  }

  async function handleReaction(itemId, type) {
    const currentReaction = myReactions[itemId]
    try {
      if (currentReaction === type) {
        await removeReaction(itemId, user.id)
        setMyReactions((prev) => ({ ...prev, [itemId]: null }))
        setReactionCounts((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], [type]: Math.max((prev[itemId]?.[type] || 1) - 1, 0) },
        }))
      } else {
        await setReaction(itemId, user.id, type)
        setReactionCounts((prev) => {
          const counts = { ...(prev[itemId] || {}) }
          if (currentReaction) counts[currentReaction] = Math.max((counts[currentReaction] || 1) - 1, 0)
          counts[type] = (counts[type] || 0) + 1
          return { ...prev, [itemId]: counts }
        })
        setMyReactions((prev) => ({ ...prev, [itemId]: type }))
      }
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function handleReportDecorator() {
    const reason = window.prompt('Briefly, why are you reporting this decorator?')
    if (!reason) return

    setReportActionError(null)
    try {
      await fileReport({ reporterId: user.id, targetType: 'user', targetId: decoratorId, reason })
      setReportedDecorator(true)
    } catch (err) {
      setReportActionError(err.message)
    }
  }

  async function handleReportReview(reviewId) {
    const reason = window.prompt('Briefly, why are you reporting this review?')
    if (!reason) return

    setReportActionError(null)
    try {
      await fileReport({ reporterId: user.id, targetType: 'review', targetId: reviewId, reason })
      setReportedReviewIds((prev) => new Set(prev).add(reviewId))
    } catch (err) {
      setReportActionError(err.message)
    }
  }

  async function handleReviewSubmit(e) {
    e.preventDefault()
    setReviewError(null)
    setReviewSaving(true)
    try {
      const saved = await submitReview({
        decoratorId,
        customerId: user.id,
        rating: reviewRating,
        comment: reviewComment,
      })
      setMyReview(saved)
      // Refetches rather than hand-rolling the average/count update
      // twice -- fine at this scale, and it keeps the review list and
      // the math it drives from ever drifting apart.
      setStats(await fetchDecoratorStats(decoratorId))
    } catch (err) {
      setReviewError(err.message)
    } finally {
      setReviewSaving(false)
    }
  }

  async function handleReviewDelete() {
    if (!myReview) return
    setReviewSaving(true)
    try {
      await deleteReview(myReview.id)
      setMyReview(null)
      setReviewRating(5)
      setReviewComment('')
      setStats(await fetchDecoratorStats(decoratorId))
    } catch (err) {
      setReviewError(err.message)
    } finally {
      setReviewSaving(false)
    }
  }

  return (
    <section
      className="decorator-profile"
      style={{ '--accent': theme.accent, '--accent-dark': theme.accentDark, '--accent-bg': theme.accentBg }}
    >
      <div className="decorator-header">
        <div
          className="decorator-avatar"
          style={decoratorUser?.avatar_url ? { backgroundImage: `url(${decoratorUser.avatar_url})`, backgroundSize: 'cover' } : undefined}
        >
          {!decoratorUser?.avatar_url && (decoratorUser?.username?.[0]?.toUpperCase() || '?')}
        </div>
        <div>
          <h1>{decoratorUser?.username || 'Decorator'}</h1>
          <p className="decorator-categories">{decoratorProfile.category}</p>
          {decoratorProfile.bio && <p>{decoratorProfile.bio}</p>}

          {canInteract && (
            <div className="decorator-actions">
              <button type="button" onClick={handleToggleFollow}>
                {following ? 'Following' : 'Follow'}
              </button>
              {/* Real conversation-starting flow -- creates or
                  reopens the thread with this decorator and jumps
                  straight into it. */}
              <button type="button" onClick={handleMessage} disabled={messaging}>
                {messaging ? 'Opening…' : 'Message'}
              </button>
              <button type="button" onClick={handleReportDecorator} disabled={reportedDecorator}>
                {reportedDecorator ? 'Reported' : 'Report'}
              </button>
              {messageError && <p className="form-error">{messageError}</p>}
              {reportActionError && <p className="form-error">{reportActionError}</p>}
            </div>
          )}
          {isOwnProfile && (
            <p><em>This is how customers see your profile.</em> <Link to="/settings">Edit profile</Link></p>
          )}
        </div>
      </div>

      <div className="decorator-stats">
        <div><strong>{portfolioItems.length}</strong> products</div>
        <div><strong>{stats.followerCount}</strong> followers</div>
        <div>
          <strong>{stats.averageRating != null ? stats.averageRating.toFixed(1) : '—'}</strong> rating ({stats.reviewCount})
        </div>
      </div>

      <section aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading">Products</h2>
        {portfolioItems.length === 0 && <p>No products yet.</p>}
        <div className="portfolio-feed">
          {portfolioItems.map((item) => {
            const itemCounts = reactionCounts[item.id] || {}
            const myReaction = myReactions[item.id]
            return (
              <div key={item.id} className="portfolio-feed-item">
                <img src={item.image_url} alt={item.caption || 'Product photo'} />
                {item.caption && <p>{item.caption}</p>}
                {item.price != null && <p className="decorator-pricing">${item.price}</p>}

                {canInteract && (
                  <div className="reaction-bar">
                    {REACTION_TYPES.map(({ type, icon, label }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleReaction(item.id, type)}
                        className={myReaction === type ? 'reaction-active' : ''}
                      >
                        <Icon name={icon} /> {label} ({itemCounts[type] || 0})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="reviews-heading">
        <h2 id="reviews-heading">Reviews ({stats.reviewCount})</h2>

        {canInteract && (
          <form onSubmit={handleReviewSubmit}>
            <label>
              Rating
              <select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
                ))}
              </select>
            </label>
            <label>
              Comment (optional)
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} />
            </label>
            {reviewError && <p className="form-error">{reviewError}</p>}
            <button type="submit" disabled={reviewSaving}>
              {reviewSaving ? 'Saving…' : myReview ? 'Update review' : 'Submit review'}
            </button>
            {myReview && (
              <button type="button" onClick={handleReviewDelete} disabled={reviewSaving}>
                Delete review
              </button>
            )}
          </form>
        )}

        <div className="reviews-list">
          {stats.reviews.map((review) => (
            <div key={review.id} className="review-card">
              <p className="review-meta">
                <strong>{review.user_profiles?.username || 'A customer'}</strong> — {review.rating} / 5
              </p>
              {review.comment && <p>{review.comment}</p>}
              {canInteract && (
                <button type="button" onClick={() => handleReportReview(review.id)} disabled={reportedReviewIds.has(review.id)}>
                  {reportedReviewIds.has(review.id) ? 'Reported' : 'Report'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

export default DecoratorProfilePage