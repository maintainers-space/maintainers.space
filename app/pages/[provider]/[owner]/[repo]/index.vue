<script setup lang="ts">
import type { ForgeTreeEntry } from '~/types/forge'
import type { HealthFile } from '~/components/forge/RepoHealthFiles.vue'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator, meta, defaultBranch } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))

const HEALTH: Record<string, { order: number, label: string, icon: string }> = {
  readme: { order: 0, label: 'README', icon: 'i-lucide-book-open' },
  contributing: { order: 1, label: 'Contributing', icon: 'i-lucide-git-pull-request-arrow' },
  security: { order: 2, label: 'Security', icon: 'i-lucide-shield-check' },
  code_of_conduct: { order: 3, label: 'Code of conduct', icon: 'i-lucide-scale' },
  support: { order: 4, label: 'Support', icon: 'i-lucide-life-buoy' },
  license: { order: 5, label: 'License', icon: 'i-lucide-scroll-text' },
  changelog: { order: 6, label: 'Changelog', icon: 'i-lucide-history' }
}

function healthKey(fileName: string): string | null {
  const b = fileName.replace(/\.(md|markdown|mdown|rst|txt|adoc)$/i, '').toLowerCase().replace(/[\s-]+/g, '_')
  if (b === 'readme') return 'readme'
  if (b === 'contributing') return 'contributing'
  if (b === 'security') return 'security'
  if (b === 'code_of_conduct') return 'code_of_conduct'
  if (b === 'support' || b === 'governance') return 'support'
  if (b === 'license' || b === 'licence' || b === 'copying') return 'license'
  if (b === 'changelog' || b === 'changes' || b === 'history') return 'changelog'
  return null
}

const { data, pending, error, refresh } = useAsyncData(
  () => `repo-code:${provider.value}:${owner.value}:${name.value}`,
  async () => {
    const f = forge.value
    // Wait for the parent-provided meta so we browse the correct default branch
    // (and avoid a duplicate repo-meta request — the parent already fetched it).
    if (!f || !meta.value) return null
    const ref = defaultBranch.value

    let entries: ForgeTreeEntry[]
    if (f.getTree) entries = await f.getTree(locator.value, ref, '')
    else entries = (await f.getOverview(owner.value, name.value)).entries

    const candidates = [...entries]
    const dotgithub = entries.find(e => e.type === 'dir' && e.name.toLowerCase() === '.github')
    if (dotgithub && f.getTree) {
      try {
        candidates.push(...await f.getTree(locator.value, ref, dotgithub.path))
      } catch { /* health files in .github are best-effort */ }
    }

    const seen = new Set<string>()
    const health: HealthFile[] = []
    for (const e of candidates) {
      if (e.type !== 'file') continue
      const key = healthKey(e.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      health.push({ key, label: HEALTH[key]!.label, icon: HEALTH[key]!.icon, name: e.name, path: e.path })
    }
    health.sort((a, b) => HEALTH[a.key]!.order - HEALTH[b.key]!.order)

    return { entries, health }
  },
  { lazy: true, watch: [provider, owner, name, meta, defaultBranch] }
)

async function loadDoc(path: string): Promise<string> {
  const f = forge.value
  if (!f?.getBlob) return ''
  const blob = await f.getBlob(locator.value, defaultBranch.value, path)
  return blob.isBinary ? '' : blob.content
}
</script>

<template>
  <div class="grid gap-6">
    <div v-if="(pending || !meta) && !data" class="space-y-4">
      <USkeleton class="h-64 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load files"
      :description="(error as { message?: string })?.message || 'GitHub may be rate-limiting anonymous requests. Add an access token in settings to raise the limit.'"
    >
      <template #actions>
        <UButton
          color="error"
          variant="soft"
          label="Retry"
          @click="refresh()"
        />
      </template>
    </UAlert>

    <template v-else-if="data">
      <div class="flex items-center justify-end">
        <UButton
          :to="`${base}/commits`"
          icon="i-lucide-history"
          size="xs"
          color="neutral"
          variant="subtle"
          label="Commits"
        />
      </div>
      <ForgeRepoBrowser
        :entries="data.entries"
        :base="base"
        :git-ref="defaultBranch"
      />
      <ForgeRepoHealthFiles v-if="data.health.length" :files="data.health" :load="loadDoc" />
    </template>
  </div>
</template>
