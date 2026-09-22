import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getCurrentUserProfile } from '../lib/auth'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Pulls the current user + profile fresh from Supabase and updates
  // state. Also exposed as refreshProfile() in the context value, so
  // pages like /choose-role can update the app's auth state right
  // after creating a profile row, instead of forcing a page reload.
  //
  // Wrapped in try/catch on purpose: without it, any failure here
  // (a transient network hiccup, an error creating the profile row on
  // someone's first post-verification login, etc.) would silently
  // leave user/profile at null while loading still flips to false --
  // which looks exactly like "not logged in" and bounces someone who
  // IS logged in back to /login, with no error visible anywhere to
  // explain why.
  const loadUserAndProfile = useCallback(async () => {
    try {
      const { user: currentUser, profile: currentProfile } = await getCurrentUserProfile()
      setUser(currentUser)
      setProfile(currentProfile)
    } catch (err) {
      console.error('Failed to load the current session/profile:', err.message)
      setUser(null)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    // Initial check when the app first loads (e.g. someone refreshing
    // the page while already logged in).
    loadUserAndProfile().finally(() => {
      if (isMounted) setLoading(false)
    })

    // Keeps state in sync after login, logout, email verification, or
    // a Google OAuth redirect -- all of these fire onAuthStateChange,
    // so re-checking here covers every case without handling each
    // event type separately.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUserAndProfile()
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [loadUserAndProfile])

  const value = {
    user,
    profile,
    loading,
    refreshProfile: loadUserAndProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return context
}