<script setup lang="ts">
import type { ForgeIssue, ForgeIssueState } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))

const state = ref<ForgeIssueState>('open')
const items = ref<ForgeIssue[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  if (!forge.value?.listIssues) return
  loading.value = true
  error.value = null
  try {
    const page = await forge.value.listIssues(locator.value, { state: state.value, limit: 30 })
    items.value = page.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load issues.'
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name, state], load)
onMounted(load)

function itemLink(it: ForgeIssue): string {
  return `${base.value}/issues/${encodeURIComponent(it.id)}`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-1">
      <UButton
        :color="state === 'open' ? 'primary' : 'neutral'"
        :variant="state === 'open' ? 'soft' : 'ghost'"
        icon="i-lucide-circle-dot"
        size="sm"
        label="Open"
        @click="state = 'open'"
      />
      <UButton
        :color="state === 'closed' ? 'primary' : 'neutral'"
        :variant="state === 'closed' ? 'soft' : 'ghost'"
        icon="i-lucide-check-circle"
        size="sm"
        label="Closed"
        @click="state = 'closed'"
      />
    </div>

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load issues"
      :description="error"
    />

    <div v-else-if="!items.length" class="rounded-lg border border-dashed border-default py-16 text-center">
      <UIcon name="i-lucide-circle-check" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">
        No {{ state }} issues.
      </p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
      <li v-for="it in items" :key="it.id">
        <NuxtLink :to="itemLink(it)" class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40">
          <UIcon
            :name="it.state === 'open' ? 'i-lucide-circle-dot' : 'i-lucide-check-circle'"
            class="mt-0.5 size-4 shrink-0"
            :class="it.state === 'open' ? 'text-success' : 'text-primary'"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-default">{{ it.title }}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span v-if="it.number">#{{ it.number }}</span>
              <span v-if="it.author">· {{ userLabel(it.author) }}</span>
              <span v-if="it.updatedAt">· {{ formatRelativeTime(it.updatedAt) }}</span>
            </div>
          </div>
          <span v-if="it.commentCount" class="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
            <UIcon name="i-lucide-message-square" class="size-3.5" />{{ it.commentCount }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
