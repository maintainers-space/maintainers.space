<script setup lang="ts">
import type { CategoryView, ChannelView } from '~/lib/chat/colibri'

const props = defineProps<{
  categories: CategoryView[]
  channels: ChannelView[]
  activeChannel: string | null
  communityName: string
}>()

const emit = defineEmits<{ select: [uri: string] }>()

const grouped = computed(() => {
  const byUri = new Map(props.channels.map((c) => [c.uri, c]))
  return props.categories.map((cat) => ({
    category: cat,
    channels: cat.channelOrder.map((uri) => byUri.get(uri)).filter((c): c is ChannelView => !!c)
  }))
})
</script>

<template>
  <nav class="flex w-56 shrink-0 flex-col border-r border-default bg-elevated/30">
    <div class="border-b border-default px-3 py-3">
      <p class="truncate text-sm font-semibold text-highlighted">{{ communityName }}</p>
    </div>
    <div class="flex-1 space-y-3 overflow-y-auto px-2 py-3">
      <div v-for="group in grouped" :key="group.category.uri">
        <p class="px-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
          {{ group.category.name }}
        </p>
        <ul class="space-y-0.5">
          <li v-for="ch in group.channels" :key="ch.uri">
            <button
              type="button"
              class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition"
              :class="
                activeChannel === ch.uri
                  ? 'bg-primary/15 font-medium text-primary'
                  : 'text-toned hover:bg-elevated/60 hover:text-default'
              "
              @click="emit('select', ch.uri)"
            >
              <UIcon name="i-lucide-hash" class="size-4 shrink-0 opacity-60" />
              <span class="truncate">{{ ch.name }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>
