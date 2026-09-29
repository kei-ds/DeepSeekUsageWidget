import { BrowserWindow, app, screen } from 'electron'
import { join } from 'path'
import type { WindowState } from '@shared/types'
import { configStore } from './config-store'

/** 至少有一部分落在某个显示器的工作区内，否则窗口会「跑到看不见的地方」。 */
function isOnScreen(bounds: { x: number; y: number; width: number; height: number }): boolean {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea
    return (
      bounds.x < wa.x + wa.width &&
      bounds.x + bounds.width > wa.x &&
      bounds.y < wa.y + wa.height &&
      bounds.y + bounds.height > wa.y
    )
  })
}

export function createWidgetWindow(): BrowserWindow {
  const cfg = configStore.get()
  const w = cfg.window

  const saved = {
    x: w.x ?? 0,
    y: w.y ?? 0,
    width: Math.max(340, w.width),
    height: Math.max(240, w.height)
  }
  const usePosition = typeof w.x === 'number' && typeof w.y === 'number' && isOnScreen(saved)

  // 开发调试时不要默认置顶：调试窗口一直压在最上层会妨碍正常使用其它程序。
  // 只有打包后的正式版才应用配置里的置顶设置；开发时可在设置或托盘菜单里手动开启来验证。
  const onTop = app.isPackaged ? w.alwaysOnTop : false

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(usePosition ? { x: saved.x, y: saved.y } : {}),
    minWidth: 340,
    minHeight: 240,
    frame: false,
    resizable: true,
    movable: true,
    alwaysOnTop: onTop,
    skipTaskbar: true,
    show: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#0e1116',
    title: 'DeepSeek 用量',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 窗口隐藏/失焦时也要继续跑定时刷新
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(onTop, 'floating')
  if (w.opacity < 1) win.setOpacity(w.opacity)

  // 无边框窗口没有可见的开发者工具入口，把渲染层日志转发到主进程 stdout，
  // 否则前端报错会完全静默（只呈现为一片空白）。
  win.webContents.on('console-message', (_e, _level, message, line, sourceId) => {
    console.log(`[renderer] ${message}  (${sourceId}:${line})`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] 加载失败 ${code} ${desc} ${url}`)
  })
  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error(`[renderer] preload 出错 ${preloadPath}:`, err)
  })

  const persistBounds = (() => {
    let timer: NodeJS.Timeout | null = null
    return (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (win.isDestroyed()) return
        const b = win.getBounds()
        const cur = configStore.get()
        configStore.patch({
          window: { ...cur.window, x: b.x, y: b.y, width: b.width, height: b.height }
        })
      }, 400)
    }
  })()

  win.on('resize', persistBounds)
  win.on('move', persistBounds)

  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show()
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export function windowStateOf(win: BrowserWindow, locked: boolean): WindowState {
  return {
    locked,
    alwaysOnTop: win.isAlwaysOnTop(),
    visible: win.isVisible(),
    opacity: win.getOpacity()
  }
}
