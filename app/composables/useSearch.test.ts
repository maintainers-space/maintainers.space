import { describe, expect, it } from 'vitest'

import type { RepoCard } from '~/lib/forges/view'
import { rankRepos } from './useSearch'

function card(fullName: string, description: string, stars: number): RepoCard {
  const [owner, name] = fullName.split('/') as [string, string]
  return {
    description,
    fullName,
    isFork: false,
    isPrivate: false,
    name,
    owner,
    provider: 'github',
    stars,
    topics: [],
    url: ''
  }
}

describe('rankRepos', () => {
  it('ranks repos named after a multi-word query above ones that only mention it', () => {
    const ranked = rankRepos(
      [
        card('someone/weather-app', 'A weather app built with Vue Router', 0),
        card('vuejs/router', 'The official router for Vue.js', 4500),
        card('posva/unplugin-vue-router', 'Next generation typed routing for Vue Router', 2100)
      ],
      'vue router'
    )

    expect(ranked.map((r) => r.fullName)).toEqual([
      'posva/unplugin-vue-router',
      'vuejs/router',
      'someone/weather-app'
    ])
  })

  it('treats separators in names as spaces', () => {
    const ranked = rankRepos(
      [
        card('acme/docs', 'Docs that use vue-router', 10),
        card('vuejs/vue-router', 'Vue 2 router', 10)
      ],
      'vue router'
    )

    expect(ranked[0]?.fullName).toBe('vuejs/vue-router')
  })
})
