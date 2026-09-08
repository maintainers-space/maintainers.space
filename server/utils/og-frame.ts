// Shared dark card background for every OG image — same dark theme color
// app.vue uses for its own `theme-color` meta tag, so a screenshot and the
// share-preview card read as the same brand. Includes a decorative corner
// gradient blob echoing the colorful corner treatment on tangled.org's own
// OG images.
import { container } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'

const DARK_BG = '#1b1718'

export function ogFrame(children: Node[]): Node {
  return container({
    tw: 'relative flex w-full h-full',
    style: { backgroundColor: DARK_BG, color: 'white' },
    children: [
      container({
        tw: 'absolute',
        style: {
          top: '-220px',
          right: '-220px',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          backgroundImage:
            'radial-gradient(circle at 30% 30%, rgba(234,179,8,0.55), rgba(234,179,8,0) 60%), radial-gradient(circle at 70% 70%, rgba(59,130,246,0.35), rgba(59,130,246,0) 55%)'
        },
        children: []
      }),
      container({ tw: 'relative flex w-full h-full', style: {}, children })
    ]
  })
}
