// The atproto profile card: avatar, display name, handle, a shortened DID,
// and a row of the forges this identity has linked accounts on.
import { container, image, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import { shortDid } from '~/utils'
import type { OgProfileData } from './og-data'
import { ogBrand } from './og-brand'
import { ogFrame } from './og-frame'
import { FORGE_LABEL } from './og-icons'
import { OG_FONT_FAMILY } from './og-render'

const BRAND_YELLOW = '#eab308'
const AVATAR_SIZE = 168

function avatarNode(profile: OgProfileData['profile']): Node {
  if (profile.avatar) {
    return image({
      src: profile.avatar,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      style: { borderRadius: '50%' }
    })
  }
  const initial = (profile.displayName || profile.handle || '?').trim().charAt(0).toUpperCase()
  return container({
    tw: 'flex items-center justify-center',
    style: {
      width: `${AVATAR_SIZE}px`,
      height: `${AVATAR_SIZE}px`,
      borderRadius: '50%',
      backgroundColor: BRAND_YELLOW
    },
    children: [
      text(initial, { fontFamily: OG_FONT_FAMILY, fontSize: 76, fontWeight: 700, color: '#171717' })
    ]
  })
}

export function ogProfileTemplate({ profile, accounts }: OgProfileData): Node {
  const name = profile.displayName || profile.handle
  const forgeNames = [...new Set(accounts.map((a) => a.provider))]

  const children: Node[] = [
    avatarNode(profile),
    text(name, { fontFamily: OG_FONT_FAMILY, fontSize: 56, fontWeight: 700, color: 'white' })
  ]
  if (profile.displayName && profile.displayName !== profile.handle) {
    children.push(
      text(`@${profile.handle}`, {
        fontFamily: OG_FONT_FAMILY,
        fontSize: 30,
        color: 'rgba(255,255,255,0.65)'
      })
    )
  }
  children.push(
    text(shortDid(profile.did), {
      fontFamily: OG_FONT_FAMILY,
      fontSize: 22,
      color: 'rgba(255,255,255,0.4)'
    })
  )

  if (forgeNames.length) {
    children.push(
      container({
        tw: 'flex flex-row flex-wrap',
        style: { gap: '10px' },
        children: forgeNames.map((p) =>
          container({
            tw: 'flex items-center rounded-full',
            style: { padding: '7px 18px', backgroundColor: 'rgba(255,255,255,0.08)' },
            children: [
              text(FORGE_LABEL[p] ?? p, {
                fontFamily: OG_FONT_FAMILY,
                fontSize: 20,
                color: 'rgba(255,255,255,0.8)'
              })
            ]
          })
        )
      })
    )
  }

  return ogFrame([
    container({
      tw: 'flex h-full w-full flex-col justify-between p-16',
      style: {},
      children: [
        container({ tw: 'flex flex-col', style: { gap: '18px' }, children }),
        ogBrand({ size: 34 })
      ]
    })
  ])
}
