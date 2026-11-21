// Small helpers the OG card templates share: escaping, icons and number formatting.
import { OG_ICONS, type OgIconName } from './icon-data'

export function esc(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** An icon as an `<img>` with an inline SVG, coloured by replacing `currentColor`. */
export function icon(name: OgIconName, size: number, color: string, style = ''): string {
  const { body, size: box } = OG_ICONS[name]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}">${body.replaceAll('currentColor', color)}</svg>`
  return `<img src="data:image/svg+xml,${encodeURIComponent(svg)}" style="width:${size}px;height:${size}px;flex-shrink:0;${style}" />`
}

/** `61.2k`, `1.4M`; small numbers stay exact. */
export function compact(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${trim(value / 1000)}k`
  return `${trim(value / 1_000_000)}M`
}

function trim(value: number): string {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '')
}

/** `20 Nov 2026`, in English and UTC so every crawler sees the same card. */
export function shortDate(value: Date | string | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric'
  })
}

/** A font size that keeps a title of `length` characters on as few lines as it can. */
export function fitTitle(length: number, sizes: Array<[maxLength: number, size: number]>): number {
  for (const [maxLength, size] of sizes) if (length <= maxLength) return size
  return sizes.at(-1)![1]
}
