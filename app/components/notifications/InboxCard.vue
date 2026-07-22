<script setup lang="ts">
import type { ForgeInboxItem, ForgeNotificationKind } from '~/types/forge'

const props = withDefaults(defineProps<{ item: ForgeInboxItem, allowReply?: boolean }>(), {
  allowReply: true
})
const emit = defineEmits<{ replied: [] }>()

const { reply } = useNotifications()

const KIND_ICON: Record<ForgeNotificationKind, string> = {
  issue: 'i-lucide-circle-dot',
  pull: 'i-lucide-git-pull-request',
  discussion: 'i-lucide-messages-square',
  commit: 'i-lucide-git-commit-horizontal',
  release: 'i-lucide-tag',
  mention: 'i-lucide-at-sign',
  ci: 'i-lucide-play',
  other: 'i-lucide-bell'
}

const item = computed(() => props.item)
const repoTo = computed(() => item.value.repo ? repoPath({ provider: item.value.provider, owner: item.value.repo.owner, name: item.value.repo.name }) : undefined)
const hasState = computed(() => !!item.value.state && (item.value.kind === 'pull' || item.value.kind === 'issue'))
const canReply = computed(() =>
  props.allowReply && !!item.value.repo && !!item.value.number && (item.value.kind === 'pull' || item.value.kind === 'issue')
)

const replyOpen = ref(false)
const draft = ref('')
const posting = ref(false)

async function submitReply(): Promise<void> {
  if (!draft.value.trim()) return
  posting.value = true
  const ok = await reply(item.value, draft.value)
  posting.value = false
  if (ok) {
    draft.value = ''
    replyOpen.value = false
    emit('replied')
  }
}
</script>

<template>
  <article class="overflow-hidden rounded-lg border border-default bg-default">
    <div class="flex items-start gap-3 px-4 py-3">
      <div class="relative mt-0.5 shrink-0">
        <UIcon :name="KIND_ICON[item.kind]" class="size-4 text-muted" />
        <span
          v-if="item.unread"
          class="absolute -left-1.5 top-1 size-2 rounded-full bg-primary ring-2 ring-default"
        />
      </div>

      <div class="min-w-0 flex-1">
        <NuxtLink
          :to="item.to || undefined"
          :href="!item.to ? (item.url || undefined) : undefined"
          :target="!item.to ? '_blank' : undefined"
          class="block truncate font-medium text-highlighted hover:text-primary"
        >
          {{ item.title }}
          <span v-if="item.number" class="font-normal text-muted">#{{ item.number }}</span>
        </NuxtLink>

        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <StateBadge
            v-if="hasState"
            :state="item.state!"
            :kind="item.kind === 'pull' ? 'pull' : 'issue'"
            size="xs"
          />
          <NuxtLink v-if="item.repo && repoTo" :to="repoTo" class="inline-flex items-center gap-1 hover:text-primary">
            <ForgeIcon :provider="item.provider" class="size-3" />
            {{ item.repo.fullName }}
          </NuxtLink>
          <span v-if="item.author" class="inline-flex items-center gap-1">
            ·
            <UAvatar :src="item.author.avatarUrl ?? undefined" :alt="item.author.login" size="3xs" />
            {{ userLabel(item.author) }}
          </span>
          <span v-if="item.stat">·</span>
          <DiffStat
            v-if="item.stat"
            :additions="item.stat.additions"
            :deletions="item.stat.deletions"
            :files="item.stat.filesChanged"
          />
          <span v-if="item.updatedAt">· {{ formatRelativeTime(item.updatedAt) }}</span>
          <span v-if="item.reason" class="capitalize">· {{ item.reason.replace(/_/g, ' ') }}</span>
        </div>
      </div>

      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <!-- Unread comments -->
    <div v-if="item.unreadComments?.length" class="divide-y divide-default border-t border-default bg-elevated/30">
      <div v-for="c in item.unreadComments" :key="c.id" class="px-4 py-2.5">
        <div class="mb-1 flex items-center gap-2 text-xs text-muted">
          <UserLink :user="c.author" />
          <span v-if="c.createdAt">· {{ formatRelativeTime(c.createdAt) }}</span>
        </div>
        <MarkdownBody :content="c.body" empty="(empty comment)" />
      </div>
    </div>

    <!-- Inline reply -->
    <div v-if="canReply" class="border-t border-default px-4 py-2">
      <template v-if="replyOpen">
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
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            label="Cancel"
            :disabled="posting"
            @click="replyOpen = false"
          />
        </div>
      </template>
      <UButton
        v-else
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-reply"
        label="Reply"
        @click="replyOpen = true"
      />
    </div>
  </article>
</template>
