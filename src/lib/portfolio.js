import { supabase } from './supabaseClient'

// Single source of truth for the four fixed categories -- must stay in
// sync with the check constraint in
// supabase/migrations/20260811000001_products_and_avatars.sql.
// Every page that needs the category list (settings, browse, public
// profile) imports it from here instead of retyping the array.
export const CATEGORIES = ['Interior Decorator', 'Event Plans', 'Birthday Plans', 'Wedding Plans']

// ------------------------------------------------------------------
// DECORATOR PROFILE
// A decorator has exactly ONE category (not several) -- once set,
// the app simply never offers a way to change it again. That's
// enforced here at the UI level only, not the database, on purpose:
// it stays correctable by hand for a genuine edge case, without
// needing a database trigger.
// ------------------------------------------------------------------

export async function fetchDecoratorProfile(userId) {
  const { data, error } = await supabase
    .from('decorator_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data // null if this decorator hasn't filled in their profile yet
}

// Creates the profile on first save, updates it on every save after --
// upsert() picks whichever is needed based on whether user_id already
// exists. Pricing no longer lives here -- see saveProduct below,
// pricing is per-product now.
export async function saveDecoratorProfile({ userId, bio, category }) {
  const { data, error } = await supabase
    .from('decorator_profiles')
    .upsert({ user_id: userId, bio, category })
    .select()
    .single()

  if (error) throw error
  return data
}

// ------------------------------------------------------------------
// PRODUCTS ("portfolio items" in the database and in older code
// comments -- "products" is the user-facing term now that each one
// can carry its own price and description, but the underlying table
// keeps its original name to avoid an unnecessary, riskier rename)
// ------------------------------------------------------------------

export async function fetchPortfolioItems(decoratorId) {
  const { data, error } = await supabase
    .from('portfolio_items')
    .select('*')
    .eq('decorator_id', decoratorId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// Call this AFTER uploadPortfolioPhoto() succeeds -- this saves the
// database record pointing at the already-uploaded Cloudinary photo;
// it doesn't upload anything itself. No category param anymore -- a
// product automatically falls under whichever single category the
// decorator themself is set to.
export async function savePortfolioItem({ decoratorId, imageUrl, imagePublicId, caption, price }) {
  const { data, error } = await supabase
    .from('portfolio_items')
    .insert({
      decorator_id: decoratorId,
      image_url: imageUrl,
      image_public_id: imagePublicId,
      caption: caption || null,
      price: price || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Removes the database record ONLY, not the underlying Cloudinary
// file. Kept as a low-level building block, but the app itself should
// call deletePortfolioPhoto() in cloudinary.js instead -- that's the
// one that also cleans up Cloudinary via the cloudinary-delete Edge
// Function.
export async function deletePortfolioItem(itemId) {
  const { error } = await supabase
    .from('portfolio_items')
    .delete()
    .eq('id', itemId)

  if (error) throw error
}

// Photo count per decorator, for showing "12 products" on a browse
// card without a separate query per card. Pass every decorator_id
// you're about to render; missing ids just mean 0 in the returned map.
export async function fetchPortfolioCounts(decoratorIds) {
  if (!decoratorIds || decoratorIds.length === 0) return {}

  const { data, error } = await supabase
    .from('portfolio_items')
    .select('decorator_id')
    .in('decorator_id', decoratorIds)

  if (error) throw error

  return data.reduce((counts, row) => {
    counts[row.decorator_id] = (counts[row.decorator_id] || 0) + 1
    return counts
  }, {})
}

// ------------------------------------------------------------------
// BROWSE (customer-facing decorator search)
// ------------------------------------------------------------------

// Lists visible decorator profiles with their user_profiles row
// embedded (for username + country). !inner turns that embed into
// an actual join, which is what lets .eq('user_profiles.country', ...)
// and .ilike('user_profiles.username', ...) below work as real
// filters instead of being silently ignored -- PostgREST only
// supports filtering on embedded resources this way. All three
// filters are optional -- called with none, this just lists everyone.
// Disabled profiles are excluded automatically by the same RLS policy
// that hides them everywhere else, not by a client-side filter here.
export async function fetchDecorators({ category, country, search } = {}) {
  let query = supabase
    .from('decorator_profiles')
    .select('user_id, bio, category, user_profiles!inner(username, country, avatar_url)')
    .order('created_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }
  if (country) {
    query = query.eq('user_profiles.country', country)
  }
  if (search) {
    query = query.ilike('user_profiles.username', `%${search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}