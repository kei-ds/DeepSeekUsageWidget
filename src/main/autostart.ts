import { app } from 'electron'
import { configStore } from './config-store'

export interface AutostartState {
  enabled: boolean
  supported: boolean
}

/**
 * 开发模式下 process.execPath 是 node_modules 里的 electron.exe，
 * 写进注册表只会得到一条重启后打不开的坏项，所以直接禁用。
 */
export function isSupported(): boolean {
  return app.isPackaged
}

export function applyAutostart(enabled: boolean): AutostartState {
  if (!isSupported()) {
    return { enabled: configStore.get().autostart, supported: false }
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      // 开机静默启动到托盘，不弹窗打扰
      args: ['--hidden']
    })
  } catch (err) {
    console.error('[autostart] 设置失败:', (err as Error).message)
  }
  return getAutostart()
}

export function getAutostart(): AutostartState {
  if (!isSupported()) {
    return { enabled: configStore.get().autostart, supported: false }
  }
  try {
    return { enabled: app.getLoginItemSettings().openAtLogin, supported: true }
  } catch {
    return { enabled: false, supported: false }
  }
}
