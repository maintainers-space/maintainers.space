<script setup lang="ts">
import type { MessageView } from '~/lib/chat/colibri'

defineProps<{ message: MessageView; showAuthor: boolean }>()
</script>

<template>
  <div class="flex gap-3 px-4 py-0.5 hover:bg-elevated/30" :class="showAuthor ? 'mt-3 pt-1.5' : ''">
    <div class="w-9 shrink-0">
      <UAvatar
        v-if="showAuthor"
        :src="message.author.avatar"
        :alt="message.author.displayName || message.author.handle"
        size="md"
      />
    </div>
    <div class="min-w-0 flex-1">
      <div v-if="showAuthor" class="flex items-baseline gap-2">
        <span class="text-sm font-semibold text-highlighted">
          {{ message.author.displayName || message.author.handle }}
        </span>
        <span class="text-xs text-muted">{{ formatRelativeTime(message.createdAt) }}</span>
        <UBadge
          v-if="message.uri.startsWith('temp:')"
          label="Sending…"
          color="neutral"
          variant="subtle"
          size="xs"
        />
      </div>
      <p class="text-sm whitespace-pre-wrap text-toned">{{ message.text }}</p>
    </div>
  </div>
</template>
