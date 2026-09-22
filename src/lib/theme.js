// Maps each fixed category to an accent color, so a decorator's public
// profile visually shifts based on what they do -- a wedding decorator
// reads differently than a birthday one. Kept here rather than inline
// in DecoratorProfilePage.jsx so any other screen that wants the same
// theming (e.g. a future portfolio card on BrowsePage.jsx) can import
// it too, instead of redefining the palette.
export const CATEGORY_THEME = {
  'Wedding Plans': { accent: '#B85C7B', accentDark: '#682A43', accentBg: '#F8E9EF' },
  'Birthday Plans': { accent: '#C97835', accentDark: '#754019', accentBg: '#FCEBD8' },
  'Event Plans': { accent: '#62756E', accentDark: '#24312D', accentBg: '#E5ECE7' },
  'Interior Decorator': { accent: '#54738A', accentDark: '#294552', accentBg: '#E7F0F3' },
}

const DEFAULT_THEME = { accent: '#62756E', accentDark: '#24312D', accentBg: '#E5ECE7' }

// A decorator now has exactly one category (see the migration for
// why), so this just looks it up directly -- no more "pick the first
// selected one" logic.
export function getCategoryTheme(category) {
  return CATEGORY_THEME[category] || DEFAULT_THEME
}