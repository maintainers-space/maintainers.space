<script setup lang="ts">
import type { ForgeRepo } from '~/types/forge'
import type { RepoMetadataTarget } from '~/composables/useRepoMetadata'
import { detectService, linkLabel, serviceDef, type CommunityLink } from '~/lib/repo-metadata'

const props = defineProps<{ repo: ForgeRepo }>()

const target = computed<RepoMetadataTarget | null>(() => ({
  provider: props.repo.provider,
  owner: props.repo.owner,
  name: props.repo.name,
  repoDid: typeof props.repo.ref?.repoDid === 'string' ? props.repo.ref.repoDid : undefined,
  ownerDid: typeof props.repo.ref?.ownerDid === 'string' ? props.repo.ref.ownerDid : undefined
}))

const { links, refresh } = useRepoMetadata(target)
const {
  own,
  canManage,
  isClaimed,
  save: saveLinks,
  remove: removeRecord
} = useRepoMetadataEditor(target)
const { accounts, loaded: accountsLoaded, refresh: refreshAccounts } = useForgeAccounts()
const toast = useToast()

onMounted(() => {
  if (!accountsLoaded.value) void refreshAccounts()
})

// Only surface management to people who could plausibly own the repo: those who
// have connected the same provider, or who already claimed it. The server still
// enforces admin access before signing an attestation.
const showManage = computed(
  () =>
    canManage.value &&
    (isClaimed.value ||
      props.repo.provider === 'tangled' ||
      accounts.value.some((a) => a.provider === props.repo.provider))
)

const displayLinks = computed<CommunityLink[]>(() => {
  const seen = new Set<string>()
  const out: CommunityLink[] = []
  const push = (list?: CommunityLink[]) => {
    for (const link of list ?? []) {
      const key = link.url.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(link)
    }
  }
  push(links.value)
  push(own.value?.links)
  return out
})

const needsClaim = computed(() => props.repo.provider !== 'tangled' && !isClaimed.value)

interface DraftRow {
  url: string
  label: string
}

const open = ref(false)
const busy = ref(false)
const draft = ref<DraftRow[]>([])

function openManager(): void {
  draft.value = (own.value?.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '' }))
  if (!draft.value.length) draft.value = [{ url: '', label: '' }]
  open.value = true
}

function addRow(): void {
  draft.value.push({ url: '', label: '' })
}

function removeRow(index: number): void {
  draft.value.splice(index, 1)
}

function draftToLinks(): CommunityLink[] {
  return draft.value
    .map((row) => ({ url: row.url.trim(), label: row.label.trim() }))
    .filter((row) => row.url)
    .map((row) =>
      row.label
        ? { service: detectService(row.url), url: row.url, label: row.label }
        : { service: detectService(row.url), url: row.url }
    )
}

async function save(): Promise<void> {
  busy.value = true
  try {
    const result = await saveLinks(draftToLinks())
    if (result.claiming) return
    open.value = false
    await refresh()
    toast.add({ title: 'Community links saved', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({
      title: 'Could not save community links',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    busy.value = false
  }
}

async function removeAll(): Promise<void> {
  busy.value = true
  try {
    await removeRecord()
    open.value = false
    await refresh()
    toast.add({ title: 'Community links removed', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({
      title: 'Could not remove community links',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="displayLinks.length || showManage" class="flex flex-wrap items-center gap-1.5">
    <UButton
      v-for="link in displayLinks"
      :key="link.url"
      :to="link.url"
      target="_blank"
      rel="noopener noreferrer"
      :icon="serviceDef(link.service).icon"
      :label="linkLabel(link)"
      color="neutral"
      variant="subtle"
      size="xs"
      class="rounded-full"
    />

    <UButton
      v-if="showManage"
      :icon="displayLinks.length ? 'i-lucide-pencil' : 'i-lucide-plus'"
      :label="displayLinks.length ? 'Manage' : 'Add community links'"
      color="neutral"
      variant="ghost"
      size="xs"
      @click="openManager"
    />

    <UModal v-model:open="open" title="Community links" :description="`${repo.owner}/${repo.name}`">
      <template #body>
        <div class="space-y-3">
          <p v-if="needsClaim" class="text-sm text-muted">
            Saving verifies your admin access on {{ repo.provider }} with a quick sign-in, then
            publishes the links to your atproto identity so anyone can see them here.
          </p>

          <div v-for="(row, index) in draft" :key="index" class="flex items-start gap-2">
            <UIcon
              :name="serviceDef(detectService(row.url)).icon"
              class="mt-2.5 size-4 shrink-0 text-muted"
            />
            <div class="grid flex-1 gap-2 sm:grid-cols-2">
              <UInput v-model="row.url" placeholder="https://discord.gg/…" icon="i-lucide-link" />
              <UInput v-model="row.label" placeholder="Label (optional)" />
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="removeRow(index)"
            />
          </div>

          <UButton
            icon="i-lucide-plus"
            label="Add link"
            color="neutral"
            variant="subtle"
            size="xs"
            @click="addRow"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center gap-2">
          <UButton
            v-if="isClaimed"
            label="Remove all"
            color="error"
            variant="ghost"
            :loading="busy"
            @click="removeAll"
          />
          <div class="ml-auto flex gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
            <UButton
              :label="needsClaim ? 'Verify & save' : 'Save'"
              color="primary"
              :loading="busy"
              @click="save"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
