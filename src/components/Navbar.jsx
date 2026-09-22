import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { signOut } from '../lib/auth'

function Navbar() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // /reset-password uses a short-lived Supabase "recovery" session --
  // technically a real, valid session, so `user` really is truthy
  // there. But showing Inbox/Dashboard/Settings while someone is
  // specifically in the middle of resetting their password is
  // confusing, not helpful, so this route always gets the logged-out
  // nav regardless of session state.
  const isRecoveryFlow = location.pathname === '/reset-password'

  // Closes the mobile menu automatically on every navigation, so it
  // doesn't stay stuck open after tapping a link -- Navbar persists
  // across route changes rather than remounting, so this needs an
  // explicit reset rather than happening for free.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav aria-label="Main navigation">
      <Link className="brand" to={user && !isRecoveryFlow ? '/browse' : '/login'}>
        <img className="brand-mark" src="/my-deco-emblem.png" alt="" />
        <span>My Deco</span>
      </Link>

      {/* Only visible below the mobile breakpoint (see global.css) --
          on desktop this button is hidden and .nav-links always shows
          normally regardless of menuOpen. */}
      <button
        type="button"
        className="nav-toggle"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <Icon name={menuOpen ? 'ti-x' : 'ti-menu-2'} />
      </button>

      {user && !isRecoveryFlow ? (
        <div className={`nav-links${menuOpen ? ' nav-links--open' : ''}`}>
          {/* profile can briefly be null right after verifying or
              before /choose-role -- fall back to the email so the
              navbar never shows a blank name. */}
          <span>Hi, {profile?.username ?? user.email}</span>
          <Link to="/inbox">Inbox</Link>
          {profile?.role === 'decorator' && <Link to="/dashboard">Dashboard</Link>}
          <Link to="/settings">Settings</Link>
          <Link to="/info">Info</Link>
          <button onClick={handleSignOut}>Sign out</button>
        </div>
      ) : (
        <div className={`nav-links${menuOpen ? ' nav-links--open' : ''}`}>
          <Link to="/info">Info</Link>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
        </div>
      )}
    </nav>
  )
}

export default Navbar