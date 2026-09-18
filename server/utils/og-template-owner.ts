// An owner (user or org) card: avatar, handle, forge badge, and repo count.
import { container, image, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import type { ForgeRepo } from '~/types/forge'
import { ogBrand } from './og-brand'
import { ogFrame } from './og-frame'
import { FORGE_LABEL } from './og-icons'
import { OG_FONT_FAMILY } from './og-render'

const BRAND_YELLOW = '#eab308'
const AVATAR_SIZE = 168

export interface OgOwnerData {
  provider: string
  owner: string
  repos: ForgeRepo[]
}

function avatarNode(owner: string, avatarUrl?: string | null): Node {
  if (avatarUrl) {
    return image({
      src: avatarUrl,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      style: { borderRadius: '50%' }
    })
  }
  const initial = owner.trim().charAt(0).toUpperCase()
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

export function ogOwnerTemplate({ provider, owner, repos }: OgOwnerData): Node {
  const avatarUrl = repos.find((r) => r.ownerAvatar)?.ownerAvatar
  const forgeLabel = FORGE_LABEL[provider] ?? provider

  return ogFrame([
    container({
      tw: 'flex h-full w-full flex-col justify-between p-16',
      style: {},
      children: [
        container({
          tw: 'flex flex-col',
          style: { gap: '18px' },
          children: [
            avatarNode(owner, avatarUrl),
            text(owner, {
              fontFamily: OG_FONT_FAMILY,
              fontSize: 58,
              fontWeight: 700,
              color: 'white'
            }),
            container({
              tw: 'flex flex-row items-center',
              style: { gap: '14px' },
              children: [
                container({
                  tw: 'flex items-center rounded-full',
                  style: { padding: '7px 18px', backgroundColor: 'rgba(255,255,255,0.08)' },
                  children: [
                    text(forgeLabel, {
                      fontFamily: OG_FONT_FAMILY,
                      fontSize: 22,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.8)'
                    })
                  ]
                }),
                text(`${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}`, {
                  fontFamily: OG_FONT_FAMILY,
                  fontSize: 26,
                  color: 'rgba(255,255,255,0.65)'
                })
              ]
            })
          ]
        }),
        ogBrand({ size: 34 })
      ]
    })
  ])
}
