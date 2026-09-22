import { supabase } from './supabaseClient'
import { notifyByEmail } from './notifications'

// ------------------------------------------------------------------
// PROFILE VIEWS
// ------------------------------------------------------------------

// Call this once when a customer opens a decorator's public profile
// page. Deliberately swallows errors instead of throwing -- a failed
// view log shouldn't ever break the page for the person viewing it.
// Silently does nothing if the decorator is viewing their own profile
// (the database would reject it anyway; this just skips the network
// call entirely).
export async function logProfileView(decoratorId, viewerId) {
  if (!viewerId || viewerId === decoratorId) return

  const { error } = await supabase
    .from('portfolio_views')
    .insert({ decorator_id: decoratorId, viewer_id: viewerId })

  if (error) console.error('Failed to log profile view:', error.message)
}

async function fetchViewCount(decoratorId) {
  const { count, error } = await supabase
    .from('portfolio_views')
    .select('*', { count: 'exact', head: true })
    .eq('decorator_id', decoratorId)

  if (error) throw error
  return count || 0
}

// ------------------------------------------------------------------
// REACTIONS (per PRODUCT now, not per decorator -- customers react to
// individual products, since products are what's actually browsed.
// One row per customer per product; reacting again just changes the
// existing row's type instead of creating a new one.)
// ------------------------------------------------------------------

export async function fetchMyReaction(portfolioItemId, customerId) {
  const { data, error } = await supabase
    .from('reactions')
    .select('type')
    .eq('portfolio_item_id', portfolioItemId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) throw error
  return data?.type || null
}

export async function setReaction(portfolioItemId, customerId, type) {
  const { error } = await supabase
    .from('reactions')
    .upsert(
      { portfolio_item_id: portfolioItemId, customer_id: customerId, type },
      { onConflict: 'portfolio_item_id,customer_id' }
    )

  if (error) throw error

  notifyByEmail({ type: 'reaction', portfolioItemId })
}

export async function removeReaction(portfolioItemId, customerId) {
  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('portfolio_item_id', portfolioItemId)
    .eq('customer_id', customerId)

  if (error) throw error
}

// Batched reaction counts for a whole list of products at once, e.g.
// every product on a decorator's public profile -- one query instead
// of one per product card. Returns { [portfolioItemId]: { like: N,
// love: N, wow: N } }; a product with no reactions is simply absent.
export async function fetchReactionCountsForItems(portfolioItemIds) {
  if (!portfolioItemIds || portfolioItemIds.length === 0) return {}

  const { data, error } = await supabase
    .from('reactions')
    .select('portfolio_item_id, type')
    .in('portfolio_item_id', portfolioItemIds)

  if (error) throw error

  return data.reduce((counts, row) => {
    if (!counts[row.portfolio_item_id]) counts[row.portfolio_item_id] = {}
    counts[row.portfolio_item_id][row.type] = (counts[row.portfolio_item_id][row.type] || 0) + 1
    return counts
  }, {})
}

// Batched "which of these products has this customer already reacted
// to, and with what" -- same one-query-for-everything reasoning as
// above. Returns { [portfolioItemId]: type }.
export async function fetchMyReactionsForItems(portfolioItemIds, customerId) {
  if (!portfolioItemIds || portfolioItemIds.length === 0) return {}

  const { data, error } = await supabase
    .from('reactions')
    .select('portfolio_item_id, type')
    .in('portfolio_item_id', portfolioItemIds)
    .eq('customer_id', customerId)

  if (error) throw error

  return Object.fromEntries(data.map((row) => [row.portfolio_item_id, row.type]))
}

// Total reactions across EVERY product a decorator has -- what the
// dashboard's single "Reactions" stat card needs. portfolio_items!inner
// turns the embed into a real join, letting the filter below apply to
// the joined table instead of being silently ignored (same technique
// used for the country filter in portfolio.js's fetchDecorators).
async function fetchTotalReactionCount(decoratorId) {
  const { count, error } = await supabase
    .from('reactions')
    .select('*, portfolio_items!inner(decorator_id)', { count: 'exact', head: true })
    .eq('portfolio_items.decorator_id', decoratorId)

  if (error) throw error
  return count || 0
}

