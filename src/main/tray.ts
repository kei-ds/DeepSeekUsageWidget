import { Menu, Tray } from 'electron'
import { createTrayIcon } from './tray-icon'

export interface TrayActions {
  isLocked(): boolean
  isVisible(): boolean
  isAlwaysOnTop(): boolean
  isAutostart(): boolean
  isAutostartSupported(): boolean
  toggleLock(): void
  toggleVisible(): void
  toggleAlwaysOnTop(): void
  toggleAutostart(): void
  refresh(): void
  openSettings(): void
  openLogin(): void
  quit(): void
}

/**
 * 托盘是窗口隐藏后的唯一入口。注意 Tray 实例必须被长期持有，
 * 否则会被 GC 掉、图标莫名消失——所以由调用方保存本对象。
 */
export class TrayController {
  private tray: Tray | null = null

  constructor(private readonly actions: TrayActions) {}

  create(): void {
    if (this.tray) return
    this.tray = new Tray(createTrayIcon(32))
    this.tray.setToolTip('DeepSeek 用量')
    // Windows 上左键单击切显示/隐藏
    this.tray.on('click', () => this.actions.toggleVisible())
    this.rebuild()
  }

  /** 状态变化后（锁定/置顶/自启）重建菜单，保证勾选态与文案是最新的。 */
  rebuild(): void {
    if (!this.tray) return
    const a = this.actions
    const menu = Menu.buildFromTemplate([
      { label: a.isLocked() ? '解锁（恢复交互）' : '锁定（鼠标穿透）', click: () => a.toggleLock() },
      { label: a.isVisible() ? '隐藏窗口' : '显示窗口', click: () => a.toggleVisible() },
      { type: 'separator' },
      {
        label: '窗口置顶',
        type: 'checkbox',
        checked: a.isAlwaysOnTop(),
        click: () => a.toggleAlwaysOnTop()
      },
      {
        label: a.isAutostartSupported() ? '开机自启' : '开机自启（仅安装版可用）',
        type: 'checkbox',
        checked: a.isAutostart(),
        enabled: a.isAutostartSupported(),
        click: () => a.toggleAutostart()
      },
      { type: 'separator' },
      { label: '立即刷新', click: () => a.refresh() },
      { label: '登录 / 重新登录', click: () => a.openLogin() },
      { label: '设置…', click: () => a.openSettings() },
      { type: 'separator' },
      { label: '退出', click: () => a.quit() }
    ])
    this.tray.setContextMenu(menu)
  }

  dispose(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
