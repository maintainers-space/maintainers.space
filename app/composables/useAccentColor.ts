export interface AccentOption {
  id: string
  label: string
  /** Swatch color shown in the picker (matches the palette's mid shade). */
  swatch: string
  /** Light colors (yellow-ish) need dark text on solid fills for contrast. */
  needsDarkText?: boolean
}

/** `brand` is koinon's own yellow (see main.css); the rest are Tailwind's named palettes. */
export const ACCENT_COLORS: AccentOption[] = [
  { id: 'brand', label: 'Yellow', swatch: '#eab308', needsDarkText: true },
  { id: 'red', label: 'Red', swatch: '#ef4444' },
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b', needsDarkText: true },
  { id: 'lime', label: 'Lime', swatch: '#84cc16', needsDarkText: true },
  { id: 'green', label: 'Green', swatch: '#22c55e' },
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'teal', label: 'Teal', swatch: '#14b8a6' },
  { id: 'cyan', label: 'Cyan', swatch: '#06b6d4' },
  { id: 'sky', label: 'Sky', swatch: '#0ea5e9' },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'purple', label: 'Purple', swatch: '#a855f7' },
  { id: 'fuchsia', label: 'Fuchsia', swatch: '#d946ef' },
  { id: 'pink', label: 'Pink', swatch: '#ec4899' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' }
]

const STORAGE_KEY = 'koinon:accent-color'
export const DEFAULT_ACCENT = 'brand'

const DARK_TEXT_BUTTON = [
  {
    color: 'primary' as const,
    variant: 'solid' as const,
    class: 'text-neutral-900 hover:text-neutral-900'
  }
]
const DARK_TEXT_BADGE = [
  { color: 'primary' as const, variant: 'solid' as const, class: 'text-neutral-900' }
]

const current = ref(DEFAULT_ACCENT)

/**
 * Solid-fill buttons/badges default to white text, which is unreadable on a
 * light accent (yellow, amber, lime) — toggle the override compound variant
 * on and off as the accent changes rather than leaving it permanently on.
 */
function applyAccent(id: string): void {
  const appConfig = useAppConfig()
  const option = ACCENT_COLORS.find((c) => c.id === id)
  appConfig.ui.colors.primary = id
  // Nuxt's generated appConfig array type doesn't accept a plain reassignment
  // (a known typegen quirk with merged-config arrays); the shape is otherwise
  // identical to what app.config.ts itself already assigns statically.
  appConfig.ui.button.compoundVariants = (
    option?.needsDarkText ? DARK_TEXT_BUTTON : []
  ) as typeof appConfig.ui.button.compoundVariants
  appConfig.ui.badge.compoundVariants = (
    option?.needsDarkText ? DARK_TEXT_BADGE : []
  ) as typeof appConfig.ui.badge.compoundVariants
}

/**
 * A small rounded koinon glyph tinted to the given accent —
 * mirrors AppLogo.vue's icon so the browser tab matches the sidebar mark.
 */
