<script setup lang="ts">
import type { ForgeId } from '~/types/forge'

interface TokenProvider {
  id: ForgeId
  label: string
  icon: string
  help: string
  createUrl: string
  scopes: string
}

const providers: TokenProvider[] = [
  {
    id: 'github',
    label: 'GitHub',
    icon: 'i-simple-icons-github',
    help: 'Unlocks code search, Discussions, and raises the API rate limit from 60 to 5,000 requests/hour.',
    createUrl: 'https://github.com/settings/tokens/new?description=koinon&scopes=public_repo,read:discussion,read:user',
    scopes: 'public_repo, read:discussion, read:user'
  }
]

const { get, set, remove } = useForgeTokens()
const toast = useToast()

const drafts = reactive<Record<string, string>>({})
const revealed = reactive<Record<string, boolean>>({})

function isSet(id: ForgeId): boolean {
  return Boolean(get(id))
}

function save(id: ForgeId): void {
  const value = (drafts[id] ?? '').trim()
  if (!value) return
  set(id, value)
  drafts[id] = ''
  toast.add({ title: 'Token saved', description: 'Stored locally on this device only.', color: 'success' })
}

function clear(id: ForgeId): void {
  remove(id)
  toast.add({ title: 'Token removed', color: 'neutral' })
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="font-semibold text-highlighted">
        Access tokens
      </h2>
      <p class="text-sm text-muted">
        Optional personal access tokens unlock extra features. They are stored only in this
        browser and are sent directly to the forge — never to koinon.
      </p>
    </div>

    <UCard v-for="p in providers" :key="p.id">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <UIcon :name="p.icon" class="size-5" />
            <h3 class="font-semibold text-highlighted">
              {{ p.label }}
            </h3>
          </div>
          <UBadge
            :color="isSet(p.id) ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
            :label="isSet(p.id) ? 'Connected' : 'Not set'"
          />
        </div>
      </template>

      <div class="space-y-3">
        <p class="text-sm text-muted">
          {{ p.help }}
        </p>

        <div v-if="isSet(p.id)" class="flex items-center justify-between gap-3 rounded-md bg-elevated/40 px-3 py-2">
          <span class="font-mono text-sm text-default">
            {{ revealed[p.id] ? get(p.id) : '•'.repeat(16) }}
          </span>
          <div class="flex items-center gap-1">
            <UButton
              :icon="revealed[p.id] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="revealed[p.id] = !revealed[p.id]"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              label="Remove"
              @click="clear(p.id)"
            />
          </div>
        </div>

        <div v-else class="space-y-2">
          <UInput
            v-model="drafts[p.id]"
            type="password"
            placeholder="Paste token…"
            icon="i-lucide-key-round"
            autocomplete="off"
            class="w-full"
            @keydown.enter="save(p.id)"
          />
          <div class="flex items-center justify-between gap-3">
            <UButton
              :to="p.createUrl"
              target="_blank"
              trailing-icon="i-lucide-external-link"
              color="neutral"
              variant="link"
              size="xs"
              :label="`Create a token (${p.scopes})`"
              class="px-0"
            />
            <UButton
              label="Save"
              size="sm"
              :disabled="!(drafts[p.id] ?? '').trim()"
              @click="save(p.id)"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
