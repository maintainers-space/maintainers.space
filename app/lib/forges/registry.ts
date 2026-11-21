// App-level description of the forges maintainers.space talks to. The `forges`
// package owns every API call and data model; this table only holds what the
// package cannot know: our route ids, branding and display hints.

import type { ForgeKind, ForgeOrigin, RepoRef } from 'forges'

export interface ForgeDescriptor {
  /** Brand color (hex) for badges/accents. */
  color: string
  /** Relative real-world prevalence of this forge (repo/user volume). */
  dominance: number
  /** Icon name understood by Nuxt UI / Iconify. */
  icon: string
  id: string
  /** Host used in refs, matching `ForgeOrigin.instance`. */
  instance: string
  kind: ForgeKind
  label: string
  /** Label for the first URL segment, e.g. "Owner" or "Handle". */
  ownerLabel: string
  ownerPlaceholder: string
  repoPlaceholder: string
  /** Web root of the forge, for links to an account's own page. */
  web: string
  /** API base URL, when the package default is not the instance we want. */
  baseUrl?: string
}

export const FORGES = {
  github: {
    color: '#1f2328',
    dominance: 12,
    icon: 'i-simple-icons-github',
    id: 'github',
    instance: 'github.com',
    kind: 'github',
    label: 'GitHub',
    ownerLabel: 'Owner',
    ownerPlaceholder: 'e.g. vuejs',
    repoPlaceholder: 'e.g. core',
    web: 'https://github.com'
  },
  gitlab: {
    color: '#fc6d26',
    dominance: 4,
    icon: 'i-simple-icons-gitlab',
    id: 'gitlab',
    instance: 'gitlab.com',
    kind: 'gitlab',
    label: 'GitLab',
    ownerLabel: 'Owner',
    ownerPlaceholder: 'e.g. gitlab-org',
    repoPlaceholder: 'e.g. gitlab',
    web: 'https://gitlab.com'
  },
  tangled: {
    color: '#4f46e5',
    dominance: 1,
    icon: 'i-maintainers-space-tangled',
    id: 'tangled',
    instance: 'tangled.org',
    kind: 'tangled',
    label: 'Tangled',
    ownerLabel: 'Handle',
    ownerPlaceholder: 'e.g. tangled.org',
    repoPlaceholder: 'e.g. core',
    web: 'https://tangled.org'
  },
  codeberg: {
    baseUrl: 'https://codeberg.org',
    color: '#2185d0',
    dominance: 1.5,
    icon: 'i-simple-icons-codeberg',
    id: 'codeberg',
    instance: 'codeberg.org',
    kind: 'forgejo',
    label: 'Codeberg',
    ownerLabel: 'Owner',
    ownerPlaceholder: 'e.g. forgejo',
    repoPlaceholder: 'e.g. forgejo',
    web: 'https://codeberg.org'
  },
  gitea: {
    baseUrl: 'https://gitea.com',
    color: '#609926',
    dominance: 1.2,
    icon: 'i-simple-icons-gitea',
    id: 'gitea',
    instance: 'gitea.com',
    kind: 'gitea',
    label: 'Gitea',
    ownerLabel: 'Owner',
    ownerPlaceholder: 'e.g. gitea',
    repoPlaceholder: 'e.g. tea',
    web: 'https://gitea.com'
  },
  bitbucket: {
    color: '#0052cc',
    dominance: 3,
    icon: 'i-simple-icons-bitbucket',
    id: 'bitbucket',
    instance: 'bitbucket.org',
    kind: 'bitbucket',
    label: 'Bitbucket',
    ownerLabel: 'Workspace',
    ownerPlaceholder: 'e.g. atlassian',
    repoPlaceholder: 'e.g. aui',
    web: 'https://bitbucket.org'
  }
} as const satisfies Record<string, ForgeDescriptor>

export type KnownForgeId = keyof typeof FORGES

export const forgeList: ForgeDescriptor[] = Object.values(FORGES)

export function getForge(id: string): ForgeDescriptor | undefined {
  return (FORGES as Record<string, ForgeDescriptor>)[id]
}

export function isForgeId(id: string): id is KnownForgeId {
  return id in FORGES
}

/** The app's route id (`codeberg`, not `forgejo`) for anything the package hands us. */
export function forgeIdOf(origin: ForgeOrigin | { kind: ForgeKind; instance: string }): string {
  const kind = 'forge' in origin ? origin.forge : origin.kind
  return forgeList.find((f) => f.kind === kind && f.instance === origin.instance)?.id ?? kind
}

/** A repo ref from the `/:provider/:owner/:repo` route params; `undefined` for an unknown provider id. */
export function repoRefOf(providerId: string, owner: string, name: string): RepoRef | undefined {
  const descriptor = getForge(providerId)
  if (!descriptor) return undefined
  return { forge: descriptor.kind, instance: descriptor.instance, name, owner }
}

/** The forge's own page for an account or organisation. */
export function ownerWebUrl(id: string, owner: string): string | undefined {
  const descriptor = getForge(id)
  return descriptor ? `${descriptor.web}/${owner}` : undefined
}
