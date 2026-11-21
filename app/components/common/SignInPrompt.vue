<script setup lang="ts">
defineProps<{
  /** What signing in unlocks on this page, as one sentence. */
  message: string
}>()

const route = useRoute()
const loginPath = computed(() => `/login?${new URLSearchParams({ redirect: route.fullPath })}`)
</script>

<template>
  <div class="rounded-lg border border-dashed border-default px-4 py-16 text-center">
    <UIcon name="i-lucide-lock" class="mx-auto size-8 text-muted" />
    <p class="mt-3 text-sm text-muted">{{ message }}</p>
    <UButton :to="loginPath" label="Sign in" icon="i-lucide-log-in" class="mt-4" />
  </div>
</template>
