<script setup lang="ts">
// A whole Community: channels on the left, the open channel in the middle, members on the right.
// On narrow screens the channel list and the members open as slide-overs from the header.
import { CHANNEL_TYPE, channelIcon } from '~/lib/community/colibri'
import type { ResolvedCommunity } from '~/lib/community/discovery'
import { rkeyOf } from '~/lib/community/records'

const props = withDefaults(
  defineProps<{
    community: ResolvedCommunity
    /** The open channel's record key; the first text channel when unset. */
    channel?: string | null
    /** Inside a repository tab: no channel sidebar on wide screens either. */
    compact?: boolean
  }>(),
  { channel: null, compact: false }
)
const emit = defineEmits<{ navigate: [rkey: string] }>()

const chat = createCommunityChat(props.community.data, props.community.record.community)
provide(COMMUNITY_CHAT, chat)
onBeforeUnmount(chat.dispose)

watch(
  () => props.community.data,
  (data) => {
    chat.data.value = data
  }
)

const toast = useToast()
const channelsOpen = ref(false)
const membersOpen = ref(false)
const showMembers = useLocalStorage('maintainers.space:community:members', true)
const confirmLeave = ref(false)
const leaving = ref(false)

const fallback = computed(() => {
  const { channels } = chat.data.value
  const texts = channels.filter((c) => c.type === CHANNEL_TYPE.text)
  return texts.find((c) => c.name === 'general') ?? texts[0] ?? channels[0]
})
const current = computed(
  () => chat.data.value.channels.find((c) => rkeyOf(c.uri) === props.channel) ?? fallback.value
)
const currentKey = computed(() => (current.value ? rkeyOf(current.value.uri) : null))

watch(current, (channel) => chat.open(channel?.uri ?? null), { immediate: true })

function select(rkey: string): void {
  channelsOpen.value = false
  emit('navigate', rkey)
}

async function leave(): Promise<void> {
  leaving.value = true
  try {
    await chat.leave()
    confirmLeave.value = false
  } catch (e) {
    toast.add({
      color: 'error',
      description: e instanceof Error ? e.message : undefined,
      title: 'Could not leave'
    })
  } finally {
    leaving.value = false
  }
}

const menu = computed(() => [
  [
    {
      icon: 'i-lucide-external-link',
      label: 'Open in Colibri',
      target: '_blank',
      to: 'https://colibri.social'
    },
    ...(chat.membership.value === 'member' && !chat.isOwner.value
      ? [
          {
            color: 'error' as const,
            icon: 'i-lucide-log-out',
            label: 'Leave community',
            onSelect: () => (confirmLeave.value = true)
          }
        ]
      : [])
  ]
])
</script>

<template>
  <div class="flex h-full min-h-0 w-full">
    <aside
      class="hidden w-60 shrink-0 flex-col border-r border-default bg-elevated/20"
      :class="{ 'lg:flex': !compact }"
    >
      <div class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-3">
        <span class="truncate font-semibold text-highlighted">{{
          chat.data.value.community.name
        }}</span>
        <UDropdownMenu :items="menu" :content="{ align: 'start' }">
          <UButton
            class="ml-auto"
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Community menu"
          />
        </UDropdownMenu>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <CommunityChannelList :active="currentKey" @select="select" />
      </div>
    </aside>

    <section class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-2 sm:px-4">
        <UButton
          :class="compact ? '' : 'lg:hidden'"
          icon="i-lucide-panel-left"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Channels"
          @click="channelsOpen = true"
        />
        <template v-if="current">
          <UIcon :name="channelIcon(current)" class="size-4 shrink-0 text-muted" />
          <h2 class="shrink-0 font-semibold text-highlighted">{{ current.name }}</h2>
          <p v-if="current.description" class="hidden min-w-0 truncate text-sm text-muted md:block">
            <span class="mx-1 text-dimmed" aria-hidden="true">·</span>{{ current.description }}
          </p>
        </template>
        <div class="ml-auto flex shrink-0 items-center gap-1">
          <UTooltip
            :text="chat.socketStatus.value === 'open' ? 'Live' : 'Refreshing every few seconds'"
          >
            <span
              class="size-2 rounded-full"
              :class="
                chat.socketStatus.value === 'open' ? 'bg-success' : 'bg-(--ui-border-accented)'
              "
              :aria-label="chat.socketStatus.value === 'open' ? 'Live' : 'Not live'"
              role="status"
            />
          </UTooltip>
          <UButton
            icon="i-lucide-users"
            color="neutral"
            :variant="showMembers ? 'soft' : 'ghost'"
            size="sm"
            class="max-xl:hidden"
            :aria-pressed="showMembers"
            aria-label="Show members"
            @click="showMembers = !showMembers"
          />
          <UButton
            icon="i-lucide-users"
            color="neutral"
            variant="ghost"
            size="sm"
            class="xl:hidden"
            aria-label="Members"
            @click="membersOpen = true"
          />
        </div>
      </header>

      <div v-if="!current" class="flex flex-1 items-center justify-center p-6 text-sm text-muted">
        This community has no channels yet.
      </div>
      <CommunityForumChannel
        v-else-if="current.type === CHANNEL_TYPE.forum"
        :key="current.uri"
        :channel="current"
      />
      <div
        v-else-if="current.type === CHANNEL_TYPE.voice"
        class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <UIcon name="i-lucide-volume-2" class="size-8 text-muted" />
        <p class="max-w-sm text-sm text-muted">Voice channels work in the Colibri app for now.</p>
        <UButton
          to="https://colibri.social"
          target="_blank"
          label="Open Colibri"
          trailing-icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
        />
      </div>
      <CommunityTextChannel v-else :channel="current" />
    </section>

    <aside
      v-if="showMembers"
      class="hidden w-60 shrink-0 overflow-y-auto border-l border-default p-2 xl:block"
    >
      <CommunityMemberList />
    </aside>

    <USlideover
      v-model:open="channelsOpen"
      side="left"
      :title="chat.data.value.community.name"
      :ui="{ content: 'max-w-72' }"
    >
      <template #body>
        <CommunityChannelList :active="currentKey" @select="select" />
      </template>
    </USlideover>
    <USlideover
      v-model:open="membersOpen"
      side="right"
      title="Members"
      :ui="{ content: 'max-w-72' }"
    >
      <template #body>
        <CommunityMemberList />
      </template>
    </USlideover>

    <UModal
      v-model:open="confirmLeave"
      :title="`Leave ${chat.data.value.community.name}?`"
      description="You can join again later."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Stay" @click="confirmLeave = false" />
          <UButton color="error" label="Leave" :loading="leaving" @click="leave" />
        </div>
      </template>
    </UModal>
  </div>
</template>
