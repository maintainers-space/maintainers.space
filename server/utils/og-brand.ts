// The brand mark shared by every OG image — same three interlocking-hexagon
// paths as app/components/AppLogo.vue, rasterized via an inline SVG data URI
// (Takumi's `image()` node decodes SVG src data URIs directly). Fixed brand
// yellow (`useAccentColor`'s DEFAULT_ACCENT), never the viewer's personal
// accent — these images are cached per-URL and shared with everyone who sees
// the link, not tailored to any one visitor.
import { container, image, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import { OG_FONT_FAMILY } from './og-render'

const BRAND_YELLOW = '#eab308'

const LOGO_SVG = `<svg viewBox="0 0 337 337" xmlns="http://www.w3.org/2000/svg" fill="none">
<path d="M208.45 102.774C213.331 99.9558 215.771 98.547 218.45 98.547C221.13 98.547 223.57 99.9558 228.45 102.774L295.053 141.226C299.933 144.044 302.373 145.453 303.713 147.774C305.053 150.094 305.053 152.912 305.053 158.547V235.453C305.053 241.088 305.053 243.906 303.713 246.226C302.373 248.547 299.933 249.956 295.053 252.774L228.45 291.226C223.57 294.044 221.13 295.453 218.45 295.453C215.771 295.453 213.331 294.044 208.45 291.226L141.848 252.774C136.967 249.956 134.527 248.547 133.187 246.226C131.848 243.906 131.848 241.088 131.848 235.453V158.547C131.848 152.912 131.848 150.094 133.187 147.774C134.527 145.453 136.967 144.044 141.848 141.226L208.45 102.774Z" stroke="#171717" stroke-width="19"/>
<path d="M205.062 235.45C205.062 241.085 205.062 243.903 203.722 246.224C202.382 248.544 199.942 249.953 195.062 252.771L128.459 291.224C123.579 294.041 121.138 295.45 118.459 295.45C115.779 295.45 113.339 294.041 108.459 291.224L41.8564 252.771C36.9761 249.953 34.5359 248.544 33.1962 246.224C31.8564 243.903 31.8564 241.085 31.8564 235.45L31.8564 158.544C31.8564 152.909 31.8564 150.091 33.1962 147.771C34.5359 145.45 36.9761 144.041 41.8564 141.224L108.459 102.771C113.339 99.9529 115.779 98.5441 118.459 98.5441C121.138 98.5441 123.579 99.9529 128.459 102.771L195.062 141.224C199.942 144.041 202.382 145.45 203.722 147.771C205.062 150.091 205.062 152.909 205.062 158.544L205.062 235.45Z" stroke="#171717" stroke-width="19"/>
<path d="M91.8535 166.782C86.9732 163.965 84.533 162.556 83.1933 160.235C81.8535 157.915 81.8535 155.097 81.8535 149.462L81.8535 72.5558C81.8535 66.9205 81.8535 64.1028 83.1933 61.7823C84.533 59.4618 86.9732 58.053 91.8535 55.2353L158.456 16.7823C163.336 13.9646 165.777 12.5558 168.456 12.5558C171.136 12.5558 173.576 13.9646 178.456 16.7823L245.059 55.2353C249.939 58.053 252.379 59.4618 253.719 61.7823C255.059 64.1028 255.059 66.9205 255.059 72.5558L255.059 149.462C255.059 155.097 255.059 157.915 253.719 160.235C252.379 162.556 249.939 163.965 245.059 166.782L178.456 205.235C173.576 208.053 171.136 209.462 168.456 209.462C165.777 209.462 163.336 208.053 158.456 205.235L91.8535 166.782Z" stroke="#171717" stroke-width="19"/>
</svg>`

const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`

export interface OgBrandOptions {
  size?: number
  showWordmark?: boolean
}

export function ogBrand({ size = 40, showWordmark = true }: OgBrandOptions = {}): Node {
  const children: Node[] = [
    container({
      tw: 'flex items-center justify-center',
      style: {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${size * 0.28}px`,
        backgroundColor: BRAND_YELLOW
      },
      children: [image({ src: LOGO_DATA_URI, width: size * 0.6, height: size * 0.6 })]
    })
  ]
  if (showWordmark) {
    children.push(
      text('maintainers', {
        fontFamily: OG_FONT_FAMILY,
        fontSize: size * 0.55,
        fontWeight: 600,
        color: 'white',
        letterSpacing: '-0.02em'
      })
    )
  }
  return container({ tw: 'flex items-center', style: { gap: '12px' }, children })
}