export function accentFaviconDataUri(accentId: string): string {
  const option = ACCENT_COLORS.find((c) => c.id === accentId)
  const bg = option?.swatch ?? '#eab308'
  const ink = '#000000'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -15 367 367" fill="none">` +
    `<defs>` +
    `<mask id="m0" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="21" y="2" width="295" height="304"><rect x="21.4502" y="2" width="294" height="304" fill="#D9D9D9"/></mask>` +
    `<mask id="m1" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="109" y="88" width="221" height="220"><path d="M255.95 173.5L109.45 88V308H329.45V88H255.95V173.5Z" fill="#D9D9D9"/></mask>` +
    `<mask id="m2" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-34" y="47" width="302" height="301"><path d="M120.06 241.222L267.355 157.1L76.8299 47.0996L-33.1701 237.625L157.355 347.625L194.105 283.972L120.06 241.222Z" fill="#D9D9D9"/></mask>` +
    `<mask id="m3" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="18" y="-41" width="302" height="301"><path d="M129.356 90.2835L128.561 259.906L319.086 149.906L209.086 -40.6193L18.5605 69.3807L55.3105 133.034L129.356 90.2835Z" fill="#D9D9D9"/></mask>` +
    `</defs>` +
    `<circle cx="168.5" cy="168.5" r="183.5" fill="${bg}"/>` +
    `<g mask="url(#m0)">` +
    `<g mask="url(#m1)"><path d="M208.45 102.774C213.331 99.9558 215.771 98.547 218.45 98.547C221.13 98.547 223.57 99.9558 228.45 102.774L295.053 141.226C299.933 144.044 302.373 145.453 303.713 147.774C305.053 150.094 305.053 152.912 305.053 158.547V235.453C305.053 241.088 305.053 243.906 303.713 246.226C302.373 248.547 299.933 249.956 295.053 252.774L228.45 291.226C223.57 294.044 221.13 295.453 218.45 295.453C215.771 295.453 213.331 294.044 208.45 291.226L141.848 252.774C136.967 249.956 134.527 248.547 133.187 246.226C131.848 243.906 131.848 241.088 131.848 235.453V158.547C131.848 152.912 131.848 150.094 133.187 147.774C134.527 145.453 136.967 144.044 141.848 141.226L208.45 102.774Z" stroke="${ink}" stroke-width="19"/></g>` +
    `<g mask="url(#m2)"><path d="M205.062 235.45C205.062 241.085 205.062 243.903 203.722 246.224C202.382 248.544 199.942 249.953 195.062 252.771L128.459 291.224C123.579 294.041 121.138 295.45 118.459 295.45C115.779 295.45 113.339 294.041 108.459 291.224L41.8564 252.771C36.9761 249.953 34.5359 248.544 33.1962 246.224C31.8564 243.903 31.8564 241.085 31.8564 235.45L31.8564 158.544C31.8564 152.909 31.8564 150.091 33.1962 147.771C34.5359 145.45 36.9761 144.041 41.8564 141.224L108.459 102.771C113.339 99.9529 115.779 98.5441 118.459 98.5441C121.138 98.5441 123.579 99.9529 128.459 102.771L195.062 141.224C199.942 144.041 202.382 145.45 203.722 147.771C205.062 150.091 205.062 152.909 205.062 158.544L205.062 235.45Z" stroke="${ink}" stroke-width="19"/></g>` +
    `<g mask="url(#m3)"><path d="M91.8535 166.782C86.9732 163.965 84.533 162.556 83.1933 160.235C81.8535 157.915 81.8535 155.097 81.8535 149.462L81.8535 72.5558C81.8535 66.9205 81.8535 64.1028 83.1933 61.7823C84.533 59.4618 86.9732 58.053 91.8535 55.2353L158.456 16.7823C163.336 13.9646 165.777 12.5558 168.456 12.5558C171.136 12.5558 173.576 13.9646 178.456 16.7823L245.059 55.2353C249.939 58.053 252.379 59.4618 253.719 61.7823C255.059 64.1028 255.059 66.9205 255.059 72.5558L255.059 149.462C255.059 155.097 255.059 157.915 253.719 160.235C252.379 162.556 249.939 163.965 245.059 166.782L178.456 205.235C173.576 208.053 171.136 209.462 168.456 209.462C165.777 209.462 163.336 208.053 158.456 205.235L91.8535 166.782Z" stroke="${ink}" stroke-width="19"/></g>` +
    `</g>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Accent color, shared across every component: pick once, applies everywhere. */
export function useAccentColor() {
  function load(): void {
    if (!import.meta.client) return
    const saved = localStorage.getItem(STORAGE_KEY)
    current.value = saved && ACCENT_COLORS.some((c) => c.id === saved) ? saved : DEFAULT_ACCENT
    applyAccent(current.value)
  }

  function setAccent(id: string): void {
    current.value = id
    applyAccent(id)
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, id)
  }

  return { colors: ACCENT_COLORS, current, setAccent, load }
}
