import { BrowserWindow, app, ipcMain } from 'electron'
import { CH } from '@shared/channels'
import type { Config, Filter, Layout, Rect } from '@shared/types'
import { applyAutostart, getAutostart } from '../autostart'
import type { ClickThroughController } from '../click-through'
import { configStore } from '../config-store'
import { usageService } from '../deepseek/service'
import { getLayout, saveLayout } from '../layout-store'
import {
  clearAuth,
  dumpStorageKeys,
  getAuthStatus,
  openLoginDevtools,
  setManualToken,
  showLoginWindow
} from '../login-window'
import { getCurrent, registerToggle } from '../shortcuts'
import { windowStateOf } from '../widget-window'

export interface IpcDeps {
  getWindow(): BrowserWindow | null
  clickThrough: ClickThroughController
  /** 锁定态在快捷键/托盘/UI 之间共享，统一由 index 实现 */
  toggleLock(): void
  /** 状态变化后：广播给渲染层 + 重建托盘菜单 */
  onStateChanged(): void
}

/** 配置被改动后需要「落到实际行动」的部分。 */
function applyConfigEffects(next: Config, deps: IpcDeps): void {
  const win = deps.getWindow()
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(next.window.alwaysOnTop, 'floating')
    win.setOpacity(Math.min(1, Math.max(0.3, next.window.opacity)))
  }
  applyAutostart(next.autostart)
  usageService.restartTimer()
  if (next.shortcut) {
    registerToggle(next.shortcut, () => deps.toggleLock())
  }
  deps.onStateChanged()
}

export function registerIpc(deps: IpcDeps): void {
  const state = (): ReturnType<typeof windowStateOf> | null => {
    const win = deps.getWindow()
    if (!win || win.isDestroyed()) return null
    return windowStateOf(win, deps.clickThrough.isLocked())
  }

  // ---- 配置 ----
  ipcMain.handle(CH.CONFIG_GET, () => configStore.get())
  ipcMain.handle(CH.CONFIG_PATCH, (_e, patch: Partial<Config>) => {
    const next = configStore.patch(patch ?? {})
    applyConfigEffects(next, deps)
    return next
  })

  // ---- 窗口 ----
  ipcMain.handle(CH.WINDOW_GET_STATE, () => state())
  ipcMain.handle(CH.WINDOW_SET_LOCKED, (_e, locked: boolean) => {
    deps.clickThrough.setLocked(!!locked)
    const cur = configStore.get()
    configStore.patch({ window: { ...cur.window, locked: !!locked } })
    deps.onStateChanged()
    return state()
  })
  ipcMain.handle(CH.WINDOW_SET_ALWAYS_ON_TOP, (_e, v: boolean) => {
    const win = deps.getWindow()
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!v, 'floating')
    const cur = configStore.get()
    configStore.patch({ window: { ...cur.window, alwaysOnTop: !!v } })
    deps.onStateChanged()
    return state()
  })
  ipcMain.handle(CH.WINDOW_SET_OPACITY, (_e, v: number) => {
    const clamped = Math.min(1, Math.max(0.3, Number(v) || 1))
    const win = deps.getWindow()
    if (win && !win.isDestroyed()) win.setOpacity(clamped)
    const cur = configStore.get()
    configStore.patch({ window: { ...cur.window, opacity: clamped } })
    deps.onStateChanged()
    return state()
  })
  ipcMain.handle(CH.WINDOW_TOGGLE_VISIBLE, () => {
    const win = deps.getWindow()
    if (win && !win.isDestroyed()) {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
        deps.clickThrough.reapply()
      }
    }
    deps.onStateChanged()
    return state()
  })
  ipcMain.handle(CH.WINDOW_HIDE, () => {
    const win = deps.getWindow()
    if (win && !win.isDestroyed()) win.hide()
    deps.onStateChanged()
  })
  ipcMain.handle(CH.WINDOW_MINIMIZE, () => {
    const win = deps.getWindow()
    if (win && !win.isDestroyed()) win.hide()
    deps.onStateChanged()
  })
  ipcMain.on(CH.WINDOW_REPORT_LOCK_RECT, (_e, rect: Rect) => {
    if (rect && typeof rect.x === 'number') deps.clickThrough.reportLockRect(rect)
  })
  ipcMain.on(CH.WINDOW_REQUEST_INTERACTIVE, () => deps.clickThrough.requestInteractive())
  ipcMain.on(CH.WINDOW_REQUEST_CLICK_THROUGH, () => deps.clickThrough.requestClickThrough())

  // ---- 鉴权 ----
  ipcMain.handle(CH.AUTH_OPEN_LOGIN, () => {
    showLoginWindow()
    return getAuthStatus()
  })
  ipcMain.handle(CH.AUTH_OPEN_LOGIN_DEVTOOLS, () => {
    openLoginDevtools()
  })
  ipcMain.handle(CH.AUTH_GET_STATUS, () => getAuthStatus())
  ipcMain.handle(CH.AUTH_SET_MANUAL_TOKEN, (_e, token: string) => {
    const status = setManualToken(String(token ?? ''))
    void usageService.refresh(true)
    return status
  })
  ipcMain.handle(CH.AUTH_CLEAR_TOKEN, async () => {
    const status = await clearAuth()
    return status
  })
  ipcMain.handle(CH.AUTH_DUMP_STORAGE_KEYS, () => dumpStorageKeys())

  // ---- 用量 ----
  ipcMain.handle(CH.USAGE_REFRESH, async (_e, force?: boolean) => {
    const data = await usageService.refresh(force !== false)
    return { ok: !!data, fetchedAt: data?.fetchedAt ?? 0 }
  })
  ipcMain.handle(CH.USAGE_QUERY, async (_e, filter: Filter) => {
    if (!filter || typeof filter !== 'object' || !('kind' in filter)) return null
    return usageService.setFilter(filter)
  })

  // ---- 布局 ----
  ipcMain.handle(CH.LAYOUT_GET, () => getLayout())
  ipcMain.on(CH.LAYOUT_SAVE, (_e, layout: Layout) => {
    if (layout && Array.isArray(layout.items)) saveLayout(layout)
  })

  // ---- 自启 ----
  ipcMain.handle(CH.AUTOSTART_GET, () => getAutostart())
  ipcMain.handle(CH.AUTOSTART_SET, (_e, enabled: boolean) => {
    configStore.patch({ autostart: !!enabled })
    const result = applyAutostart(!!enabled)
    deps.onStateChanged()
    return result
  })

  // ---- 快捷键 ----
  ipcMain.handle(CH.SHORTCUT_GET, () => getCurrent())
  ipcMain.handle(CH.SHORTCUT_SET, (_e, accelerator: string) => {
    const accel = String(accelerator ?? '').trim()
    if (!accel) return { ...getCurrent(), registered: false, reason: '快捷键不能为空' }
    const result = registerToggle(accel, () => deps.toggleLock())
    if (result.registered) {
      const cur = configStore.get()
      configStore.patch({ shortcut: result.accelerator })
    }
    deps.onStateChanged()
    return result
  })

  // ---- 应用 ----
  ipcMain.handle(CH.APP_QUIT, () => {
    app.quit()
  })
  ipcMain.handle(CH.APP_GET_INFO, () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged
  }))
}
