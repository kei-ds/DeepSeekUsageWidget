import type { Config, Filter, Layout, Rect, WidgetApi } from '@shared/types'

const raw = window.api

if (!raw) {
  // 在浏览器里直接打开页面时会走到这里，给个明确提示而不是一堆 undefined 报错
  throw new Error('window.api 不存在：请通过 Electron 启动本应用（npm run dev）')
}

/**
 * Vue 的 reactive() 会把对象包成 Proxy，而 Proxy 无法通过结构化克隆算法，
 * 直接丢给 ipcRenderer.invoke 会报 "An object could not be cloned"。
 * 所有跨 IPC 传出的对象参数都先过这里还原成普通对象。
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const api: WidgetApi = {
  config: {
    get: () => raw.config.get(),
    patch: (patch: Partial<Config>) => raw.config.patch(clone(patch))
  },
  window: {
    getState: () => raw.window.getState(),
    setLocked: (locked: boolean) => raw.window.setLocked(locked),
    setAlwaysOnTop: (v: boolean) => raw.window.setAlwaysOnTop(v),
    setOpacity: (v: number) => raw.window.setOpacity(v),
    toggleVisible: () => raw.window.toggleVisible(),
    hide: () => raw.window.hide(),
    minimize: () => raw.window.minimize(),
    reportLockRect: (rect: Rect) => raw.window.reportLockRect(clone(rect)),
    requestInteractive: () => raw.window.requestInteractive(),
    requestClickThrough: () => raw.window.requestClickThrough(),
    onState: (cb) => raw.window.onState(cb)
  },
  auth: raw.auth,
  usage: {
    refresh: (force?: boolean) => raw.usage.refresh(force),
    query: (filter: Filter) => raw.usage.query(clone(filter)),
    onData: (cb) => raw.usage.onData(cb),
    onStatus: (cb) => raw.usage.onStatus(cb)
  },
  layout: {
    get: () => raw.layout.get(),
    save: (layout: Layout) => raw.layout.save(clone(layout))
  },
  autostart: raw.autostart,
  shortcut: raw.shortcut,
  app: raw.app,
  ui: raw.ui
}
