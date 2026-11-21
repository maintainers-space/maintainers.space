<script setup lang="ts">
// A small emoji picker for reactions: a few common ones up front, and search for the rest.
const emit = defineEmits<{ pick: [emoji: string] }>()

const QUICK = ['👍', '❤️', '😂', '🎉', '🚀', '👀', '🙏', '✅']
const query = ref('')
const results = computed(() => searchEmoji(query.value, 48))

function pick(emoji: string): void {
  emit('pick', emoji)
  query.value = ''
}
</script>

<template>
  <div class="w-72 space-y-2 p-2">
    <div class="flex justify-between">
      <button
        v-for="emoji in QUICK"
        :key="emoji"
        type="button"
        class="rounded-md p-1 text-lg leading-none transition hover:bg-elevated"
        :aria-label="`React with ${emoji}`"
        @click="pick(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
    <UInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="Search emoji"
      size="sm"
      class="w-full"
      autofocus
    />
    <div class="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
      <button
        v-for="entry in results"
        :key="entry.slug"
        type="button"
        class="rounded-md p-1 text-lg leading-none transition hover:bg-elevated"
        :title="entry.name"
        :aria-label="entry.name"
        @click="pick(entry.emoji)"
      >
        {{ entry.emoji }}
      </button>
    </div>
  </div>
</template>
