import { createApp, type App, type Component } from 'vue'

/**
 * GridStack 会直接改动 DOM（位置、内联样式、节点顺序），而 Vue 的虚拟 DOM 也想拥有这段 DOM。
 * 若用 v-for 渲染网格项，GridStack 的改动会在下一次 Vue 更新时被回滚。
 * 因此这里采用「命令式挂载」：每个网格项内部单独起一个 Vue 应用实例，
 * 与 GridBoard 的组件树解耦，两边各管各的 DOM。
 */
const mounted = new Map<string, App>()

export function mountModule(id: string, component: Component, host: Element): void {
  unmountModule(id)
  const app = createApp(component, { moduleId: id })
  app.mount(host)
  mounted.set(id, app)
}

export function unmountModule(id: string): void {
  const app = mounted.get(id)
  if (!app) return
  try {
    app.unmount()
  } catch (err) {
    console.warn('[grid] 卸载模块失败:', (err as Error).message)
  }
  mounted.delete(id)
}

export function unmountAll(): void {
  for (const id of [...mounted.keys()]) unmountModule(id)
}
