<script setup lang="ts">
// The community's channels by category, in the order its admins arranged them.
import { channelIcon as icon, type ChannelView } from '~/lib/community/colibri'
import { rkeyOf } from '~/lib/community/records'

defineProps<{ active: string | null }>()
const emit = defineEmits<{ select: [rkey: string] }>()

const chat = useCommunityChat()
const collapsed = ref(new Set<string>())

const sections = computed(() => {
  const { categories, channels, community } = chat.data.value
  const order = community.categoryOrder ?? []
  const sorted = categories.toSorted((a, b) => {
    const [ia, ib] = [order.indexOf(a.uri), order.indexOf(b.uri)]
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
  })
  return sorted.map((category) => {
    const channelOrder = category.channelOrder ?? []
    const rank = (c: ChannelView) => {
      const i = channelOrder.findIndex((o) => o === c.uri || o === rkeyOf(c.uri))
      return i < 0 ? Infinity : i
    }
    return {
      category,
      channels: channels
        .filter((c) => c.category === category.uri)
        .toSorted((a, b) => rank(a) - rank(b))
    }
  })
})

function toggle(uri: string): void {
  const next = new Set(collapsed.value)
  if (next.has(uri)) next.delete(uri)
  else next.add(uri)
  collapsed.value = next
}
</script>

<template>
  <nav class="space-y-3" aria-label="Channels">
    <section v-for="{ category, channels } in sections" :key="category.uri">
      <button
        type="button"
        class="flex w-full items-center gap-1 px-1.5 text-xs font-semibold tracking-wide text-muted uppercase hover:text-default"
        :aria-expanded="!collapsed.has(category.uri)"
        @click="toggle(category.uri)"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-3 transition-transform"
          :class="{ '-rotate-90': collapsed.has(category.uri) }"
        />
        <span class="truncate">{{ category.name }}</span>
      </button>
      <ul v-show="!collapsed.has(category.uri)" class="mt-1 space-y-0.5">
        <li v-for="channel in channels" :key="channel.uri">
          <button
            type="button"
            class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition"
            :class="
              active === rkeyOf(channel.uri)
                ? 'bg-elevated font-medium text-highlighted'
                : 'text-muted hover:bg-elevated/60 hover:text-default'
            "
            :aria-current="active === rkeyOf(channel.uri) ? 'page' : undefined"
            @click="emit('select', rkeyOf(channel.uri))"
          >
            <UIcon :name="icon(channel)" class="size-4 shrink-0" />
            <span class="truncate">{{ channel.name }}</span>
            <UIcon
              v-if="channel.allowedRoles?.length || channel.allowedMembers?.length"
              name="i-lucide-lock"
              class="ml-auto size-3 shrink-0 text-dimmed"
            />
          </button>
        </li>
      </ul>
    </section>
  </nav>
</template>
