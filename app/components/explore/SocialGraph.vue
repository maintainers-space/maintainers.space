<script setup lang="ts">
import ForceGraph from 'force-graph'
import { getForge } from '~/lib/forges'
import type { GraphNode, GraphLink } from '~/composables/useSocialGraph'

const props = defineProps<{
  nodes: GraphNode[]
  links: GraphLink[]
}>()

const emit = defineEmits<{
  select: [node: GraphNode | null, screen: { x: number; y: number } | null]
}>()

const containerEl = ref<HTMLDivElement | null>(null)
let graph: InstanceType<typeof ForceGraph> | null = null
let selectedId: string | null = null

const imageCache = new Map<string, HTMLImageElement>()
function imageFor(url: string): HTMLImageElement {
  const cached = imageCache.get(url)
  if (cached) return cached
  const img = new Image()
  img.src = url
  imageCache.set(url, img)
  return img
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/)
  const chars = parts.length > 1 ? [parts[0]![0], parts[1]![0]] : [label.slice(0, 2)]
  return chars.join('').toUpperCase()
}

const DEPTH_COLOR = ['#eab308', '#3b82f6', '#8b5cf6']

function radiusOf(node: GraphNode): number {
  if (node.kind === 'project') return 5
  return node.depth === 0 ? 11 : node.depth === 1 ? 8 : 6
}

function drawNode(node: GraphNode, ctx: CanvasRenderingContext2D): void {
  const x = (node as { x?: number }).x ?? 0
  const y = (node as { y?: number }).y ?? 0
  const r = radiusOf(node)

  if (node.kind === 'project') {
    const color = getForge(node.provider)?.color ?? '#6b7280'
    ctx.fillStyle = color
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    if (node.id === selectedId) {
      ctx.strokeStyle = '#eab308'
      ctx.lineWidth = 2
      ctx.strokeRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4)
    }
    return
  }

  const img = node.avatarUrl ? imageFor(node.avatarUrl) : null
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, 2 * Math.PI)
  ctx.closePath()
  ctx.clip()
  if (img?.complete && img.naturalWidth) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = DEPTH_COLOR[node.depth] ?? '#6b7280'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `${Math.max(6, r)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials(node.label), x, y)
  }
  ctx.restore()

  // Provider badge: a small dot in the primary account's forge color.
  const forgeColor = node.accounts[0] ? getForge(node.accounts[0].provider)?.color : undefined
  if (forgeColor) {
    const dotR = Math.max(2, r * 0.32)
    ctx.beginPath()
    ctx.arc(x + r * 0.72, y + r * 0.72, dotR, 0, 2 * Math.PI)
    ctx.fillStyle = forgeColor
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()
  }

  if (node.id === selectedId || node.depth === 0) {
    ctx.beginPath()
    ctx.arc(x, y, r + 2, 0, 2 * Math.PI)
    ctx.strokeStyle = node.id === selectedId ? '#eab308' : 'rgba(234,179,8,0.6)'
    ctx.lineWidth = node.id === selectedId ? 2.5 : 1.5
    ctx.stroke()
  }
}

function paintPointerArea(node: GraphNode, color: string, ctx: CanvasRenderingContext2D): void {
  const x = (node as { x?: number }).x ?? 0
  const y = (node as { y?: number }).y ?? 0
  const r = radiusOf(node)
  ctx.fillStyle = color
  if (node.kind === 'project') ctx.fillRect(x - r, y - r, r * 2, r * 2)
  else {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fill()
  }
}

function updateSelectionScreenPos(node: GraphNode): void {
  if (!graph) return
  const x = (node as { x?: number }).x ?? 0
  const y = (node as { y?: number }).y ?? 0
  emit('select', node, graph.graph2ScreenCoords(x, y))
}

function selectNode(node: GraphNode | null): void {
  selectedId = node?.id ?? null
  if (!node) {
    emit('select', null, null)
    return
  }
  updateSelectionScreenPos(node)
}

function build(): void {
  if (!containerEl.value) return
  graph = new ForceGraph(containerEl.value)
    .graphData({
      nodes: props.nodes as unknown as object[],
      links: props.links as unknown as object[]
    })
    .width(containerEl.value.clientWidth)
    .height(containerEl.value.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .nodeRelSize(4)
    .nodeCanvasObject((node, ctx) => drawNode(node as unknown as GraphNode, ctx))
    .nodePointerAreaPaint((node, color, ctx) =>
      paintPointerArea(node as unknown as GraphNode, color, ctx)
    )
    .linkColor((link) =>
      (link as unknown as GraphLink).kind === 'contributes'
        ? 'rgba(107,114,128,0.35)'
        : 'rgba(148,163,184,0.45)'
    )
    .linkWidth(1)
    .linkLineDash((link) => ((link as unknown as GraphLink).kind === 'contributes' ? [2, 2] : null))
    .onNodeClick((node) => selectNode(node as unknown as GraphNode))
    .onBackgroundClick(() => selectNode(null))
    .onNodeDrag((node) => {
      if (node.id === selectedId) updateSelectionScreenPos(node as unknown as GraphNode)
    })
    .onZoom(() => {
      if (!selectedId) return
      const node = props.nodes.find((n) => n.id === selectedId)
      if (node) updateSelectionScreenPos(node)
    })
    .onEngineTick(() => {
      if (!selectedId) return
      const node = props.nodes.find((n) => n.id === selectedId)
      if (node) updateSelectionScreenPos(node)
    })

  const chargeForce = graph.d3Force('charge') as { strength?: (v: number) => void } | undefined
  chargeForce?.strength?.(-140)
}

function resize(): void {
  if (graph && containerEl.value) {
    graph.width(containerEl.value.clientWidth).height(containerEl.value.clientHeight)
  }
}

onMounted(() => {
  build()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  graph?._destructor()
  graph = null
})

watch(
  () => [props.nodes, props.links],
  () => {
    graph?.graphData({
      nodes: props.nodes as unknown as object[],
      links: props.links as unknown as object[]
    })
  }
)

function zoomToFit(): void {
  graph?.zoomToFit(400, 60)
}

defineExpose({ zoomToFit })
</script>

<template>
  <div ref="containerEl" class="h-full w-full" />
</template>
