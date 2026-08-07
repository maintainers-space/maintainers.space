<script setup lang="ts">
import { Agent } from '@atproto/api'
import type { OAuthUserAgent } from '@atcute/oauth-browser-client'
import { mountColibri, type EmbedEvent, type EmbedHandle } from '@colibri-social/client/embed'
import '@colibri-social/client/embed.css'
import { ACCENT_COLORS } from '~/composables/useAccentColor'

const props = defineProps<{ communityUri: string; channel?: string | null }>()

const emit = defineEmits<{
  navigate: [channel: string | undefined]
  scopesMissing: [missing: string[]]
}>()

const { agent, logout } = useAuth()
const { current: accent } = useAccentColor()
const config = useRuntimeConfig()

const container = ref<HTMLElement | null>(null)
let handle: EmbedHandle | null = null
let reportedChannel: string | undefined

const accentTheme = computed(() => {
  const option = ACCENT_COLORS.find((c) => c.id === accent.value)
  return {
    primary: option?.swatch ?? '#eab308',
    foreground: option?.needsDarkText ? '#18181b' : '#fafafa'
  }
})

function themeTokens(): Record<string, string> {
  return {
    primary: accentTheme.value.primary,
    'primary-hover': accentTheme.value.primary,
    'primary-foreground': accentTheme.value.foreground,
    'sidebar-primary': accentTheme.value.primary,
    'sidebar-primary-foreground': accentTheme.value.foreground,
    ring: accentTheme.value.primary,
    'font-sans': "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
    radius: '0.5rem'
  }
}

function onEvent(event: EmbedEvent): void {
  switch (event.kind) {
    case 'navigation':
      reportedChannel = event.channel
      emit('navigate', event.channel)
      break
    case 'scopes.missing':
      emit('scopesMissing', event.missing)
      break
    case 'auth.expired':
      void logout()
      break
    case 'error':
      console.warn('[colibri]', event.code)
      break
  }
}

function unmount(): void {
  handle?.unmount()
  handle = null
}

function mount(): void {
  unmount()

  const oauth = agent.value as OAuthUserAgent | null
  if (!oauth || !container.value) return

  handle = mountColibri(container.value, {
    agent: new Agent({
      did: oauth.sub,
      fetchHandler: (url, init) => oauth.handle(url, init)
    }),
    scope: oauth.session.token.scope,
    community: props.communityUri,
    channel: props.channel ?? undefined,
    appViewUrl: config.public.colibriAppviewUrl,
    colorScheme: 'dark',
    theme: themeTokens(),
    sentry: false,
    onEvent
  })
}

onMounted(mount)
onBeforeUnmount(unmount)

watch([() => props.communityUri, agent], () => {
  mount()
})

watch(
  () => props.channel,
  (rkey) => {
    if (rkey && rkey !== reportedChannel) handle?.navigate({ channel: rkey })
  }
)

watch(accentTheme, () => {
  handle?.setTheme(themeTokens())
})
</script>

<template>
  <div ref="container" class="size-full" />
</template>
