<script setup lang="ts">
// Settings is now single-purpose (account management) — identity details live on
// the unified profile page. Send the bare /settings route straight there.
definePageMeta({
  middleware() {
    return navigateTo('/settings/accounts', { replace: true })
  }
})
</script>

<template>
  <div />
</template>
