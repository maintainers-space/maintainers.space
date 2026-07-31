<script setup lang="ts">
import type { ForgeCommitDetail } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const sha = computed(() => String(route.params.sha))

const { data, pending, error } = useLiveAsyncData<ForgeCommitDetail | null>(
  () => `commit:${provider.value}:${owner.value}:${name.value}:${sha.value}`,
  async () => {
    if (!forge.value?.getCommit) return null
    return await forge.value.getCommit(locator.value, sha.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)

const title = computed(() => data.value?.message.split('\n')[0] ?? '')
const bodyText = computed(() => {
  const rest = data.value?.message.split('\n').slice(1).join('\n').trim()
  return rest || ''
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="pending && !data" class="space-y-2">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load commit"
      :description="error?.message"
    />

    <template v-else-if="data">
      <div class="rounded-lg border border-default p-4">
        <h2 class="text-base font-semibold text-highlighted">
          {{ title }}
        </h2>
        <pre v-if="bodyText" class="mt-2 whitespace-pre-wrap font-sans text-sm text-muted">{{
          bodyText
        }}</pre>
        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span v-if="data.author" class="inline-flex items-center gap-1.5">
            <UAvatar v-if="data.author.avatarUrl" :src="data.author.avatarUrl" size="3xs" />
            <span class="font-medium text-default">{{
              data.author.name || data.author.login
            }}</span>
            committed
            <span v-if="data.author.when">{{ formatRelativeTime(data.author.when) }}</span>
          </span>
          <span class="rounded border border-default px-2 py-0.5 font-mono">{{
            data.shortSha
          }}</span>
          <span v-if="data.stat" class="flex items-center gap-2 font-mono">
            <span v-if="data.stat.filesChanged">{{ data.stat.filesChanged }} files</span>
            <span v-if="data.stat.additions" class="text-success">+{{ data.stat.additions }}</span>
            <span v-if="data.stat.deletions" class="text-error">-{{ data.stat.deletions }}</span>
          </span>
        </div>
      </div>

      <DiffView v-if="data.files?.length" :files="data.files" />
      <p
        v-else
        class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
      >
        No file changes to display.
      </p>
    </template>
  </div>
</template>
