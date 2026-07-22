<script setup lang="ts">
import type { ForgeContribution, ForgeEventKind } from '~/types/forge'

const props = withDefaults(defineProps<{ contribution: ForgeContribution, showActor?: boolean }>(), {
  showActor: false
})

const ICON: Record<ForgeEventKind, string> = {
  push: 'i-lucide-git-commit-horizontal',
  pr_opened: 'i-lucide-git-pull-request',
  pr_merged: 'i-lucide-git-merge',
  pr_review: 'i-lucide-eye',
  issue_opened: 'i-lucide-circle-dot',
  issue_closed: 'i-lucide-circle-check',
  comment: 'i-lucide-message-square',
  create: 'i-lucide-git-branch',
  release: 'i-lucide-tag',
  fork: 'i-lucide-git-fork',
  star: 'i-lucide-star',
  other: 'i-lucide-activity'
}

const c = computed(() => props.contribution)

const repoTo = computed(() => repoPath({ provider: c.value.provider, owner: c.value.repo.owner, name: c.value.repo.name }))
const actorTo = computed(() => userPath(c.value.actor))

const verb = computed(() => {
  const x = c.value
  switch (x.kind) {
    case 'push': return x.count ? `pushed ${x.count} commit${x.count === 1 ? '' : 's'} to` : 'pushed to'
    case 'pr_opened': return 'opened a pull request in'
    case 'pr_merged': return 'merged a pull request in'
    case 'pr_review': return 'reviewed a pull request in'
    case 'issue_opened': return 'opened an issue in'
    case 'issue_closed': return 'closed an issue in'
    case 'comment': return 'commented in'
    case 'create': return `created ${x.refType ?? 'something'} in`
    case 'release': return 'published a release in'
    case 'fork': return 'forked'
    default: return 'was active in'
  }
})

const numbered = computed(() => {
  const x = c.value
  if (!x.title) return null
  return x.number ? `#${x.number} ${x.title}` : x.title
})
</script>

<template>
  <div class="flex items-start gap-3 px-4 py-3">
    <UAvatar
      v-if="showActor"
      :src="c.actor.avatarUrl ?? undefined"
      :alt="c.actor.login"
      icon="i-lucide-user"
      size="xs"
      class="mt-0.5 shrink-0"
    />
    <UIcon v-else :name="ICON[c.kind]" class="mt-1 size-4 shrink-0 text-muted" />

    <div class="min-w-0 flex-1">
      <p class="text-sm text-default">
        <NuxtLink
          v-if="showActor"
          :to="actorTo"
          class="font-medium hover:text-primary"
        >{{ userLabel(c.actor) }}</NuxtLink>
        <span class="text-muted">{{ showActor ? ' ' : '' }}{{ verb }} </span>
        <NuxtLink
          v-if="numbered && c.url"
          :to="c.url"
          target="_blank"
          class="font-medium text-highlighted hover:text-primary"
        >{{ numbered }}</NuxtLink>
        <NuxtLink
          v-else
          :to="repoTo"
          class="font-medium text-highlighted hover:text-primary"
        >{{ c.repo.fullName }}</NuxtLink>
      </p>
      <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <UIcon v-if="showActor" :name="ICON[c.kind]" class="size-3.5" />
        <NuxtLink :to="repoTo" class="hover:text-primary">{{ c.repo.fullName }}</NuxtLink>
        <span v-if="c.createdAt">· {{ formatRelativeTime(c.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>
