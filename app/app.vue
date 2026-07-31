<script setup lang="ts">
const colorMode = useColorMode()
const { current } = useAccentColor()

const color = computed(() => (colorMode.value === 'dark' ? '#1b1718' : 'white'))
const favicon = computed(() => accentFaviconDataUri(current.value))

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: favicon },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'maintainers.space — one place for every forge'
const description =
  'Browse repositories across GitHub and Tangled, and link your forge accounts to your AT Protocol identity.'

useSeoMeta({
  title,
  titleTemplate: (chunk?: string) =>
    chunk && chunk !== title ? `${chunk} · maintainers.space` : title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp :toaster="{ disableSwipe: true }">
    <VitePwaManifest />
    <NuxtLoadingIndicator />
    <CommonOfflineBanner />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
