import { BrowserWindow, app } from 'electron'
import { CH } from '@shared/channels'
import { applyAutostart, getAutostart } from './autostart'
import { ClickThroughController } from './click-through'
import { configStore } from './config-store'
import { usageService } from './deepseek/service'
import { registerIpc } from './ipc'
import { flushLayout } from './layout-store'
import { disposeLoginWindow, showLoginWindow } from './login-window'
import { disposeShortcuts, registerWithFallback } from './shortcuts'
import { TrayController } from './tray'
import { createWidgetWindow, windowStateOf } from './widget-window'

// 二次启动（例如开机自启后又双击图标）不应该再开一个窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

/** 默认组合常被别的软件占用，按顺序挑第一个可用的。 */
const FALLBACK_SHORTCUTS = [
  'CommandOrControl+Alt+D',
  'CommandOrControl+Shift+Alt+L',
  'CommandOrControl+Alt+U'
]

let widgetWin: BrowserWindow | null = null
let isQuitting = false

const clickThrough = new ClickThroughController()

function broadcastWindowState(): void {
  if (!widgetWin || widgetWin.isDestroyed()) return
  widgetWin.webContents.send(CH.WINDOW_STATE, windowStateOf(widgetWin, clickThrough.isLocked()))
}

function rebuildTray(): void {
  tray?.rebuild()
}

function stateChanged(): void {
  broadcastWindowState()
  rebuildTray()
}

function toggleLock(): void {
  const next = !clickThrough.isLocked()
  clickThrough.setLocked(next)
  const cur = configStore.get()
  configStore.patch({ window: { ...cur.window, locked: next } })
  stateChanged()
}

const tray = new TrayController({
  isLocked: () => clickThrough.isLocked(),
  isVisible: () => !!widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible(),
  isAlwaysOnTop: () => !!widgetWin && !widgetWin.isDestroyed() && widgetWin.isAlwaysOnTop(),
  isAutostart: () => getAutostart().enabled,
  isAutostartSupported: () => app.isPackaged,
  toggleLock,
  toggleVisible: () => {
    if (!widgetWin || widgetWin.isDestroyed()) return
    if (widgetWin.isVisible()) {
      widgetWin.hide()
    } else {
      widgetWin.show()
      clickThrough.reapply()
    }
    stateChanged()
  },
  toggleAlwaysOnTop: () => {
    if (!widgetWin || widgetWin.isDestroyed()) return
    const next = !widgetWin.isAlwaysOnTop()
    widgetWin.setAlwaysOnTop(next, 'floating')
    const cur = configStore.get()
    configStore.patch({ window: { ...cur.window, alwaysOnTop: next } })
    stateChanged()
  },
  toggleAutostart: () => {
    const cur = configStore.get()
    configStore.patch({ autostart: !cur.autostart })
    applyAutostart(!cur.autostart)
    stateChanged()
  },
  refresh: () => void usageService.refresh(true),
  openSettings: () => {
    if (widgetWin && !widgetWin.isDestroyed()) {
      widgetWin.show()
      clickThrough.reapply()
      widgetWin.webContents.send(CH.UI_OPEN_SETTINGS)
    }
  },
  openLogin: () => {
    showLoginWindow()
  },
  quit: () => {
    isQuitting = true
    app.quit()
  }
})

app.whenReady().then(() => {
  const cfg = configStore.load()

  // 每次启动都重新应用一次：重装/更新可能清掉注册表里的自启项
  applyAutostart(cfg.autostart)

  widgetWin = createWidgetWindow()

  clickThrough.attach(widgetWin)
  clickThrough.setLocked(cfg.window.locked)

  usageService.setWindow(widgetWin)
  usageService.init()

  registerIpc({
    getWindow: () => widgetWin,
    clickThrough,
    toggleLock,
    onStateChanged: stateChanged
  })

  const shortcut = registerWithFallback(
    [cfg.shortcut, ...FALLBACK_SHORTCUTS.filter((s) => s !== cfg.shortcut)],
    toggleLock
  )
  if (!shortcut.registered) {
    console.warn(`[main] ${shortcut.reason ?? '全局快捷键注册失败'}（可在设置里更换）`)
  } else if (shortcut.usedFallback) {
    console.warn(`[main] 快捷键 ${cfg.shortcut} 已被占用，改用 ${shortcut.accelerator}`)
    configStore.patch({ shortcut: shortcut.accelerator })
  }

  try {
    tray.create()
  } catch (err) {
    // 窗口设了 skipTaskbar，托盘是唯一入口。万一托盘创建失败，程序将既无法呼出
    // 也无法退出，只能去任务管理器。退回显示任务栏图标，至少留一条活路。
    console.error('[main] 托盘图标创建失败，回退为显示任务栏图标:', err)
    widgetWin.setSkipTaskbar(false)
  }

  widgetWin.on('close', (e) => {
    // 关闭窗口只隐藏，程序继续活在托盘里；真正退出走托盘菜单
    if (!isQuitting) {
      e.preventDefault()
      widgetWin?.hide()
      stateChanged()
    }
  })

  widgetWin.on('closed', () => {
    widgetWin = null
  })

  widgetWin.webContents.once('did-finish-load', () => {
    broadcastWindowState()
  })
})

app.on('second-instance', () => {
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.show()
    widgetWin.focus()
    clickThrough.reapply()
    stateChanged()
  }
})

// 窗口隐藏后程序仍需存活（托盘应用），所以这里故意不退出
app.on('window-all-closed', () => {
  // no-op
})

app.on('activate', () => {
  if (!widgetWin || widgetWin.isDestroyed()) {
    widgetWin = createWidgetWindow()
    clickThrough.attach(widgetWin)
    usageService.setWindow(widgetWin)
  } else {
    widgetWin.show()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  configStore.flush()
  flushLayout()
  usageService.dispose()
  clickThrough.dispose()
  disposeShortcuts()
  tray.dispose()
  disposeLoginWindow()
})
