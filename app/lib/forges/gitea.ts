import { createGiteaFamilyProvider } from './gitea-family'

// gitea.com is Gitea's own hosted community instance (the bare domain redirects
// to a marketing site, but the instance itself — signup, repos, OAuth apps — is
// live underneath it), so this is just the shared Gitea-family REST client
// pointed there, the same way codeberg.ts points it at Codeberg.
export const giteaProvider = createGiteaFamilyProvider({
  id: 'gitea',
  label: 'Gitea',
  icon: 'i-simple-icons-gitea',
  color: '#609926',
  dominance: 1.2,
  apiBase: 'https://gitea.com/api/v1',
  webBase: 'https://gitea.com',
  ownerLabel: 'Owner',
  ownerPlaceholder: 'e.g. gitea',
  repoPlaceholder: 'e.g. tea'
})
