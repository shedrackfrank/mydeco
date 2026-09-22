// Replaces @tabler/icons-webfont, which shipped ~4MB of font files and
// 5,800+ icon definitions to support the 14 icons this app actually
// uses. Inline SVG instead: a few KB total, no separate network
// request, no unused-CSS/unused-font waste on a Lighthouse report.
//
// Sized with width/height="1em" and colored with stroke="currentColor"
// specifically so every existing CSS rule that set font-size and
// color on an icon (e.g. .landing-step-icon { font-size:1.8rem;
// color:var(--clay); }) keeps working completely unchanged -- this is
// a drop-in replacement, not a styling rewrite.
//
// Usage: <Icon name="ti-heart" className="whatever" /> instead of the
// old <i className="ti ti-heart" aria-hidden="true"></i>.

const PATHS = {
  'ti-search': (
    <>
      <circle cx="10" cy="10" r="7" />
      <line x1="21" y1="21" x2="15" y2="15" />
    </>
  ),
  'ti-messages': (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  'ti-confetti': (
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="6" r="1.4" />
      <rect x="15.8" y="3.8" width="2.4" height="2.4" transform="rotate(20 17 5)" />
      <circle cx="19.2" cy="11" r="1.2" />
      <rect x="3.9" y="13.9" width="2.2" height="2.2" transform="rotate(-15 5 15)" />
      <circle cx="10" cy="19.2" r="1.3" />
      <rect x="15" y="17" width="2" height="2" transform="rotate(30 16 18)" />
      <circle cx="12" cy="11" r="1" />
    </g>
  ),
  'ti-sofa': (
    <>
      <path d="M4 12v6a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h10v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-6" />
      <path d="M4 12V9a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3" />
      <path d="M15 12V9a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3" />
      <path d="M4 12h16" />
    </>
  ),
  'ti-cake': (
    <>
      <path d="M12 2v4" />
      <path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
      <path d="M3 21h18" />
      <path d="M5 14a3 3 0 0 0 3-3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0 3 3" />
    </>
  ),
  'ti-flower': (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4z" />
      <path d="M12 22a4 4 0 0 0 4-4 4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 4 4z" />
      <path d="M2 12a4 4 0 0 1 4-4 4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4z" />
      <path d="M22 12a4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4z" />
    </>
  ),
  'ti-thumb-up': (
    <>
      <path d="M7 11v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-1.5 6a2 2 0 0 1-2 1.5H7" />
    </>
  ),
  'ti-heart': (
    <path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 1 1 7.5-6.6 5 5 0 1 1 7.5 6.6z" />
  ),
  'ti-sparkles': (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5z" />
      <path d="M19 17l.5 1.5L21 19l-1.5.5L19 21l-.5-1.5L17 19l1.5-.5z" />
    </>
  ),
  'ti-x': (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  'ti-menu-2': (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </>
  ),
  'ti-eye': (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'ti-eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6 0 10 7 10 7a13.16 13.16 0 0 1-2.34 3.34M6.61 6.61A13.19 13.19 0 0 0 2 11s4 7 10 7a9.16 9.16 0 0 0 5.39-1.61" />
    </>
  ),
  'ti-quote': (
    <>
      <path d="M7 7a3 3 0 0 0-3 3v3a1 1 0 0 0 1 1h3v3l-2 2" />
      <path d="M17 7a3 3 0 0 0-3 3v3a1 1 0 0 0 1 1h3v3l-2 2" />
    </>
  ),
}

function Icon({ name, className = '', style, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0, ...style }}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

export default Icon