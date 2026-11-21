<script setup lang="ts">
// The suggested layout as a channel list, the way it will look in the Community's sidebar.
import { CHANNEL_TYPE } from '~/lib/community/colibri'
import type { CommunityPlan, PlannedChannel } from '~/lib/community/structure'

defineProps<{ plan: CommunityPlan }>()

function iconOf(channel: PlannedChannel): string {
  if (channel.ownerOnly) return 'i-lucide-megaphone'
  if (channel.team) return 'i-lucide-users'
  if (channel.type === CHANNEL_TYPE.forum) return 'i-lucide-messages-square'
  return 'i-lucide-hash'
}

function noteOf(channel: PlannedChannel): string | undefined {
  if (channel.ownerOnly) return 'admins post'
  if (channel.team) return 'team posts'
  if (channel.type === CHANNEL_TYPE.forum) return 'threads'
  return undefined
}
</script>

<template>
  <div class="space-y-4">
    <section v-for="category in plan.categories" :key="category.key">
      <h4 class="text-xs font-semibold tracking-wide text-muted uppercase">
        {{ category.name }}
      </h4>
      <ul class="mt-1.5 space-y-0.5">
        <li
          v-for="channel in category.channels"
          :key="channel.marker ?? channel.name"
          class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm text-default"
        >
          <UIcon :name="iconOf(channel)" class="size-4 shrink-0 text-muted" />
          <span class="truncate">{{ channel.name }}</span>
          <span v-if="noteOf(channel)" class="ml-auto shrink-0 text-xs text-dimmed">
            {{ noteOf(channel) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
