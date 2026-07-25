<script setup lang="ts">
import type { ForgeContribution, ForgeEventKind } from '~/types/forge'

const props = withDefaults(
  defineProps<{ contribution: ForgeContribution; showActor?: boolean }>(),
  {
    showActor: false
  }
)

interface KindStyle {
  icon: string
  chip: string
  tone: string
}

// Icon + tinted chip (for the "Me" leading) and a plain text tone (for the small
// kind marker on the "Friends" feed). Static class strings so Tailwind keeps them.
const KIND_STYLE: Record<ForgeEventKind, KindStyle> = {
  push: {
    icon: 'i-lucide-git-commit-horizontal',
    chip: 'bg-elevated text-muted',
    tone: 'text-muted'
  },
  pr_opened: {
    icon: 'i-lucide-git-pull-request',
    chip: 'bg-success/10 text-success',
    tone: 'text-success'
  },
  pr_merged: {
    icon: 'i-lucide-git-merge',
    chip: 'bg-primary/10 text-primary',
    tone: 'text-primary'
  },
  pr_review: { icon: 'i-lucide-eye', chip: 'bg-info/10 text-info', tone: 'text-info' },
  issue_opened: {
    icon: 'i-lucide-circle-dot',
    chip: 'bg-success/10 text-success',
    tone: 'text-success'
  },
  issue_closed: {
    icon: 'i-lucide-circle-check',
    chip: 'bg-primary/10 text-primary',
    tone: 'text-primary'
  },
  comment: { icon: 'i-lucide-message-square', chip: 'bg-info/10 text-info', tone: 'text-info' },
  create: { icon: 'i-lucide-git-branch', chip: 'bg-warning/10 text-warning', tone: 'text-warning' },
  release: { icon: 'i-lucide-tag', chip: 'bg-warning/10 text-warning', tone: 'text-warning' },
  fork: { icon: 'i-lucide-git-fork', chip: 'bg-elevated text-muted', tone: 'text-muted' },
  star: { icon: 'i-lucide-star', chip: 'bg-warning/10 text-warning', tone: 'text-warning' },
  other: { icon: 'i-lucide-activity', chip: 'bg-elevated text-muted', tone: 'text-muted' }
}

const c = computed(() => props.contribution)
const style = computed(() => KIND_STYLE[c.value.kind])
const repoTo = computed(() =>
  repoPath({ provider: c.value.provider, owner: c.value.repo.owner, name: c.value.repo.name })
)
const actorTo = computed(() => userPath(c.value.actor))

// Action word; the subject (PR/issue/release/commit) follows as a deep link.
const verb = computed(() => {
  switch (c.value.kind) {
    case 'push':
      return 'pushed'
    case 'pr_opened':
      return 'opened'
    case 'pr_merged':
      return 'merged'
    case 'pr_review':
      return 'reviewed'
    case 'issue_opened':
      return 'opened'
    case 'issue_closed':
      return 'closed'
    case 'comment':
      return 'commented on'
    case 'create':
      return 'created'
    case 'release':
      return 'released'
    case 'fork':
      return 'forked'
    default:
      return 'was active in'
  }
})

// Subject text: the PR/issue title (+ number), commit message, tag… or the repo
// itself when the event has no more specific subject.
const subject = computed(() => {
  const x = c.value
  if (x.title) return x.number ? `#${x.number} ${x.title}` : x.title
  return x.repo.fullName
})
// Show the repo separately only when the subject isn't already the repo.
const showRepoMeta = computed(() => !!c.value.title)
// On the "Me" feed there's no actor prefix, so start the sentence capitalized.
const verbText = computed(() =>
  props.showActor ? verb.value : verb.value.charAt(0).toUpperCase() + verb.value.slice(1)
)
</script>

<template>
  <div class="flex items-start gap-3 px-3 py-3 sm:px-4">
    <!-- Friends: the person's avatar leads (minimalistic). Me: a tinted kind chip. -->
    <NuxtLink v-if="showActor" :to="actorTo" class="mt-0.5 shrink-0">
      <UAvatar
        :src="c.actor.avatarUrl ?? undefined"
        :alt="userLabel(c.actor)"
        size="md"
        class="ring-1 ring-default"
      />
    </NuxtLink>
    <div
      v-else
      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
      :class="style.chip"
    >
      <UIcon :name="style.icon" class="size-4" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-sm text-default">
        <NuxtLink
          v-if="showActor"
          :to="actorTo"
          class="font-medium text-highlighted hover:text-primary"
          >{{ userLabel(c.actor) }}</NuxtLink
        >
        <span class="text-muted">{{ showActor ? ' ' : '' }}{{ verbText }}&nbsp;</span>
        <NuxtLink
          :to="c.url ? c.url : repoTo"
          :target="c.url ? '_blank' : undefined"
          class="font-medium text-highlighted hover:text-primary"
          >{{ subject }}</NuxtLink
        >
      </p>
      <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <UIcon v-if="showActor" :name="style.icon" class="size-3.5 shrink-0" :class="style.tone" />
        <NuxtLink v-if="showRepoMeta" :to="repoTo" class="hover:text-primary">{{
          c.repo.fullName
        }}</NuxtLink>
        <span v-if="showRepoMeta && c.kind === 'push' && c.count">·</span>
        <span v-if="c.kind === 'push' && c.count"
          >{{ c.count }} commit{{ c.count === 1 ? '' : 's' }}</span
        >
        <span v-if="c.createdAt">· {{ formatRelativeTime(c.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>
