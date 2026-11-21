<script setup lang="ts">
// Colibri's own client, mounted into this page for one community. It talks to the AppView and the
// viewer's PDS itself, as the signed-in account; we hand it an agent, our theme and the channel
// to open, and hear back where the viewer navigated.
import { Agent } from '@atproto/api'
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
const colorMode = useColorMode()
const config = useRuntimeConfig()

const container = useTemplateRef<HTMLElement>('container')
let handle: EmbedHandle | null = null
let reportedChannel: string | undefined

const colorScheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))

function themeTokens(): Record<string, string> {
  const option = ACCENT_COLORS.find((c) => c.id === accent.value)
  const primary = option?.swatch ?? '#eab308'
  const foreground = option?.needsDarkText ? '#18181b' : '#fafafa'
  return {
    'font-sans': "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
    primary,
    'primary-foreground': foreground,
    'primary-hover': primary,
    radius: '0.5rem',
    ring: primary,
    'sidebar-primary': primary,
    'sidebar-primary-foreground': foreground
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
      console.warn('[community]', event.code)
      break
  }
}

function unmount(): void {
  handle?.unmount()
  handle = null
}

function mount(): void {
  unmount()
  const oauth = agent.value
  if (!oauth || !container.value) return
  reportedChannel = props.channel ?? undefined
  handle = mountColibri(container.value, {
    agent: new Agent({ did: oauth.sub, fetchHandler: (url, init) => oauth.handle(url, init) }),
    appViewUrl: config.public.colibriAppviewUrl,
    channel: props.channel ?? undefined,
    colorScheme: colorScheme.value,
    community: props.communityUri,
    onEvent,
    scope: oauth.session.token.scope,
    sentry: false,
    storagePrefix: 'maintainers.space:community:',
    theme: themeTokens()
  })
}

onMounted(mount)
onBeforeUnmount(unmount)

// The embed takes its colour scheme only when mounting.
watch([() => props.communityUri, agent, colorScheme], mount)

watch(
  () => props.channel,
  (rkey) => {
    if (rkey && rkey !== reportedChannel) handle?.navigate({ channel: rkey })
  }
)

watch(accent, () => handle?.setTheme(themeTokens()))
</script>

<template>
  <div ref="container" class="size-full" />
</template>
