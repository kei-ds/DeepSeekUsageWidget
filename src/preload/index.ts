import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH } from '@shared/channels'
import type { Config, Filter, Layout, Rect, WidgetApi } from '@shared/types'

/** 统一的订阅助手：返回取消订阅函数，组件卸载时必须调用，否则 HMR 会累积监听器。 */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: WidgetApi = {
  config: {
    get: () => ipcRenderer.invoke(CH.CONFIG_GET),
    patch: (patch: Partial<Config>) => ipcRenderer.invoke(CH.CONFIG_PATCH, patch)
  },
  window: {
    getState: () => ipcRenderer.invoke(CH.WINDOW_GET_STATE),
    setLocked: (locked: boolean) => ipcRenderer.invoke(CH.WINDOW_SET_LOCKED, locked),
    setAlwaysOnTop: (v: boolean) => ipcRenderer.invoke(CH.WINDOW_SET_ALWAYS_ON_TOP, v),
    setOpacity: (v: number) => ipcRenderer.invoke(CH.WINDOW_SET_OPACITY, v),
    toggleVisible: () => ipcRenderer.invoke(CH.WINDOW_TOGGLE_VISIBLE),
    hide: () => ipcRenderer.invoke(CH.WINDOW_HIDE),
    minimize: () => ipcRenderer.invoke(CH.WINDOW_MINIMIZE),
    reportLockRect: (rect: Rect) => ipcRenderer.send(CH.WINDOW_REPORT_LOCK_RECT, rect),
    requestInteractive: () => ipcRenderer.send(CH.WINDOW_REQUEST_INTERACTIVE),
    requestClickThrough: () => ipcRenderer.send(CH.WINDOW_REQUEST_CLICK_THROUGH),
    onState: (cb) => subscribe(CH.WINDOW_STATE, cb)
  },
  auth: {
    openLogin: () => ipcRenderer.invoke(CH.AUTH_OPEN_LOGIN),
    openLoginDevtools: () => ipcRenderer.invoke(CH.AUTH_OPEN_LOGIN_DEVTOOLS),
    getStatus: () => ipcRenderer.invoke(CH.AUTH_GET_STATUS),
    setManualToken: (token: string) => ipcRenderer.invoke(CH.AUTH_SET_MANUAL_TOKEN, token),
    clearToken: () => ipcRenderer.invoke(CH.AUTH_CLEAR_TOKEN),
    dumpStorageKeys: () => ipcRenderer.invoke(CH.AUTH_DUMP_STORAGE_KEYS),
    onChanged: (cb) => subscribe(CH.AUTH_CHANGED, cb)
  },
  usage: {
    refresh: (force?: boolean) => ipcRenderer.invoke(CH.USAGE_REFRESH, force !== false),
    query: (filter: Filter) => ipcRenderer.invoke(CH.USAGE_QUERY, filter),
    onData: (cb) => subscribe(CH.USAGE_DATA, cb),
    onStatus: (cb) => subscribe(CH.USAGE_STATUS, cb)
  },
  layout: {
    get: () => ipcRenderer.invoke(CH.LAYOUT_GET),
    save: (layout: Layout) => ipcRenderer.send(CH.LAYOUT_SAVE, layout)
  },
  autostart: {
    get: () => ipcRenderer.invoke(CH.AUTOSTART_GET),
    set: (enabled: boolean) => ipcRenderer.invoke(CH.AUTOSTART_SET, enabled)
  },
  shortcut: {
    get: () => ipcRenderer.invoke(CH.SHORTCUT_GET),
    set: (accelerator: string) => ipcRenderer.invoke(CH.SHORTCUT_SET, accelerator)
  },
  app: {
    quit: () => ipcRenderer.invoke(CH.APP_QUIT),
    getInfo: () => ipcRenderer.invoke(CH.APP_GET_INFO)
  },
  ui: {
    onOpenSettings: (cb) => subscribe(CH.UI_OPEN_SETTINGS, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
