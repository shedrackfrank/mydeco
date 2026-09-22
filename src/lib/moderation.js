import { supabase } from './supabaseClient'
import { fetchUserProfilesByIds } from './auth'

// ------------------------------------------------------------------
// REPORTS
// Write-mostly from the client's side -- there's no admin review UI
// yet, so reports just accumulate in the table for now and get
// triaged by looking at it directly in the Supabase dashboard.
// ------------------------------------------------------------------

export async function fileReport({ reporterId, targetType, targetId, reason, details }) {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: reporterId, target_type: targetType, target_id: targetId, reason, details: details || null })

  if (error) throw error
}

// Lets a "Report" button turn into "Reported" instead of letting
// someone file the same report five times.
export async function hasReported(reporterId, targetType, targetId) {
  const { data, error } = await supabase
    .from('reports')
    .select('id')
    .eq('reporter_id', reporterId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle()

  if (error) throw error
  return !!data
}

// ------------------------------------------------------------------
// BLOCKS
// Actually enforced, not just a preference flag -- see the
// messages INSERT policy in
// supabase/migrations/20260812000001_reports_and_blocks.sql, which
// rejects new messages in a conversation once either side has
// blocked the other.
// ------------------------------------------------------------------

export async function blockUser(blockerId, blockedId) {
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId })

  if (error) throw error
}

export async function unblockUser(blockerId, blockedId) {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)

  if (error) throw error
}

export async function isBlocked(blockerId, blockedId) {
  const { data, error } = await supabase
    .from('blocks')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle()

  if (error) throw error
  return !!data
}

// Everyone the given user has blocked, with enough profile info to
// actually display them -- for the "Blocked users" list in Settings.
// Deliberately a two-step fetch rather than a single embedded query --
// blocks has TWO foreign keys into user_profiles (blocker_id AND
// blocked_id), so an embed would need to name the exact
// auto-generated constraint to disambiguate them, which is fragile if
// that name doesn't match what's actually in the database. Same
// simpler, more robust pattern already used in fetchConversations
// (messaging.js).
export async function fetchBlockedUsers(blockerId) {
  const { data: blocks, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (blocks.length === 0) return []

  const profiles = await fetchUserProfilesByIds(blocks.map((row) => row.blocked_id))
  return blocks.map((row) => ({ ...row, user_profiles: profiles[row.blocked_id] || null }))
}