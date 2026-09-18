<script setup lang="ts">
import type { DependencyGroup, DependencyPr } from '~/lib/dependency-updates'
import type { GroupMergeResult } from '~/composables/useDependencyUpdates'

const props = withDefaults(defineProps<{ group: DependencyGroup; defaultOpen?: boolean }>(), {
  defaultOpen: false
})

const { mergeGroup, mergeOne, isPending } = useDependencyUpdates()
const toast = useToast()

const open = ref(props.defaultOpen)
const mergingGroup = ref(false)
/** True while any PR in this group is mid-merge; disables all group actions. */
const anyPending = computed(() => props.group.items.some(isPending))

const reposCount = computed(() => new Set(props.group.items.map((i) => i.repo.fullName)).size)
const subtitle = computed(() => {
  const n = props.group.items.length
  return `${n} PR${n === 1 ? '' : 's'} across ${reposCount.value} ${reposCount.value === 1 ? 'repository' : 'repositories'}`
})

/** Render a result summary + per-PR failures for one merge batch. */
function reportResult(result: GroupMergeResult, total: number): void {
  const failed = result.failed.length
  if (!failed) {
    toast.add({
      title: `Merged ${result.succeeded.length} of ${total}`,
      color: 'success',
      icon: 'i-lucide-git-merge'
    })
    return
  }
  const names = result.failed
    .map(({ item }) => `${item.repo.fullName}#${item.pull.number ?? item.pull.id}`)
    .join(' · ')
  const head = result.succeeded.length
    ? `Merged ${result.succeeded.length}, but ${failed} failed:`
    : `${failed} failed:`
  toast.add({
    title: 'Some updates could not be merged',
    description: `${head} ${names}`,
    color: 'warning',
    icon: 'i-lucide-circle-alert'
  })
}

async function onMergeAll(): Promise<void> {
  mergingGroup.value = true
  try {
    const result = await mergeGroup(props.group)
    reportResult(result, props.group.items.length)
  } finally {
    mergingGroup.value = false
  }
}

async function onMergeItem(item: DependencyPr): Promise<void> {
  const result = await mergeOne(item)
  reportResult(result, 1)
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default bg-default">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-elevated/40"
      :aria-expanded="open"
      @click="open = !open"
    >
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-md"
        :class="group.unparsable ? 'bg-elevated text-muted' : 'bg-primary/10 text-primary'"
      >
        <UIcon
          :name="group.unparsable ? 'i-lucide-loader-circle' : 'i-lucide-package-plus'"
          class="size-5"
        />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-highlighted">{{ group.name }}</p>
        <p class="text-xs text-muted">{{ subtitle }}</p>
      </div>
      <UBadge color="primary" variant="subtle" size="sm">
        {{ group.items.length }}
      </UBadge>
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-4 shrink-0 text-muted"
      />
    </button>

    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="overflow-hidden" :inert="!open || undefined" :aria-hidden="!open || undefined">
        <div class="border-t border-default">
          <ul class="divide-y divide-default">
            <li
              v-for="item in group.items"
              :key="`${item.repo.provider}:${item.repo.fullName}#${item.pull.number ?? item.pull.id}`"
              class="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <ForgeIcon :provider="item.repo.provider" class="size-3.5 shrink-0 text-muted" />
              <NuxtLink
                :href="item.pull.url || undefined"
                :target="item.pull.url ? '_blank' : undefined"
                class="min-w-0 flex-1 truncate text-default transition hover:text-primary"
              >
                {{ item.repo.fullName }}
                <span v-if="item.pull.number" class="text-muted">#{{ item.pull.number }}</span>
              </NuxtLink>
              <span
                v-if="item.pull.updatedAt"
                class="hidden shrink-0 text-xs text-muted sm:inline"
                >{{ formatRelativeTime(item.pull.updatedAt) }}</span
              >
              <UButton
                icon="i-lucide-git-merge"
                color="neutral"
                variant="soft"
                size="xs"
                label="Merge"
                :loading="isPending(item)"
                :disabled="mergingGroup || anyPending"
                @click="onMergeItem(item)"
              />
            </li>
          </ul>
          <div class="flex items-center justify-end gap-2 border-t border-default px-4 py-2.5">
            <UButton
              v-if="group.items.length > 1"
              :icon="group.unparsable ? 'i-lucide-git-merge' : 'i-lucide-check-check'"
              color="primary"
              variant="soft"
              size="xs"
              :label="group.unparsable ? 'Merge this PR' : 'Approve & merge all'"
              :loading="mergingGroup"
              :disabled="anyPending"
              @click="onMergeAll"
            />
            <UButton
              v-else
              :icon="group.unparsable ? 'i-lucide-git-merge' : 'i-lucide-check-check'"
              color="primary"
              variant="soft"
              size="xs"
              :label="group.unparsable ? 'Merge' : 'Approve & merge'"
              :loading="mergingGroup"
              :disabled="anyPending"
              @click="onMergeAll"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
