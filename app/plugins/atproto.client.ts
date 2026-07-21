import { configureAtprotoOAuth } from '~/lib/atproto/oauth'

// Client-only: OAuth relies on localStorage + window.crypto and must run in the browser.
export default defineNuxtPlugin(async () => {
  configureAtprotoOAuth()
  await useAuth().restore()
})
