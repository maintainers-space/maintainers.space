<script setup lang="ts">
// Who is in the community, grouped by the roles its admins chose to show separately.
import type { MemberView } from '~/lib/community/colibri'
import { displayName } from '~/lib/community/messages'

const chat = useCommunityChat()

const groups = computed(() => {
  const { roles } = chat.data.value
  const ranked = roles.toSorted((a, b) => (b.position ?? 0) - (a.position ?? 0))
  const showcased = ranked.filter((r) => r.protected || r.hoisted)
  const placed = new Set<string>()
  const result: Array<{ name: string; members: MemberView[] }> = []
  for (const role of showcased) {
    const members = chat.data.value.members.filter(
      (m) => m.roles?.includes(role.uri) && !placed.has(m.did)
    )
    for (const m of members) placed.add(m.did)
    if (members.length) result.push({ members, name: role.protected ? 'Owners' : role.name })
  }
  const rest = chat.data.value.members.filter((m) => !placed.has(m.did))
  if (rest.length) result.push({ members: rest, name: 'Members' })
  return result.map((g) => ({
    ...g,
    members: g.members.toSorted((a, b) => displayName(a).localeCompare(displayName(b)))
  }))
})
</script>

<template>
  <div class="space-y-4">
    <section v-for="group in groups" :key="group.name">
      <h4 class="px-2 text-xs font-semibold tracking-wide text-muted uppercase">
        {{ group.name }} — {{ group.members.length }}
      </h4>
      <ul class="mt-1 space-y-0.5">
        <li v-for="member in group.members" :key="member.did">
          <NuxtLink
            :to="`/profile/${member.handle ?? member.did}`"
            class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition hover:bg-elevated/60"
          >
            <CommunityActorAvatar :actor="member" size="sm" presence />
            <span class="min-w-0">
              <span class="block truncate text-sm text-default">{{ displayName(member) }}</span>
              <span v-if="member.data?.status?.text" class="block truncate text-xs text-muted">
                {{ member.data.status.emoji }} {{ member.data.status.text }}
              </span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
