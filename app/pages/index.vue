<script setup lang="ts">
import { forgeList, getForge } from '~/lib/forges'

const provider = ref('github')
const owner = ref('')
const repo = ref('')

const providerItems = forgeList.map(f => ({ label: f.label, value: f.id, icon: f.icon }))
const current = computed(() => getForge(provider.value))

function go() {
  const o = owner.value.trim()
  const r = repo.value.trim()
  if (!o || !r) return
  navigateTo(`/${provider.value}/${encodeURIComponent(o)}/${encodeURIComponent(r)}`)
}

const examples = [
  { provider: 'github', owner: 'nuxt', repo: 'nuxt', description: 'The Nuxt web framework' },
  { provider: 'github', owner: 'vuejs', repo: 'core', description: 'Vue.js core' },
  { provider: 'tangled', owner: 'tangled.org', repo: 'core', description: 'Tangled core' }
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-10 py-6">
        <div class="space-y-3 text-center">
          <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
            One place for every forge.
          </h1>
          <p class="text-muted">
            Browse repositories across GitHub and Tangled — and link your forge accounts to your atproto identity.
          </p>
        </div>

        <UCard>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <UFormField label="Provider" class="sm:w-40">
              <USelect
                v-model="provider"
                :items="providerItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="current?.ownerLabel ?? 'Owner'" class="flex-1">
              <UInput
                v-model="owner"
                :placeholder="current?.ownerPlaceholder"
                class="w-full"
                @keydown.enter="go"
              />
            </UFormField>
            <UFormField label="Repository" class="flex-1">
              <UInput
                v-model="repo"
                :placeholder="current?.repoPlaceholder"
                class="w-full"
                @keydown.enter="go"
              />
            </UFormField>
            <UButton
              label="View"
              icon="i-lucide-arrow-right"
              class="justify-center"
              :disabled="!owner.trim() || !repo.trim()"
              @click="go"
            />
          </div>
        </UCard>

        <div class="space-y-3">
          <h2 class="text-sm font-medium text-muted">
            Try an example
          </h2>
          <div class="grid gap-3 sm:grid-cols-3">
            <NuxtLink
              v-for="ex in examples"
              :key="`${ex.provider}/${ex.owner}/${ex.repo}`"
              :to="`/${ex.provider}/${ex.owner}/${ex.repo}`"
              class="group rounded-lg border border-default p-4 transition hover:border-primary hover:bg-elevated/40"
            >
              <div class="flex items-center gap-2 text-sm text-muted">
                <ForgeIcon :provider="ex.provider" class="size-4" />{{ ex.provider }}
              </div>
              <div class="mt-1 font-medium text-default group-hover:text-primary">{{ ex.owner }}/{{ ex.repo }}</div>
              <p class="mt-1 text-sm text-muted">{{ ex.description }}</p>
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
