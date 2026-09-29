import { globalShortcut } from 'electron'

let current: string | null = null
let handler: (() => void) | null = null

export interface ShortcutResult {
  accelerator: string
  registered: boolean
  reason?: string
}

/**
 * 注册（或改绑）切换锁定的全局快捷键。
 * 注册失败通常是被别的程序占了，此时回滚到上一个可用的加速键，
 * 并把失败原因回传给 UI，由用户决定是否换一个组合。
 */
export function registerToggle(accelerator: string, cb: () => void): ShortcutResult {
  const previous = current
  if (previous) {
    try {
      globalShortcut.unregister(previous)
    } catch {
      /* 忽略 */
    }
  }

  let ok = false
  try {
    ok = globalShortcut.register(accelerator, cb)
  } catch {
    ok = false
  }

  if (ok) {
    current = accelerator
    handler = cb
    return { accelerator, registered: true }
  }

  if (previous) {
    try {
      globalShortcut.register(previous, cb)
      handler = cb
    } catch {
      current = null
      handler = null
    }
  }

  return {
    accelerator: previous ?? accelerator,
    registered: false,
    reason: `快捷键 ${accelerator} 注册失败，可能已被其它程序占用`
  }
}

/**
 * 依次尝试一组加速键，用第一个能注册成功的。
 * 默认组合很容易和别的软件撞车（实测 Ctrl+Alt+L 就被占用了），
 * 一旦注册失败，「完全穿透后解锁」就没有可用入口了，所以必须有兜底。
 */
export function registerWithFallback(
  candidates: string[],
  cb: () => void
): ShortcutResult & { usedFallback: boolean } {
  let last: ShortcutResult | null = null
  for (let i = 0; i < candidates.length; i++) {
    const result = registerToggle(candidates[i], cb)
    if (result.registered) {
      return { ...result, usedFallback: i > 0 }
    }
    last = result
  }
  return {
    accelerator: candidates[0] ?? '',
    registered: false,
    reason: last?.reason ?? '没有可用的全局快捷键',
    usedFallback: false
  }
}

export function getCurrent(): { accelerator: string; registered: boolean } {
  return {
    accelerator: current ?? '',
    registered: !!current && globalShortcut.isRegistered(current)
  }
}

export function disposeShortcuts(): void {
  globalShortcut.unregisterAll()
  current = null
  handler = null
}
