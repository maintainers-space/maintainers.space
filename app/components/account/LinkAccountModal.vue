<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { forgeList } from '~/lib/forges'

const open = defineModel<boolean>('open', { default: false })

const { link } = useForgeAccounts()
const toast = useToast()

const providerItems = forgeList.map(f => ({ label: f.label, value: f.id, icon: f.icon }))

const schema = z.object({
  provider: z.string().min(1, 'Select a provider'),
  username: z.string().min(1, 'Enter a username'),
  host: z.string().optional()
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ provider: 'github', username: '', host: '' })
const loading = ref(false)

watch(open, (value) => {
  if (value) {
    state.provider = 'github'
    state.username = ''
    state.host = ''
  }
})

interface GithubEnrichment {
  username: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
}

async function enrichGithub(username: string): Promise<GithubEnrichment | null> {
  try {
    const u = await $fetch<{ login: string, name?: string, avatar_url?: string, html_url?: string }>(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    return { username: u.login, displayName: u.name, avatarUrl: u.avatar_url, profileUrl: u.html_url }
  } catch {
    return null
  }
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const data = event.data
    const username = data.username.trim()
    let enrichment: GithubEnrichment | null = null

    if (data.provider === 'github') {
      enrichment = await enrichGithub(username)
      if (!enrichment) {
        toast.add({ title: 'GitHub user not found', description: `No such user: ${username}`, color: 'error' })
        return
      }
    }

    await link({
      provider: data.provider,
      username: enrichment?.username ?? username,
      host: data.host?.trim() || undefined,
      displayName: enrichment?.displayName,
      avatarUrl: enrichment?.avatarUrl,
      profileUrl: enrichment?.profileUrl
    })

    toast.add({
      title: 'Account linked',
      description: `${data.provider} · ${enrichment?.username ?? username}`,
      color: 'success'
    })
    open.value = false
  } catch (error) {
    toast.add({
      title: 'Could not link account',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Link a forge account"
    description="Connect an external code forge account to your identity."
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <UForm
        id="link-account-form"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField name="provider" label="Provider">
          <USelect
            v-model="state.provider"
            :items="providerItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="username"
          label="Username"
          :description="state.provider === 'github' ? 'We\'ll fetch your avatar and profile from GitHub.' : undefined"
        >
          <UInput
            v-model="state.username"
            placeholder="octocat"
            autofocus
            autocapitalize="none"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="state.provider !== 'github' && state.provider !== 'tangled'"
          name="host"
          label="Host"
          hint="Optional"
          description="For self-hosted instances (e.g. codeberg.org)."
        >
          <UInput v-model="state.host" placeholder="codeberg.org" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer="{ close }">
      <UButton
        label="Cancel"
        color="neutral"
        variant="outline"
        @click="close"
      />
      <UButton
        type="submit"
        form="link-account-form"
        label="Link account"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
