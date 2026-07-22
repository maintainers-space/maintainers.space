<script setup lang="ts">
import type { ForgeInboxItem, ForgeNotificationKind } from '~/types/forge'

const props = withDefaults(defineProps<{ item: ForgeInboxItem, allowReply?: boolean, allowMarkRead?: boolean }>(), {
  allowReply: true,
  allowMarkRead: true
})
const emit = defineEmits<{ replied: [] }>()

const { reply, markRead } = useNotifications()

interface KindStyle { icon: string, chip: string }

// Base icon + accent per kind. Colors are full, static class strings so Tailwind
// keeps them in the build. An open PR now reads green instead of the grey that
// always looked like a draft.
const KIND_STYLE: Record<ForgeNotificationKind, KindStyle> = {
  pull: { icon: 'i-lucide-git-pull-request', chip: 'bg-success/10 text-success' },
  issue: { icon: 'i-lucide-circle-dot', chip: 'bg-success/10 text-success' },
  discussion: { icon: 'i-lucide-messages-square', chip: 'bg-info/10 text-info' },
  commit: { icon: 'i-lucide-git-commit-horizontal', chip: 'bg-elevated text-muted' },
  release: { icon: 'i-lucide-tag', chip: 'bg-warning/10 text-warning' },
  mention: { icon: 'i-lucide-at-sign', chip: 'bg-primary/10 text-primary' },
  ci: { icon: 'i-lucide-circle-x', chip: 'bg-error/10 text-error' },
  other: { icon: 'i-lucide-bell', chip: 'bg-elevated text-muted' }
}

const item = computed(() => props.item)
const style = computed<KindStyle>(() => {
  if (item.value.kind === 'pull' && item.value.state === 'draft') {
    return { icon: 'i-lucide-git-pull-request-draft', chip: 'bg-elevated text-muted' }
  }
  return KIND_STYLE[item.value.kind]
})

const repoTo = computed(() => item.value.repo ? repoPath({ provider: item.value.provider, owner: item.value.repo.owner, name: item.value.repo.name }) : undefined)
const commentCount = computed(() => item.value.unreadComments?.length ?? 0)

// Deterministic: only surface a "reason" chip when someone actually wants YOU —
// hide low-signal reasons like "subscribed" or "manual".
const REASON_LABELS: Record<string, string> = {
  review_requested: 'Review requested',
  mention: 'Mentioned',
  team_mention: 'Team mentioned',
  assign: 'Assigned',
  author: 'Your thread'
}
const reasonLabel = computed(() => (item.value.reason ? REASON_LABELS[item.value.reason] : undefined))

const canReply = computed(() =>
  props.allowReply && !!item.value.repo && !!item.value.number && (item.value.kind === 'pull' || item.value.kind === 'issue')
)
const expandable = computed(() => commentCount.value > 0 || canReply.value)

const open = ref(false)
function toggle(): void {
  if (expandable.value) open.value = !open.value
}

const draft = ref('')
const posting = ref(false)

async function submitReply(): Promise<void> {
  if (!draft.value.trim()) return
  posting.value = true
  const ok = await reply(item.value, draft.value)
  posting.value = false
  if (ok) {
    draft.value = ''
    emit('replied')
  }
}
</script>

<template>
  <article class="overflow-hidden rounded-lg border border-default bg-default">
    <div
      class="flex items-start gap-3 px-3 py-3 sm:px-4"
      :class="expandable ? 'cursor-pointer transition hover:bg-elevated/40' : ''"
      @click="toggle"
    >
      <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full" :class="style.chip">
        <UIcon :name="style.icon" class="size-4" />
      </div>

      <div class="min-w-0 flex-1">
        <NuxtLink
          :to="item.to || undefined"
          :href="!item.to ? (item.url || undefined) : undefined"
          :target="!item.to ? '_blank' : undefined"
          class="block truncate font-medium text-highlighted hover:text-primary"
          @click.stop
        >
          {{ item.title }}
          <span v-if="item.number" class="font-normal text-muted">#{{ item.number }}</span>
        </NuxtLink>

        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <NuxtLink
            v-if="item.repo && repoTo"
            :to="repoTo"
            class="inline-flex items-center gap-1 hover:text-primary"
            @click.stop
          >
            <ForgeIcon :provider="item.provider" class="size-3" />
            {{ item.repo.fullName }}
          </NuxtLink>
          <span v-if="item.author" class="inline-flex items-center gap-1">
            ·
            <UAvatar :src="item.author.avatarUrl ?? undefined" :alt="item.author.login" size="3xs" />
            {{ userLabel(item.author) }}
          </span>
          <span v-if="item.updatedAt">· {{ formatRelativeTime(item.updatedAt) }}</span>
          <template v-if="item.stat">
            <span>·</span>
            <DiffStat
              :additions="item.stat.additions"
              :deletions="item.stat.deletions"
              :files="item.stat.filesChanged"
              :show-files="false"
            />
          </template>
          <UBadge
            v-if="reasonLabel"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ reasonLabel }}
          </UBadge>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5" @click.stop>
        <span v-if="commentCount" class="inline-flex items-center gap-1 text-xs font-medium text-muted">
          <UIcon name="i-lucide-message-square" class="size-3.5" />
          {{ commentCount }}
        </span>
        <slot name="actions" />
        <UButton
          v-if="allowMarkRead"
          icon="i-lucide-check"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Mark as read"
          @click="markRead(item)"
        />
        <UButton
          v-if="expandable"
          :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="open ? 'Collapse' : 'Expand'"
          @click="toggle"
        />
      </div>
    </div>

    <!-- Expandable detail: recent unread conversation + inline reply -->
    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="overflow-hidden">
        <div v-if="item.unreadComments?.length" class="divide-y divide-default border-t border-default bg-elevated/30">
          <div v-for="c in item.unreadComments" :key="c.id" class="px-4 py-2.5">
            <div class="mb-1 flex items-center gap-2 text-xs text-muted">
              <UserLink :user="c.author" />
              <span v-if="c.createdAt">· {{ formatRelativeTime(c.createdAt) }}</span>
            </div>
            <MarkdownBody :content="c.body" empty="(empty comment)" />
          </div>
        </div>

        <div v-if="canReply" class="border-t border-default px-4 py-3">
          <MarkdownEditor
            v-model="draft"
            :rows="3"
            placeholder="Write a reply…"
            @submit="submitReply"
          />
          <div class="mt-2 flex items-center gap-2">
            <UButton
              size="xs"
              icon="i-lucide-send"
              label="Reply"
              :loading="posting"
              :disabled="!draft.trim()"
              @click="submitReply"
            />
            <NuxtLink
              v-if="item.to"
              :to="item.to"
              class="text-xs text-muted hover:text-primary"
            >
              Open conversation →
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
