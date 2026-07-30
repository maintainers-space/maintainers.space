<script setup lang="ts">
import type { ForgeContribution, ForgeEventKind } from '~/types/forge'
import { totalCommitCount, type TimelineEntry } from '~/lib/timeline-aggregate'

const props = withDefaults(defineProps<{ entry: TimelineEntry; showActor?: boolean }>(), {
  showActor: false
})

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

const VERB: Record<ForgeEventKind, string> = {
  push: 'pushed',
  pr_opened: 'opened',
  pr_merged: 'merged',
  pr_review: 'reviewed',
  issue_opened: 'opened',
  issue_closed: 'closed',
  comment: 'commented on',
  create: 'created',
  release: 'published',
  fork: 'forked',
  star: 'starred',
  other: 'was active in'
}

const e = computed(() => props.entry)
const primary = computed(() => e.value.primary)
const style = computed(() => KIND_STYLE[primary.value.kind])
const repoTo = computed(() => repoPath({ provider: e.value.provider, ...e.value.repo }))
const actorTo = computed(() => userPath(e.value.actor))
const isPush = computed(() => primary.value.kind === 'push')
const commitCount = computed(() => totalCommitCount(e.value))

// The subject link text: PR/issue title, release/branch name, ... Never the
// bare repo slug pretending to be a title — when there's nothing more
// specific, the sentence just ends at the repo mention in the meta line.
const subject = computed(() => {
  const x = primary.value
  if (!x.title) return null
  return x.number ? `#${x.number} ${x.title}` : x.title
})
const verb = computed(() => VERB[primary.value.kind])
// On the "Me" feed there's no actor prefix, so start the sentence capitalized.
const verbText = computed(() =>
  props.showActor ? verb.value : verb.value.charAt(0).toUpperCase() + verb.value.slice(1)
)

const commits = computed(() => e.value.events.flatMap((ev) => ev.commits ?? []))

// Expandable when there's more than the headline to show: a burst of pushes
// with known commits, or a PR/issue lifecycle (or push burst) with more than
// one folded event. A lone push with no per-commit data has nothing to expand into.
const hasCommitDetails = computed(() => isPush.value && commits.value.length > 0)
const hasSubEvents = computed(() => e.value.events.length > 1)
const expandable = computed(() => hasCommitDetails.value || hasSubEvents.value)
const expanded = ref(false)

const MAX_COMMITS_SHOWN = 10
const shownCommits = computed(() => commits.value.slice(0, MAX_COMMITS_SHOWN))
const hiddenCommitCount = computed(() =>
  Math.max(0, commits.value.length - shownCommits.value.length)
)

function subEventLabel(ev: ForgeContribution): string {
  return VERB[ev.kind].charAt(0).toUpperCase() + VERB[ev.kind].slice(1)
}
</script>

<template>
  <div class="flex items-start gap-3 px-3 py-3 sm:px-4">
    <!-- Friends: the person's avatar leads (minimalistic). Me: a tinted kind chip. -->
    <NuxtLink v-if="showActor" :to="actorTo" class="mt-0.5 shrink-0">
      <UAvatar
        :src="e.actor.avatarUrl ?? undefined"
        :alt="userLabel(e.actor)"
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
          >{{ userLabel(e.actor) }}</NuxtLink
        >
        <span class="text-muted">{{ showActor ? ' ' : '' }}{{ verbText }}&nbsp;</span>
        <template v-if="isPush">
          <template v-if="commitCount > 0">
            <span class="font-medium text-highlighted"
              >{{ commitCount }} commit{{ commitCount === 1 ? '' : 's' }}</span
            >
            <span class="text-muted">&nbsp;to&nbsp;</span>
          </template>
          <NuxtLink :to="repoTo" class="font-medium text-highlighted hover:text-primary">{{
            e.repo.fullName
          }}</NuxtLink>
        </template>
        <NuxtLink
          v-else-if="subject"
          :to="primary.url ? primary.url : repoTo"
          :target="primary.url ? '_blank' : undefined"
          class="font-medium text-highlighted hover:text-primary"
          >{{ subject }}</NuxtLink
        >
        <NuxtLink v-else :to="repoTo" class="font-medium text-highlighted hover:text-primary">{{
          e.repo.fullName
        }}</NuxtLink>
      </p>
      <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <UIcon v-if="showActor" :name="style.icon" class="size-3.5 shrink-0" :class="style.tone" />
        <NuxtLink v-if="!isPush && subject" :to="repoTo" class="hover:text-primary">{{
          e.repo.fullName
        }}</NuxtLink>
        <span v-if="e.createdAt">· {{ formatRelativeTime(e.createdAt) }}</span>
        <button
          v-if="expandable"
          type="button"
          class="inline-flex items-center gap-0.5 hover:text-primary"
          @click="expanded = !expanded"
        >
          · {{ expanded ? 'Hide details' : 'Show details' }}
          <UIcon
            name="i-lucide-chevron-down"
            class="size-3 transition-transform"
            :class="{ 'rotate-180': expanded }"
          />
        </button>
      </div>

      <div v-if="expandable && expanded" class="mt-2 space-y-2 border-l border-default pl-3">
        <ul v-if="hasCommitDetails" class="space-y-1">
          <li
            v-for="(c, i) in shownCommits"
            :key="c.sha ?? i"
            class="flex items-baseline gap-1.5 text-xs"
          >
            <span v-if="c.sha" class="shrink-0 font-mono text-muted">{{ c.sha.slice(0, 7) }}</span>
            <NuxtLink
              v-if="c.url"
              :to="c.url"
              target="_blank"
              class="min-w-0 truncate text-default hover:text-primary"
              >{{ c.message }}</NuxtLink
            >
            <span v-else class="min-w-0 truncate text-default">{{ c.message }}</span>
          </li>
          <li v-if="hiddenCommitCount" class="text-xs text-muted">
            +{{ hiddenCommitCount }} more commit{{ hiddenCommitCount === 1 ? '' : 's' }}
          </li>
        </ul>

        <ul v-if="hasSubEvents" class="space-y-1">
          <li
            v-for="ev in e.events"
            :key="ev.id"
            class="flex items-baseline gap-1.5 text-xs text-muted"
          >
            <span class="text-default">{{ subEventLabel(ev) }}</span>
            <NuxtLink v-if="ev.url" :to="ev.url" target="_blank" class="hover:text-primary"
              >view</NuxtLink
            >
            <span>· {{ formatRelativeTime(ev.createdAt) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
