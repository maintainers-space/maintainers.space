<script setup lang="ts">
// Global, always-on status bar (not a dismissible alert — it should reappear
// every time connectivity drops, and hide itself the moment it's back).
// Mounted in app.vue, above the layout, so it shows on every page including
// layout:false ones (login, oauth callback).
const isOnline = useOnline()
</script>

<template>
  <div
    v-if="!isOnline"
    class="flex items-center justify-center gap-2 bg-warning/10 px-3 py-1.5 text-center text-xs font-medium text-warning"
  >
    <UIcon name="i-lucide-wifi-off" class="size-3.5 shrink-0" />
    You're offline — showing your last saved data.
  </div>
</template>
