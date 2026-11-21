<script setup lang="ts">
// Sets up a forge owner's Community: proves the viewer may speak for the owner, creates the
// community on Colibri (or on the viewer's own PDS), lays out the suggested channels and writes
// the link that lets everyone else find it.
import type { ResolvedCommunity } from '~/lib/community/discovery'
import { forgeLabel, type ForgeOwner } from '~/lib/community/link'
import type { CommunityPlan } from '~/lib/community/structure'
import { createCommunity, syncCommunity, type SyncProgress } from '~/lib/community/sync'

const props = defineProps<{
  forge: ForgeOwner
  plan: CommunityPlan | null
  planPending: boolean
}>()

const emit = defineEmits<{ created: [community: ResolvedCommunity] }>()

const { did } = useAuth()
const { prove } = useCommunityProof()

const name = ref(props.forge.owner.slice(0, 64))
const description = ref('')
const openToAll = ref(true)
const hosting = ref<'colibri' | 'own'>('colibri')
const ownPds = reactive({ identifier: '', password: '', pds: '' })

const busy = ref(false)
const step = ref('')
const progress = ref<SyncProgress | null>(null)
const failure = ref<string | null>(null)

const forgeName = computed(() => forgeLabel(props.forge.provider))
const hostingItems = [
  {
    description: 'Colibri hosts the community account. There is nothing for you to run.',
    label: 'Colibri',
    value: 'colibri'
  },
  {
    description:
      'The community account lives on a PDS you run. Create an account for it there first.',
    label: 'My own PDS',
    value: 'own'
  }
]

const canSubmit = computed(
  () =>
    !!name.value.trim() &&
    !!props.plan &&
    (hosting.value === 'colibri' || (!!ownPds.pds && !!ownPds.identifier && !!ownPds.password))
)

const percent = computed(() =>
  progress.value && progress.value.total ? (progress.value.done / progress.value.total) * 100 : 0
)

async function create(): Promise<void> {
  const viewer = did.value
  if (!props.plan || !viewer) return
  busy.value = true
  failure.value = null
  progress.value = null
  let created: Awaited<ReturnType<typeof createCommunity>> | undefined
  let linked: Awaited<ReturnType<typeof writeCommunityLink>> | undefined
  try {
    step.value = `Checking that you can speak for ${props.forge.owner}…`
    const proof = await prove(props.forge)

    step.value = 'Creating the community…'
    created = await createCommunity({
      description: description.value.trim() || undefined,
      name: name.value.trim(),
      ownPds: hosting.value === 'own' ? { ...ownPds } : undefined,
      requiresApprovalToJoin: !openToAll.value
    })

    step.value = `Linking it to ${props.forge.owner}…`
    linked = await writeCommunityLink(props.forge, created.uri, proof)

    step.value = 'Laying out channels…'
    await syncCommunity(created.uri, created.data, props.plan, (p) => {
      progress.value = p
      step.value = p.label ? `Adding ${p.label}…` : 'Done'
    })
    emit('created', { data: created.data, did: viewer, ...linked })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (linked && created) {
      // The community works and can be found; a sync from its page adds what is missing.
      emit('created', { data: created.data, did: viewer, ...linked })
    } else {
      failure.value = created
        ? `The community was created, but linking it to ${props.forge.owner} failed: ${message}`
        : message
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <form class="space-y-5" @submit.prevent="create">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">Set up a Community</h2>
        <p class="mt-1 text-sm text-muted">
          One place to talk with everyone around {{ forge.owner }}: announcements, support, a
          channel for every repository and one for each team. It lives on atproto and stays in sync
          with {{ forgeName }}.
        </p>
      </div>

      <UFormField label="Name" required>
        <UInput v-model="name" :maxlength="64" class="w-full" :disabled="busy" />
      </UFormField>

      <UFormField label="Description" hint="Optional">
        <UTextarea
          v-model="description"
          :maxlength="300"
          :rows="2"
          autoresize
          class="w-full"
          :disabled="busy"
        />
      </UFormField>

      <USwitch
        v-model="openToAll"
        label="Anyone can join"
        description="Turn this off to approve every member yourself."
        :disabled="busy"
      />

      <UFormField label="Hosting">
        <URadioGroup
          v-model="hosting"
          :items="hostingItems"
          variant="card"
          :disabled="busy"
          :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2' }"
        />
      </UFormField>

      <div v-if="hosting === 'own'" class="grid gap-3 sm:grid-cols-3">
        <UFormField label="PDS URL" required>
          <UInput
            v-model="ownPds.pds"
            type="url"
            placeholder="https://pds.example.com"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>
        <UFormField label="Handle or DID" required>
          <UInput
            v-model="ownPds.identifier"
            placeholder="community.example.com"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>
        <UFormField label="App password" required>
          <UInput
            v-model="ownPds.password"
            type="password"
            autocomplete="off"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>
        <p class="text-xs text-dimmed sm:col-span-3">
          The password goes to Colibri, which signs in as the community account to manage it.
          maintainers.space never stores it.
        </p>
      </div>

      <div v-if="busy" class="space-y-2" aria-live="polite">
        <p class="text-sm text-muted">{{ step }}</p>
        <UProgress :model-value="progress ? percent : null" size="sm" />
      </div>

      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Could not set up the Community"
        :description="failure"
      />

      <UButton
        type="submit"
        label="Create Community"
        icon="i-lucide-sparkles"
        :loading="busy"
        :disabled="!canSubmit"
      />
    </form>

    <aside class="rounded-lg border border-default p-4">
      <h3 class="text-sm font-medium text-highlighted">Channels</h3>
      <p class="mt-1 text-xs text-muted">
        A starting point. You can rename, move and remove anything afterwards.
      </p>
      <div class="mt-4">
        <div v-if="planPending" class="space-y-2">
          <USkeleton v-for="i in 6" :key="i" class="h-5 w-full" />
        </div>
        <CommunityLayoutPreview v-else-if="plan" :plan="plan" />
      </div>
    </aside>
  </div>
</template>