// Batched average rating + review count per decorator, for cards on
// BrowsePage.jsx -- one query for the whole visible list instead of a
// separate query per card. Same shape as fetchPortfolioCounts in
// portfolio.js. Missing ids just mean no reviews yet.
export async function fetchAverageRatings(decoratorIds) {
  if (!decoratorIds || decoratorIds.length === 0) return {}

  const { data, error } = await supabase
    .from('reviews')
    .select('decorator_id, rating')
    .in('decorator_id', decoratorIds)

  if (error) throw error

  const grouped = data.reduce((acc, row) => {
    if (!acc[row.decorator_id]) acc[row.decorator_id] = []
    acc[row.decorator_id].push(row.rating)
    return acc
  }, {})

  return Object.fromEntries(
    Object.entries(grouped).map(([decoratorId, ratings]) => [
      decoratorId,
      { average: ratings.reduce((sum, r) => sum + r, 0) / ratings.length, count: ratings.length },
    ])
  )
}

// ------------------------------------------------------------------
// REVIEWS
// One row per customer per decorator -- a customer edits their
// existing review rather than leaving several.
// ------------------------------------------------------------------

// Joins in the reviewer's username so the dashboard and public profile
// page can show who left each review without a second query.
export async function fetchReviews(decoratorId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, customer_id, user_profiles(username)')
    .eq('decorator_id', decoratorId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// The reviewing customer's own review, to prefill an edit form.
export async function fetchMyReview(decoratorId, customerId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment')
    .eq('decorator_id', decoratorId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) throw error
  return data
}

// Creates the review on first submit, updates it on every submit after
// -- same upsert pattern as saveDecoratorProfile in portfolio.js.
export async function submitReview({ decoratorId, customerId, rating, comment }) {
  const { data, error } = await supabase
    .from('reviews')
    .upsert(
      {
        decorator_id: decoratorId,
        customer_id: customerId,
        rating,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'decorator_id,customer_id' }
    )
    .select()
    .single()

  if (error) throw error

  notifyByEmail({ type: 'review', decoratorId, rating })

  return data
}

export async function deleteReview(reviewId) {
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', reviewId)

  if (error) throw error
}

// ------------------------------------------------------------------
// FOLLOWS
// One row per customer per decorator.
// ------------------------------------------------------------------

// Whether the given user is following this decorator -- lets a profile
// page show "Follow" vs "Following".
export async function isFollowing(decoratorId, followerId) {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('decorator_id', decoratorId)
    .eq('follower_id', followerId)
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function followDecorator(decoratorId, followerId) {
  const { error } = await supabase
    .from('follows')
    .insert({ decorator_id: decoratorId, follower_id: followerId })

  if (error) throw error

  notifyByEmail({ type: 'follow', decoratorId })
}

export async function unfollowDecorator(decoratorId, followerId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('decorator_id', decoratorId)
    .eq('follower_id', followerId)

  if (error) throw error
}

async function fetchFollowerCount(decoratorId) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('decorator_id', decoratorId)

  if (error) throw error
  return count || 0
}

// ------------------------------------------------------------------
// COMBINED STATS
// One call for DashboardPage.jsx to get everything it needs to render
// the analytics section, instead of wiring up four separate loading
// states for one screen.
// ------------------------------------------------------------------

export async function fetchDecoratorStats(decoratorId) {
  const [viewCount, totalReactionCount, reviews, followerCount] = await Promise.all([
    fetchViewCount(decoratorId),
    fetchTotalReactionCount(decoratorId),
    fetchReviews(decoratorId),
    fetchFollowerCount(decoratorId),
  ])

  const reviewCount = reviews.length
  const averageRating = reviewCount
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
    : null

  return { viewCount, totalReactionCount, reviews, reviewCount, averageRating, followerCount }
}