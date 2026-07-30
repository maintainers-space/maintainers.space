import { createGiteaFamilyProvider } from './gitea-shared'

// Codeberg is a community-run Forgejo instance (Forgejo is a Gitea hard fork),
// so it's just the shared Gitea-family REST client pointed at codeberg.org.
export const codebergProvider = createGiteaFamilyProvider({
  id: 'codeberg',
  label: 'Codeberg',
  icon: 'i-simple-icons-codeberg',
  color: '#2185d0',
  dominance: 1.5,
  apiBase: 'https://codeberg.org/api/v1',
  webBase: 'https://codeberg.org',
  ownerLabel: 'Owner',
  ownerPlaceholder: 'e.g. forgejo',
  repoPlaceholder: 'e.g. forgejo'
})
