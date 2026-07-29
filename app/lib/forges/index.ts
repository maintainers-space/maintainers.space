import type { ForgeProvider } from '~/types/forge'
import { githubProvider } from './github'
import { gitlabProvider } from './gitlab'
import { tangledProvider } from './tangled'
import { codebergProvider } from './codeberg'
import { giteaProvider } from './gitea'
import { bitbucketProvider } from './bitbucket'

export const forges = {
  github: githubProvider,
  gitlab: gitlabProvider,
  tangled: tangledProvider,
  codeberg: codebergProvider,
  gitea: giteaProvider,
  bitbucket: bitbucketProvider
} satisfies Record<string, ForgeProvider>

export type KnownForgeId = keyof typeof forges

export const forgeList: ForgeProvider[] = Object.values(forges)

export function getForge(id: string): ForgeProvider | undefined {
  return (forges as Record<string, ForgeProvider>)[id]
}

export function isForgeId(id: string): id is KnownForgeId {
  return id in forges
}
