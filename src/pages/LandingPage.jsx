import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'
import '../styles/landing.css'

const STEPS = [
  {
    number: '1',
    icon: 'ti-search',
    title: 'Discover Decorators',
    text: 'Browse real portfolios across Interior, Event, Birthday, and Wedding categories to find a style you love.',
  },
  {
    number: '2',
    icon: 'ti-messages',
    title: 'Connect & Plan',
    text: 'Message decorators directly, right in the app, to talk through your vision, timeline, and budget.',
  },
  {
    number: '3',
    icon: 'ti-confetti',
    title: 'Celebrate Beautifully',
    text: 'Work together to bring it to life then leave a review to help the next person find their perfect match.',
  },
]

const CATEGORIES = [
  {
    name: 'Interior Decorator',
    icon: 'ti-sofa',
    accent: '#54738A',
    accentDark: '#294552',
    accentBg: '#E7F0F3',
    blurb: 'Calm, considered spaces designed to work as hard as they look good.',
  },
  {
    name: 'Event Plans',
    icon: 'ti-confetti',
    accent: '#62756E',
    accentDark: '#24312D',
    accentBg: '#E5ECE7',
    blurb: 'Corporate launches and milestone events, planned end to end.',
  },
  {
    name: 'Birthday Plans',
    icon: 'ti-cake',
    accent: '#C97835',
    accentDark: '#754019',
    accentBg: '#FCEBD8',
    blurb: 'Balloon installs and party styling that photograph as well as they feel.',
  },
  {
    name: 'Wedding Plans',
    icon: 'ti-flower',
    accent: '#B85C7B',
    accentDark: '#682A43',
    accentBg: '#F8E9EF',
    blurb: 'Turning venues into something worth remembering, from arch to reception.',
  },
]

function LandingPage() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  // An already-logged-in visitor lands straight in the app instead of
  // seeing the marketing page again -- same pattern already used on
  // LoginPage for the same reason.
  useEffect(() => {
    if (loading || !user) return
    navigate(profile ? (profile.role === 'decorator' ? '/dashboard' : '/browse') : '/choose-role', { replace: true })
  }, [loading, user, profile, navigate])

  // Fades/slides each .reveal element in the moment it scrolls into
  // view, then stops watching it -- a plain IntersectionObserver
  // needs no extra dependency. prefers-reduced-motion is handled
  // entirely in CSS (landing.css), not here.
  useEffect(() => {
    const elements = document.querySelectorAll('.landing-page .reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  function scrollToId(id) {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#top" onClick={() => setMenuOpen(false)}>
          <img className="landing-brand-mark" src="/my-deco-emblem.png" alt="" />
          <span>My Deco</span>
        </a>

        <button
          type="button"
          className="landing-nav-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <Icon name={menuOpen ? 'ti-x' : 'ti-menu-2'} />
        </button>

        <nav className={`landing-nav${menuOpen ? ' landing-nav--open' : ''}`}>
          <button type="button" onClick={() => scrollToId('how-it-works')}>How it works</button>
          <button type="button" onClick={() => scrollToId('categories')}>Categories</button>
          <button type="button" onClick={() => navigate('/info')} className="landing-nav-copy">
  About
</button>
          <Link to="/signup" className="landing-nav-cta">Sign Up / Log In</Link>
        </nav>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-text reveal">
          <h1>The finest decorators, for every celebration.</h1>
          <p>Browse portfolios, message experts, and bring your vision to life.</p>
          <div className="landing-hero-actions">
            <Link to="/signup" className="landing-hero-cta">Find a Decorator</Link>
            <p>Already have an account? <Link to="/login">Log in</Link></p>
          </div>
        </div>
        <div className="landing-hero-art reveal" aria-hidden="true">
          <div className="landing-blob landing-blob-1"><Icon name="ti-sofa" /></div>
          <div className="landing-blob landing-blob-2"><Icon name="ti-flower" /></div>
          <div className="landing-blob landing-blob-3"><Icon name="ti-cake" /></div>
          <div className="landing-blob landing-blob-4"><Icon name="ti-confetti" /></div>
        </div>
      </section>

      <section className="landing-steps" id="how-it-works">
        <h2 className="reveal">Your simple steps to perfection.</h2>
        <div className="landing-steps-grid">
          {STEPS.map((step) => (
            <div className="landing-step-card reveal" key={step.number}>
              <span className="landing-step-number">{step.number}</span>
              <Icon name={step.icon} className="landing-step-icon" />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-categories" id="categories">
        <h2 className="reveal">A curator for every occasion.</h2>
        <div className="landing-categories-grid">
          {CATEGORIES.map((category) => (
            <div
              className="landing-category-card reveal"
              key={category.name}
              style={{ '--accent': category.accent, '--accent-dark': category.accentDark, '--accent-bg': category.accentBg }}
            >
              <div className="landing-category-icon">
                <Icon name={category.icon} />
              </div>
              <h3>{category.name}</h3>
              <p>{category.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-testimonials" id="about">
        <h2 className="reveal">Loved by the people who celebrate with us.</h2>
        {/* Placeholder on purpose -- no invented quotes attributed to
            fake people. Real reviews already accumulate in the
            reviews table as the platform gets used; this section can
            be wired up to pull from it later. */}
        <div className="landing-testimonials-grid">
          <div className="landing-testimonial-card reveal">
            <Icon name="ti-quote" />
            <p>Real stories from real customers are on their way check back soon.</p>
          </div>
          <div className="landing-testimonial-card reveal">
            <Icon name="ti-quote" />
            <p>Every celebration booked through My Deco adds one more story to this space.</p>
          </div>
          <div className="landing-testimonial-card reveal">
            <Icon name="ti-quote" />
            <p>Be one of the first to have your review featured here.</p>
          </div>
        </div>
      </section>

      <section className="landing-final-cta reveal">
        <div className="cta-float-icons" aria-hidden="true">
          <span className="cta-float-icon cta-float-icon-1"><Icon name="ti-sofa" /></span>
          <span className="cta-float-icon cta-float-icon-2"><Icon name="ti-flower" /></span>
          <span className="cta-float-icon cta-float-icon-3"><Icon name="ti-cake" /></span>
          <span className="cta-float-icon cta-float-icon-4"><Icon name="ti-confetti" /></span>
        </div>
        <h2>Ready to create something beautiful?</h2>
        <Link to="/signup" className="landing-final-cta-button">Create Your Account</Link>
      </section>

      <footer className="landing-footer">
        <div className="landing-brand">
          <img className="landing-brand-mark" src="/my-deco-emblem.png" alt="" />
          <span>My Deco</span>
        </div>
        <nav className="landing-footer-links">
          <Link to="/info">About Us</Link>
          <Link to="/info">FAQ</Link>
          <Link to="/info">Privacy</Link>
          <Link to="/info">Terms</Link>
          <Link to="/info">Contact</Link>
        </nav>
        <p className="landing-footer-copy">© {new Date().getFullYear()} My Deco. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default LandingPage