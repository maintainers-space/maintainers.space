<script setup lang="ts">
import { getForge } from '~/lib/forges'

const route = useRoute()
const provider = computed(() => String(route.params.provider))
const owner = computed(() => String(route.params.owner))

const forge = computed(() => getForge(provider.value))

const { data, pending, error, refresh } = useLiveAsyncData(
  () => `owner-repos:${provider.value}:${owner.value}`,
  async () => {
    const f = getForge(provider.value)
    if (!f?.listRepos) {
      throw createError({ statusCode: 404, statusMessage: `Unknown provider "${provider.value}"` })
    }
    return await f.listRepos(owner.value)
  },
  { lazy: true, watch: [provider, owner] }
)
</script>

<template>
  <UDashboardPanel :id="`owner-${provider}`">
    <template #header>
      <UDashboardNavbar :title="owner">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-4 py-2">
        <div class="flex items-center gap-2 text-sm text-muted">
          <ForgeIcon :provider="provider" class="size-4" />
          <span>{{ forge?.label ?? provider }}</span>
          <span>·</span>
          <span>{{ forge?.ownerLabel ?? 'Owner' }}</span>
        </div>

        <div v-if="pending" class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-20 w-full" />
        </div>

        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Could not load repositories"
          :description="
            error?.statusMessage || error?.message || `No repositories found for ${owner}.`
          "
        >
          <template #actions>
            <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
          </template>
        </UAlert>

        <div
          v-else-if="!data?.length"
          class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
        >
          No repositories found for {{ owner }}.
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <NuxtLink
            v-for="r in data"
            :key="r.fullName"
            :to="`/${provider}/${owner}/${r.name}`"
            class="group rounded-lg border border-default p-4 transition hover:border-primary hover:bg-elevated/40"
          >
            <div
              class="flex items-center gap-1.5 font-medium text-default group-hover:text-primary"
            >
              <UIcon name="i-lucide-book-marked" class="size-4 text-muted" />
              {{ r.name }}
            </div>
            <p v-if="r.description" class="mt-1 line-clamp-2 text-sm text-muted">
              {{ r.description }}
            </p>
            <div v-if="r.topics?.length" class="mt-2 flex flex-wrap gap-1">
              <UBadge
                v-for="t in r.topics.slice(0, 4)"
                :key="t"
                :label="t"
                color="primary"
                variant="subtle"
                size="sm"
                class="rounded-full"
              />
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
