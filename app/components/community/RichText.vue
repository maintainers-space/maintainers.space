<script setup lang="ts">
// A Colibri message body, rendered from its facets without `v-html`.
import type { ColibriRichTextFacet } from '~/lib/community/richtext/facets'
import { renderRichText, safeHref, type Run } from '~/lib/community/richtext/render'

const props = defineProps<{ text: string; facets?: ColibriRichTextFacet[] }>()

const chat = useCommunityChat()
const blocks = computed(() => renderRichText(props.text, props.facets ?? []))
const revealed = ref(new Set<number>())

function classes(run: Run): string[] {
  return [
    run.bold ? 'font-semibold' : '',
    run.italic ? 'italic' : '',
    run.underline ? 'underline' : '',
    run.strike ? 'line-through' : '',
    run.code ? 'rounded bg-elevated px-1 py-0.5 font-mono text-[0.85em]' : ''
  ].filter(Boolean)
}

function mentionLabel(did: string): string {
  const member = chat.actor(did)
  return `@${member?.handle ?? did}`
}

function channelLabel(uri: string): string {
  return `#${chat.data.value.channels.find((c) => c.uri === uri)?.name ?? 'channel'}`
}

function timeLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}
</script>

<template>
  <div class="space-y-1 text-sm leading-relaxed text-default [overflow-wrap:anywhere]">
    <template v-for="(block, b) in blocks" :key="b">
      <pre
        v-if="block.kind === 'codeblock'"
        class="overflow-x-auto rounded-md border border-default bg-elevated/60 p-3 font-mono text-xs leading-normal"
      ><code>{{ block.runs.map((r) => r.text).join('') }}</code></pre>
      <component
        :is="
          block.kind === 'quote'
            ? 'blockquote'
            : block.kind === 'heading'
              ? `h${Math.min(3, Math.max(1, block.level ?? 1)) + 2}`
              : 'p'
        "
        v-else
        class="whitespace-pre-wrap"
        :class="{
          'border-l-2 border-accented pl-3 text-muted': block.kind === 'quote',
          'font-semibold text-highlighted': block.kind === 'heading',
          'text-xs text-muted': block.kind === 'subtext'
        }"
      >
        <template v-for="(run, r) in block.runs" :key="r">
          <a
            v-if="safeHref(run.link)"
            :href="safeHref(run.link)"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="text-primary underline-offset-2 hover:underline"
            :class="classes(run)"
            >{{ run.text }}</a
          >
          <span
            v-else-if="run.mention"
            class="rounded bg-primary/10 px-0.5 font-medium text-primary"
            >{{ mentionLabel(run.mention) }}</span
          >
          <span
            v-else-if="run.channel"
            class="rounded bg-primary/10 px-0.5 font-medium text-primary"
            >{{ channelLabel(run.channel) }}</span
          >
          <time v-else-if="run.time" :datetime="run.time" class="rounded bg-elevated px-1">{{
            timeLabel(run.time)
          }}</time>
          <button
            v-else-if="run.spoiler && !revealed.has(b * 1000 + r)"
            type="button"
            class="rounded bg-inverted text-inverted select-none"
            aria-label="Show spoiler"
            @click="revealed = new Set([...revealed, b * 1000 + r])"
          >
            {{ run.text }}
          </button>
          <span v-else :class="classes(run)">{{ run.text }}</span>
        </template>
      </component>
    </template>
  </div>
</template>
