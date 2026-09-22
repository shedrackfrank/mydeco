import { useState, useEffect } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchPortfolioItems, savePortfolioItem } from '../lib/portfolio'
import { validatePhotoFile, uploadPortfolioPhoto, deletePortfolioPhoto } from '../lib/cloudinary'
import { fetchDecoratorStats } from '../lib/analytics'

const PHOTO_LIMIT = 20

function DashboardPage() {
  const { user, profile } = useAuth()

  const [portfolioItems, setPortfolioItems] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Upload form state
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploadPrice, setUploadPrice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [deletingItemId, setDeletingItemId] = useState(null)

  // Loads everything the dashboard needs in parallel. Only runs once
  // per user -- uploads below update state directly instead of
  // re-fetching, so the screen doesn't refetch on every keystroke.
  useEffect(() => {
    if (!user || profile.role !== 'decorator') return
    let isMounted = true

    async function load() {
      try {
        const [items, decoratorStats] = await Promise.all([
          fetchPortfolioItems(user.id),
          fetchDecoratorStats(user.id),
        ])

        if (!isMounted) return

        setPortfolioItems(items)
        setStats(decoratorStats)
      } catch (err) {
        if (isMounted) setLoadError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => { isMounted = false }
  }, [user, profile])

  // Only decorators have a dashboard -- ProtectedRoute already
  // confirmed user + profile exist, this just checks role. A customer
  // landing here gets sent to /browse instead.
  if (profile.role !== 'decorator') {
    return <Navigate to="/browse" replace />
  }

  if (loading) {
    return <p>Loading...</p>
  }

  if (loadError) {
    return <p className="form-error">{loadError}</p>
  }

  async function handleUploadSubmit(e) {
    e.preventDefault()
    setUploadError(null)

    if (!uploadFile) {
      setUploadError('Please choose a photo to upload.')
      return
    }

    const validationError = validatePhotoFile(uploadFile)
    if (validationError) {
      setUploadError(validationError)
      return
    }

    setUploading(true)
    try {
      const { url, publicId } = await uploadPortfolioPhoto(uploadFile)
      const item = await savePortfolioItem({
        decoratorId: user.id,
        imageUrl: url,
        imagePublicId: publicId,
        caption: uploadCaption,
        price: uploadPrice ? Number(uploadPrice) : null,
      })
      setPortfolioItems((prev) => [item, ...prev])
      setUploadFile(null)
      setUploadCaption('')
      setUploadPrice('')
      e.target.reset() // clears the native file input, which React can't control directly
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(itemId) {
    setDeletingItemId(itemId)
    try {
      const result = await deletePortfolioPhoto(itemId)
      setPortfolioItems((prev) => prev.filter((item) => item.id !== itemId))
      // The photo and its database row are gone either way -- this
      // just lets the decorator know if the underlying Cloudinary
      // file might need a manual follow-up (see the edge function for
      // when this can happen).
      if (result?.cloudinaryWarning) setUploadError(result.cloudinaryWarning)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setDeletingItemId(null)
    }
  }

  const atPhotoLimit = portfolioItems.length >= PHOTO_LIMIT

  return (
    <section>
      <h1>Your dashboard</h1>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading">Your stats</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-value">{stats.viewCount}</p>
            <p className="stat-label">Profile views</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{stats.totalReactionCount}</p>
            <p className="stat-label">Reactions</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{stats.followerCount}</p>
            <p className="stat-label">Followers</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{stats.averageRating != null ? stats.averageRating.toFixed(1) : '—'}</p>
            <p className="stat-label">
              Average rating
              {stats.reviewCount > 0 && ` (${stats.reviewCount} review${stats.reviewCount === 1 ? '' : 's'})`}
            </p>
          </div>
        </div>

        {stats.reviewCount > 0 && (
          <div className="reviews-list">
            <h3>Reviews</h3>
            {stats.reviews.map((review) => (
              <div key={review.id} className="review-card">
                <p className="review-meta">
                  <strong>{review.user_profiles?.username || 'A customer'}</strong> — {review.rating} / 5
                </p>
                {review.comment && <p>{review.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bio, category, and avatar all moved to Settings -- this page
          is just stats + product management now. */}
      <p><Link to="/settings">Edit your bio, category, and photo in Settings →</Link></p>

      <section aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading">Your products ({portfolioItems.length}/{PHOTO_LIMIT})</h2>

        <form onSubmit={handleUploadSubmit}>
          <label>
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setUploadFile(e.target.files[0] || null)}
              disabled={atPhotoLimit}
            />
          </label>
          <label>
            Description (optional)
            <input
              type="text"
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              disabled={atPhotoLimit}
            />
          </label>
          <label>
            Price (optional)
            <input
              type="number"
              min="0"
              step="0.01"
              value={uploadPrice}
              onChange={(e) => setUploadPrice(e.target.value)}
              disabled={atPhotoLimit}
            />
          </label>

          {uploadError && <p className="form-error">{uploadError}</p>}
          {atPhotoLimit && <p>You've reached the 20-product limit. Delete one to add another.</p>}

          <button type="submit" disabled={uploading || atPhotoLimit}>
            {uploading ? 'Uploading…' : 'Upload product'}
          </button>
        </form>

        <div className="portfolio-grid">
          {portfolioItems.map((item) => (
            <div key={item.id} className="portfolio-item">
              <img src={item.image_url} alt={item.caption || 'Product photo'} />
              {item.caption && <p>{item.caption}</p>}
              {item.price != null && <p className="decorator-pricing">${item.price}</p>}
              <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingItemId === item.id}>
                {deletingItemId === item.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

export default DashboardPage