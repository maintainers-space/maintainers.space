import type { EmojiEntry } from '~/utils/emoji'

const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing'
] as const

/**
 * Detects a `:shortcode` token at the textarea caret and drives a floating
 * autocomplete: tracks the query, the matching emoji, and the caret's pixel
 * position (via an offscreen mirror div, since textareas expose no API for it).
 */
export function useEmojiAutocomplete(
  getTextarea: () => HTMLTextAreaElement | null,
  model: Ref<string>
) {
  const open = ref(false)
  const query = ref('')
  const activeIndex = ref(0)
  const top = ref(0)
  const left = ref(0)

  let tokenStart = -1
  let mirror: HTMLDivElement | null = null

  const results = computed(() => (open.value ? searchEmoji(query.value, 8) : []))

  function close(): void {
    open.value = false
    tokenStart = -1
  }

  function positionAt(ta: HTMLTextAreaElement, caret: number): void {
    if (!mirror) {
      mirror = document.createElement('div')
      mirror.style.position = 'absolute'
      mirror.style.visibility = 'hidden'
      mirror.style.whiteSpace = 'pre-wrap'
      mirror.style.overflowWrap = 'break-word'
      mirror.style.top = '0'
      mirror.style.left = '-9999px'
      document.body.appendChild(mirror)
    }
    const cs = getComputedStyle(ta)
    for (const prop of MIRROR_PROPS) mirror.style[prop] = cs[prop]

    const marker = document.createElement('span')
    marker.textContent = '​'
    mirror.replaceChildren(document.createTextNode(ta.value.slice(0, caret)), marker)

    const taRect = ta.getBoundingClientRect()
    const mirrorRect = mirror.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    top.value = taRect.top + (markerRect.top - mirrorRect.top) - ta.scrollTop + 22
    left.value = taRect.left + (markerRect.left - mirrorRect.left) - ta.scrollLeft
  }

  /** Call on every input/click/keyup so the dropdown tracks the caret. */
  function sync(): void {
    const ta = getTextarea()
    if (!ta) return close()
    const caret = ta.selectionStart
    const match = /(?:^|\s)(:[a-z0-9_+-]*)$/i.exec(ta.value.slice(0, caret))
    if (!match?.[1]) return close()
    tokenStart = caret - match[1].length
    query.value = match[1].slice(1)
    activeIndex.value = 0
    open.value = true
    positionAt(ta, caret)
  }

  function insert(entry: EmojiEntry): void {
    const ta = getTextarea()
    if (!ta || tokenStart < 0) return
    const caret = ta.selectionStart
    const before = model.value.slice(0, tokenStart)
    const after = model.value.slice(caret)
    const pos = tokenStart + entry.emoji.length + 1
    model.value = `${before}${entry.emoji} ${after}`
    close()
    nextTick(() => {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  /** Returns true when the key was consumed (caller should not also handle it). */
  function onKeydown(e: KeyboardEvent): boolean {
    if (!open.value) return false
    const count = results.value.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (count) activeIndex.value = (activeIndex.value + 1) % count
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (count) activeIndex.value = (activeIndex.value - 1 + count) % count
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (count) {
        e.preventDefault()
        insert(results.value[activeIndex.value]!)
      }
      return true
    }
    if (e.key === 'Escape') {
      close()
      return true
    }
    return false
  }

  onBeforeUnmount(() => mirror?.remove())

  return { open, query, results, activeIndex, top, left, sync, insert, onKeydown, close }
}
