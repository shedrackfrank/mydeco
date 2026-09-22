import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, fetchDecorators, fetchPortfolioCounts } from '../lib/portfolio'
import { fetchAverageRatings } from '../lib/analytics'
import { getCategoryTheme } from '../lib/theme'
import { COUNTRIES } from '../lib/countries'

function truncateBio(bio, maxLength = 120) {
  if (!bio || bio.length <= maxLength) return bio
  const shortened = bio.slice(0, maxLength)
  const lastSpace = shortened.lastIndexOf(' ')
  return `${lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened}…`
}

function BrowsePage() {
  const { profile } = useAuth()
  const [category, setCategory] = useState('')
  const [country, setCountry] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [decorators, setDecorators] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Waits 400ms after typing stops before actually searching, rather
  // than firing a request on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    let isMounted = true

    async function loadDecorators() {
      setLoading(true)
      setLoadError(null)
      try {
        const rows = await fetchDecorators({
          category: category || undefined,
          country: country || undefined,
          search: search || undefined,
        })
        const ids = rows.map((decorator) => decorator.user_id)
        const [portfolioCounts, ratings] = await Promise.all([
          fetchPortfolioCounts(ids),
          fetchAverageRatings(ids),
        ])
        if (!isMounted) return
        setDecorators(rows.map((decorator) => ({
          ...decorator,
          portfolioCount: portfolioCounts[decorator.user_id] ?? 0,
          rating: ratings[decorator.user_id],
        })))
      } catch (err) {
        if (isMounted) setLoadError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadDecorators()
    return () => { isMounted = false }
  }, [category, country, search])

  if (profile.role !== 'customer') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <section>
      <h1>Browse decorators</h1>

      <div className="browse-filters">
        <label>
          Search by name
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Decorator username…"
          />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {COUNTRIES.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p>Loading...</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && decorators.length === 0 && <p>No decorators found.</p>}
      {!loading && !loadError && decorators.length > 0 && (
        <div className="decorator-list">
          {decorators.map((decorator) => {
            const theme = getCategoryTheme(decorator.category)
            const displayName = decorator.user_profiles?.username || 'Decorator'
            const avatarUrl = decorator.user_profiles?.avatar_url
            return (
              <Link
                key={decorator.user_id}
                to={`/decorator/${decorator.user_id}`}
                className="decorator-card"
                style={{ '--accent': theme.accent, '--accent-dark': theme.accentDark, '--accent-bg': theme.accentBg }}
              >
                <div
                  className="decorator-avatar"
                  style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover' } : undefined}
                >
                  {!avatarUrl && displayName[0].toUpperCase()}
                </div>
                <div className="decorator-card-content">
                  <h2>{displayName}</h2>
                  <p className="decorator-categories">{decorator.category}</p>
                  {decorator.bio && <p>{truncateBio(decorator.bio)}</p>}
                  <p>{decorator.portfolioCount} product{decorator.portfolioCount === 1 ? '' : 's'}</p>
                  {decorator.rating && (
                    <p className="decorator-rating">
                      {decorator.rating.average.toFixed(1)} ({decorator.rating.count} review{decorator.rating.count === 1 ? '' : 's'})
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default BrowsePage