<script setup lang="ts">
// Settings panel for offline repository availability.
//
// Controls the automatic prefetcher (enabled, and how many frequently-visited
// repos it keeps) and a per-repo list of "always available offline" repos
// (pinned). Sharing the composable here means the opt-in toggle and the cap
// reach the same persisted state used by the auto-start plugin.
import type { RepoRef } from '~/composables/useOfflineRepos'
import { useOfflineRepos } from '~/composables/useOfflineRepos'

const offline = useOfflineRepos()
const toast = useToast()

const pinnedList = computed<RepoRef[]>(() => offline.settings.value.pinned)

function onToggle(enabled: boolean) {
  offline.setEnabled(enabled)
  toast.add({
    title: enabled ? 'Offline access enabled' : 'Offline access paused',
    color: 'success'
  })
}

function onMaxCountChange(value: number | null) {
  if (value === null) return
  offline.setMaxCount(value)
}

async function onMakeUnavailable(entry: RepoRef) {
  offline.makeUnavailable(entry)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="font-semibold text-highlighted">Offline access</h2>
      <p class="text-sm text-muted">
        Keep the repositories you return to most readable without an internet connection. This only
        stores public, read-only data ({README, file tree, metadata) on this device — no tokens or
        private information.
      </p>
    </div>

    <UCard>
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-default">Automatically keep frequent repos available</p>
          <p class="text-sm text-muted">
            Repos you visit most are made available offline, up to your maximum.
          </p>
        </div>
        <USwitch
          :model-value="offline.settings.value.enabled"
          :aria-label="'Toggle automatic offline access'"
          @update:model-value="onToggle"
        />
      </div>
    </UCard>

    <UCard v-if="offline.settings.value.enabled">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-default">Maximum repos kept automatically</p>
          <p class="text-sm text-muted">
            When this many are already available offline, only your most-visited repos stay cached
            on this device.
          </p>
        </div>
        <UInputNumber
          :model-value="offline.settings.value.maxCount"
          :min="10"
          :max="500"
          :step="10"
          size="md"
          class="w-32"
          @update:model-value="onMaxCountChange"
        />
      </div>
    </UCard>

    <UCard>
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-default">Always available offline</p>
          <p class="text-sm text-muted">
            Repositories you pin are kept offline regardless of how often you visit them.
          </p>
        </div>
      </div>

      <div v-if="!pinnedList.length" class="mt-4 space-y-2">
        <p class="text-sm text-muted">
          No pinned repositories yet. Open a repository and press "Available offline" in its header.
        </p>
      </div>
      <ul
        v-else
        class="mt-4 divide-y divide-default overflow-hidden rounded-lg border border-default"
      >
        <li
          v-for="entry in pinnedList"
          :key="`${entry.provider}/${entry.owner}/${entry.name}`"
          class="flex items-center gap-3 px-4 py-3"
        >
          <NuxtLink
            :to="`/${entry.provider}/${entry.owner}/${entry.name}`"
            class="min-w-0 flex-1 truncate font-medium text-default hover:text-primary"
          >
            {{ entry.owner }}/{{ entry.name }}
          </NuxtLink>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-cloud-off"
            label="Unpin"
            @click="onMakeUnavailable(entry)"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
