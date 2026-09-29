<template>
  <div class="board-wrap" :class="{ 'is-inert': inert, 'no-resize-icons': hideResizeIcons }">
    <div ref="el" class="grid-stack"></div>
    <div v-if="!hasAny" class="board-empty muted">
      还没有任何模块，点击右上角「添加模块」开始。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { GridStack } from 'gridstack'
import type { Layout, LayoutItem } from '@shared/types'
import { api } from '../api'
import { DEFAULT_LAYOUT, getModule } from '../registry'
import { store } from '../store'
import { mountModule, unmountAll, unmountModule } from './mountModule'

const el = ref<HTMLDivElement | null>(null)
const hasAny = ref(false)

/** 设置面板是模态的，打开期间网格不接收任何指针事件，避免误拖模块。 */
const inert = computed(() => store.state.settingsOpen)

/** 默认显示四角缩放手柄图标；用户可在设置里关掉。 */
const hideResizeIcons = computed(() => store.state.config?.showResizeHandles === false)

/**
 * GridStack 的 prepareDragDrop 不在公开类型定义里，但它是官方内部流程依赖的稳定方法：
 * force=true 会先 _removeDD 再重建，从而重新查询拖拽句柄。
 */
type GridWithDD = GridStack & { prepareDragDrop(el: HTMLElement, force?: boolean): void }

let grid: GridWithDD | null = null
let persistTimer: number | null = null

function currentIds(): string[] {
  if (!grid) return []
  return grid.engine.nodes
    .map((n) => String(n.id ?? ''))
    .filter((id) => !!getModule(id))
}

function syncActive(): void {
  const ids = currentIds()
  store.setActiveIds(ids)
  hasAny.value = ids.length > 0
}

/** GridStack 需要 .grid-stack-item-content 作为内容容器，缺失时补一个。 */
function contentHost(itemEl: HTMLElement): HTMLElement | null {
  let host = itemEl.querySelector<HTMLElement>('.grid-stack-item-content')
  if (!host) {
    host = document.createElement('div')
    host.className = 'grid-stack-item-content'
    itemEl.appendChild(host)
  }
  return host
}

function add(id: string, pos?: Partial<LayoutItem>): void {
  if (!grid) return
  const def = getModule(id)
  if (!def) return
  // 单例：已经存在就不重复添加
  if (currentIds().includes(id)) return

  const item = grid.addWidget({
    id,
    w: pos?.w ?? def.defaultSize.w,
    h: pos?.h ?? def.defaultSize.h,
    minW: def.minSize.w,
    minH: def.minSize.h,
    ...(typeof pos?.x === 'number' ? { x: pos.x } : {}),
    ...(typeof pos?.y === 'number' ? { y: pos.y } : {})
  }) as HTMLElement | undefined

  const host = item ? contentHost(item) : null
  if (host) {
    try {
      mountModule(id, def.component, host)
    } catch (err) {
      console.error(`[grid] 模块 ${id} 挂载失败:`, err)
    }
  }

  if (item) {
    // 关键：GridStack 在 addWidget 时就把拖拽句柄从 DOM 里一次性查好了
    // （dd-draggable.js 里 `Array.from(el.querySelectorAll(option.handle))`）。
    // 而 Vue 组件是这一刻之后才挂进去的，那时 .module-frame__header 还不存在，
    // 会查到空数组 → 模块永远拖不动。挂载完成后必须强制重新绑定一次。
    if (!item.querySelector('.module-frame__header')) {
      console.warn(`[grid] 模块 ${id} 未找到拖拽句柄 .module-frame__header，将无法拖动`)
    }
    grid.prepareDragDrop(item, true)
  }

  syncActive()
  schedulePersist()
}

function remove(id: string): void {
  if (!grid) return
  const node = grid.engine.nodes.find((n) => String(n.id ?? '') === id)
  const itemEl = node?.el as HTMLElement | undefined
  unmountModule(id)
  if (itemEl) grid.removeWidget(itemEl)
  syncActive()
  schedulePersist()
}

function serialize(): Layout {
  const nodes = grid ? (grid.save(false) as unknown as Record<string, unknown>[]) : []
  const items: LayoutItem[] = nodes
    .map((n) => ({
      id: String(n.id ?? ''),
      x: Number(n.x ?? 0),
      y: Number(n.y ?? 0),
      w: Number(n.w ?? 1),
      h: Number(n.h ?? 1)
    }))
    .filter((n) => !!getModule(n.id))
  return { version: 1, updatedAt: Date.now(), items }
}

function schedulePersist(): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    api.layout.save(serialize())
  }, 300)
}

onMounted(async () => {
  const stored = await api.layout.get()
  const initial = (stored?.items?.length ? stored.items : DEFAULT_LAYOUT).filter((i) =>
    Boolean(getModule(i.id))
  )

  grid = GridStack.init(
    {
      column: 12,
      // 56 而不是更小的值：卡片里「大号数值 + 两行子项」需要约 70px 内容高度，
      // 两行网格（2*56+6=118）减去标题栏与内边距刚好放得下。
      cellHeight: 56,
      margin: 6,
      float: false,
      animate: true,
      // 不传 columnOpts 就不会有响应式塌缩——挂件窗口很窄，
      // 一旦塌缩成单列布局会彻底乱掉。
      // 拖拽句柄限定在模块标题栏，卡片内部的按钮 GridStack 会自动跳过
      // （见 dd-draggable.js 的 skipMouseDown）。
      draggable: { handle: '.module-frame__header' },
      resizable: { handles: 'all' }
    },
    el.value as HTMLElement
  ) as GridWithDD

  grid.on('change added removed', () => {
    syncActive()
    schedulePersist()
  })

  for (const item of initial) add(item.id, item)

  syncActive()
  store.registerBoard({ add, remove })
})

onBeforeUnmount(() => {
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  store.registerBoard(null)
  unmountAll()
  grid?.destroy(false)
  grid = null
})
</script>

<style scoped>
.board-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
}
</style>
