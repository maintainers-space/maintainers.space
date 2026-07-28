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
 * A small rounded-square "branch merge" glyph tinted to the given accent —
 * mirrors AppLogo.vue's icon so the browser tab matches the sidebar mark.
 * Swap the inner `<path>`/`<circle>`s here once the real koinon logo lands.
 */
export function accentFaviconDataUri(accentId: string): string {
  const option = ACCENT_COLORS.find((c) => c.id === accentId)
  const bg = option?.swatch ?? '#eab308'
  const ink = option?.needsDarkText ? '#171717' : '#ffffff'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="${bg}"/>` +
    `<circle cx="11" cy="8" r="2.2" fill="${ink}"/>` +
    `<circle cx="11" cy="24" r="2.2" fill="${ink}"/>` +
    `<circle cx="22" cy="24" r="2.2" fill="${ink}"/>` +
    `<path d="M11 10.5V22M11 15c3 0 5 2 5 5v1" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
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
