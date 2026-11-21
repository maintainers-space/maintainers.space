// The honeycomb behind every card, an echo of the maintainers.space mark. A faint hex grid covers
// the card and fades in towards the right; a few cells there are filled, clustered around
// invisible blobs and brighter towards their centres. The pattern is seeded by the route, so a
// repository always gets the same one and no two look alike, and tinted by what the card is about.
// Adapted from trueberryless/og-image-generator.
import { OG_HEIGHT, OG_WIDTH } from './cards-size'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

type Level = 0 | 1 | 2 | 3

interface Cell {
  cx: number
  cy: number
  level: Level
  /** How far into the pattern side the cell is, from 0 (text side) to 1. */
  presence: number
}

const RADIUS = 46
const GAP = 3
const MAX_ATTEMPTS = 24
const MIN_FILLED = 12
const MAX_FILLED = 30

// --- Randomness ----------------------------------------------------------------------------------

/** FNV-1a, so a route always maps to the same seed. */
export function seedOf(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: a small deterministic generator returning values in `[0, 1)`. */
function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

// --- Colour ----------------------------------------------------------------------------------------

interface Oklch {
  l: number
  c: number
  h: number
}

function hexToOklch(hex: string): Oklch {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((ch) => ch + ch).join('') : value.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(full.slice(i, i + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, l: L }
}

/** An OKLCH colour as `rgba()`, which every renderer understands, reducing chroma until it fits sRGB. */
function oklch(l: number, c: number, h: number, alpha = 1): string {
  for (let chroma = c; chroma >= 0; chroma -= 0.005) {
    const A = chroma * Math.cos((h * Math.PI) / 180)
    const B = chroma * Math.sin((h * Math.PI) / 180)
    const l1 = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
    const m1 = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
    const s1 = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
    const rgb = [
      4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
      -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
      -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1
    ]
    if (rgb.every((v) => v >= -0.0001 && v <= 1.0001) || chroma < 0.005) {
      const [r, g, b] = rgb.map((v) => {
        const clamped = Math.min(1, Math.max(0, v))
        const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
        return Math.round(srgb * 255)
      })
      return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+alpha.toFixed(3)})`
    }
  }
  return `rgba(255,255,255,${alpha})`
}

/**
 * Colours derived from one tint. Only its hue is kept, at fixed lightness and chroma, so a grey C
 * repository or a near-black forge brand get as lively a pattern as a vivid one.
 */
function palette(tint: string) {
  const { c, h } = hexToOklch(tint)
  // A nearly grey tint has no meaningful hue; it falls back to the brand amber.
  const hue = c < 0.03 ? 75 : h
  const color = (l: number, chroma: number, alpha = 1) => oklch(l, chroma, hue, alpha)
  return {
    backgroundInner: color(0.24, 0.05),
    backgroundOuter: color(0.145, 0.012),
    fill: { 1: color(0.72, 0.14, 0.12), 2: color(0.72, 0.14, 0.26), 3: color(0.75, 0.15, 0.46) },
    highlight: color(0.88, 0.12, 0.6),
    stroke: (presence: number) => color(0.8, 0.06, 0.035 + 0.075 * presence),
    shine: color(0.7, 0.14, 0.18)
  }
}

// --- Geometry ------------------------------------------------------------------------------------

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function hexagon(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30)
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}

function grid(): Array<{ cx: number; cy: number }> {
  const dx = Math.sqrt(3) * RADIUS
  const dy = 1.5 * RADIUS
  const cells: Array<{ cx: number; cy: number }> = []
  for (let row = 0; row <= Math.ceil(OG_HEIGHT / dy) + 1; row++) {
    for (let column = -1; column <= Math.ceil(OG_WIDTH / dx) + 1; column++) {
      const cx = column * dx + (row % 2 === 1 ? dx / 2 : 0)
      const cy = row * dy
      if (cx + dx / 2 > 0 && cx - dx / 2 < OG_WIDTH && cy - RADIUS < OG_HEIGHT)
        cells.push({ cx, cy })
    }
  }
  return cells
}

function fill(rng: () => number, avoid: readonly Rect[]): { cells: Cell[]; filled: number } {
  const blobs = Array.from({ length: 4 + Math.floor(rng() * 3) }, () => ({
    spread: RADIUS * (1.6 + rng() * 2.4),
    x: OG_WIDTH * (0.6 + rng() * 0.44),
    y: OG_HEIGHT * (-0.05 + rng() * 1.1)
  }))
  const halfWidth = (Math.sqrt(3) / 2) * RADIUS
  let filled = 0
  const cells = grid().map(({ cx, cy }): Cell => {
    // The same two draws per cell, so avoided areas never shift the rest of the pattern.
    const fillRoll = rng()
    const levelRoll = rng()
    const presence = smoothstep(OG_WIDTH * 0.38, OG_WIDTH * 0.78, cx)
    let influence = 0
    for (const blob of blobs) {
      const distance = (cx - blob.x) ** 2 + (cy - blob.y) ** 2
      influence = Math.max(influence, Math.exp(-distance / (2 * blob.spread ** 2)))
    }
    const probability = Math.min(1, influence * presence * 0.9)
    const bounds = { height: RADIUS * 2, width: halfWidth * 2, x: cx - halfWidth, y: cy - RADIUS }
    let level: Level = 0
    if (fillRoll < probability) {
      filled++
      level = levelRoll < probability * 0.45 ? 3 : levelRoll < probability * 0.9 ? 2 : 1
      // Behind text, avatars and pills a cell stays faint, so it adds texture without competing.
      if (avoid.some((rect) => intersects(rect, bounds))) level = 1
    }
    return { cx, cy, level, presence }
  })
  return { cells, filled }
}

/** Picks the first attempt with a balanced number of filled cells, or the closest one. */
function cellsFor(seed: number, avoid: readonly Rect[]): Cell[] {
  let best: Cell[] = []
  let bestDistance = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { cells, filled } = fill(createRng(seed * MAX_ATTEMPTS + attempt), avoid)
    if (filled >= MIN_FILLED && filled <= MAX_FILLED) return cells
    const distance = Math.abs(filled - (MIN_FILLED + MAX_FILLED) / 2)
    if (distance < bestDistance) {
      best = cells
      bestDistance = distance
    }
  }
  return best
}

// --- Rendering -----------------------------------------------------------------------------------

/** The background as an SVG document: tinted gradient, honeycomb and a calm left side for the text. */
export function patternSvg(options: {
  seed: string
  tint: string
  avoid?: readonly Rect[]
}): string {
  const colors = palette(options.tint)
  const cells = cellsFor(seedOf(options.seed), options.avoid ?? [])
  const inner = RADIUS - GAP / 2
  const polygons = cells.map((cell) => {
    const fillColor = cell.level === 0 ? 'none' : colors.fill[cell.level]
    const stroke = cell.level === 3 ? colors.highlight : colors.stroke(cell.presence)
    return `<polygon points="${hexagon(cell.cx, cell.cy, inner)}" fill="${fillColor}" stroke="${stroke}"/>`
  })
  // The brightest cells glow a little, like light caught on the facets of the mark.
  const glows = cells
    .filter((cell) => cell.level === 3)
    .map(
      (cell) =>
        `<circle cx="${cell.cx.toFixed(1)}" cy="${cell.cy.toFixed(1)}" r="${RADIUS * 1.9}" fill="url(#shine)"/>`
    )
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
    '<defs>',
    `<radialGradient id="bg" cx="0.86" cy="0.12" r="0.95"><stop offset="0" stop-color="${colors.backgroundInner}"/><stop offset="1" stop-color="${colors.backgroundOuter}"/></radialGradient>`,
    `<radialGradient id="shine"><stop offset="0" stop-color="${colors.shine}"/><stop offset="1" stop-color="${colors.shine}" stop-opacity="0"/></radialGradient>`,
    // Keeps the text side calm and legible whatever the pattern does.
    `<linearGradient id="calm" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#09090b" stop-opacity="0.55"/><stop offset="0.5" stop-color="#09090b" stop-opacity="0.15"/><stop offset="0.75" stop-color="#09090b" stop-opacity="0"/></linearGradient>`,
    '</defs>',
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>`,
    ...glows,
    '<g stroke-width="1.5" stroke-linejoin="round">',
    ...polygons,
    '</g>',
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#calm)"/>`,
    '</svg>'
  ].join('')
}
