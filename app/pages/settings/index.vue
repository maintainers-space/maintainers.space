<script setup lang="ts">
const { profile, did } = useAuth()
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <UAvatar
        :src="profile?.avatar"
        :alt="profile?.handle"
        icon="i-lucide-user"
        size="xl"
      />
      <div class="min-w-0">
        <h2 class="truncate text-lg font-semibold text-highlighted">
          {{ profile?.displayName || profile?.handle }}
        </h2>
        <p class="truncate text-sm text-muted">
          @{{ profile?.handle }}
        </p>
      </div>
    </div>

    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold text-highlighted">
            Identity
          </h3>
          <p class="text-sm text-muted">
            Your AT Protocol account details.
          </p>
        </div>
      </template>

      <div class="space-y-3 text-sm">
        <div class="flex items-center justify-between gap-4">
          <span class="text-muted">Handle</span>
          <span class="font-medium text-default">{{ profile?.handle }}</span>
        </div>
        <USeparator />
        <div class="flex items-start justify-between gap-4">
          <span class="text-muted">DID</span>
          <span class="break-all text-right font-mono text-xs text-default">{{ did }}</span>
        </div>
      </div>
    </UCard>
  </div>
</template>
