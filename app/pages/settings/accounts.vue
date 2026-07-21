<script setup lang="ts">
import type { ForgeAccount } from '~/composables/useForgeAccounts'

const { accounts, pending, loaded, refresh, unlink } = useForgeAccounts()
const toast = useToast()

const showLink = ref(false)

onMounted(() => {
  if (!loaded.value) refresh()
})

async function onUnlink(account: ForgeAccount) {
  try {
    await unlink(account.rkey)
    toast.add({ title: 'Account unlinked', color: 'success' })
  } catch (error) {
    toast.add({
      title: 'Could not unlink account',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="font-semibold text-highlighted">
          Linked accounts
        </h2>
        <p class="text-sm text-muted">
          Forge accounts connected to your atproto identity.
        </p>
      </div>
      <UButton icon="i-lucide-plus" label="Link account" @click="showLink = true" />
    </div>

    <div v-if="pending && !accounts.length" class="space-y-2">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <div v-else-if="!accounts.length" class="rounded-lg border border-dashed border-default p-8 text-center">
      <UIcon name="i-lucide-link-2-off" class="mx-auto size-8 text-muted" />
      <p class="mt-2 text-sm text-muted">
        No linked accounts yet.
      </p>
      <UButton
        class="mt-3"
        icon="i-lucide-plus"
        label="Link your first account"
        @click="showLink = true"
      />
    </div>

    <div v-else class="space-y-2">
      <AccountLinkedAccountCard
        v-for="account in accounts"
        :key="account.uri"
        :account="account"
        @unlink="onUnlink"
      />
    </div>

    <AccountLinkAccountModal v-model:open="showLink" />
  </div>
</template>
