import type { ForgeProvider } from '~/types/forge'
import { githubProvider } from './github'
import { tangledProvider } from './tangled'

export const forges = {
  github: githubProvider,
  tangled: tangledProvider
} satisfies Record<string, ForgeProvider>

export type KnownForgeId = keyof typeof forges

export const forgeList: ForgeProvider[] = Object.values(forges)

export function getForge(id: string): ForgeProvider | undefined {
  return (forges as Record<string, ForgeProvider>)[id]
}

export function isForgeId(id: string): id is KnownForgeId {
  return id in forges
}
