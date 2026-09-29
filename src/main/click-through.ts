import { screen, type BrowserWindow } from 'electron'
import { HOVER_POLL_MS } from '@shared/constants'
import type { Rect } from '@shared/types'
import { configStore } from './config-store'

/**
 * 锁定态（鼠标穿透）的状态机。
 *
 * 唯一的真相来源是两条：`locked`（用户按了锁定）和 `hovering`（光标正悬在解锁按钮上）。
 * **穿透 = locked && !hovering** —— 所有鼠标模式的切换都必须经过 sync()，
 * 不要在各处直接调 setIgnoreMouseEvents，否则很容易把条件写反。
 *
 * setIgnoreMouseEvents(true, { forward: true }) 里的 forward 让窗口在穿透状态下仍能收到
 * mousemove，这是「悬停解锁」的前提；但它的转发并非在所有 Windows/Electron 组合下都可靠，
 * 所以另有一条主进程轮询光标的兜底路径。
 */
export class ClickThroughController {
  private win: BrowserWindow | null = null
  private locked = false
  /** 锁定时光标悬停在解锁按钮上 → 临时恢复交互 */
  private hovering = false
  private lockRect: Rect | null = null
  private poll: NodeJS.Timeout | null = null
  private dwellTimer: NodeJS.Timeout | null = null
  private relockTimer: NodeJS.Timeout | null = null
  /** 已应用的鼠标模式；null 表示未知，下一次必定真正调用一次 API */
  private applied: boolean | null = null

  attach(win: BrowserWindow): void {
    this.win = win
    this.applied = null
    if (this.poll) clearInterval(this.poll)
    this.poll = setInterval(() => this.tick(), HOVER_POLL_MS)
    this.sync()
  }

  dispose(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    this.clearTimers()
    this.win = null
  }

  isLocked(): boolean {
    return this.locked
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    if (!locked) {
      this.clearTimers()
      this.hovering = false
    }
    this.sync()
  }

  /**
   * 窗口 show/hide 之后穿透状态不保证保持，需要强制重新应用一次。
   */
  reapply(): void {
    this.applied = null
    this.sync()
  }

  reportLockRect(rect: Rect): void {
    this.lockRect = rect
  }

  /** 快路径：渲染进程通过转发的 mousemove 报告光标进入了锁按钮。 */
  requestInteractive(): void {
    if (!this.locked) return
    this.beginDwell()
  }

  /** 快路径：渲染进程报告光标离开了锁按钮。 */
  requestClickThrough(): void {
    if (!this.locked) return
    this.cancelDwell()
    this.scheduleRelock()
  }

  /** 兜底路径：主进程轮询光标位置。 */
  private tick(): void {
    if (!this.locked || !this.win || this.win.isDestroyed()) return
    if (!this.win.isVisible()) return

    const bounds = this.win.getContentBounds()
    const pt = screen.getCursorScreenPoint()

    // 顶部常驻条带：进入即刻可交互，无需停留
    const strip = configStore.get().alwaysInteractiveStripHeight
    if (strip > 0) {
      const inStrip =
        pt.y >= bounds.y &&
        pt.y <= bounds.y + strip &&
        pt.x >= bounds.x &&
        pt.x <= bounds.x + bounds.width
      if (inStrip) {
        this.cancelRelock()
        this.setHovering(true)
        return
      }
    }

    const rect = this.lockRect
    if (!rect) return
    const inside =
      pt.x >= bounds.x + rect.x &&
      pt.x <= bounds.x + rect.x + rect.w &&
      pt.y >= bounds.y + rect.y &&
      pt.y <= bounds.y + rect.y + rect.h

    if (inside) {
      this.beginDwell()
    } else if (this.hovering) {
      this.cancelDwell()
      this.scheduleRelock()
    }
  }

  /** 需要悬停停留一段时间才恢复交互，避免扫过就误触。 */
  private beginDwell(): void {
    this.cancelRelock()
    if (this.hovering) return
    const delay = Math.max(0, configStore.get().hoverUnlockDelayMs)
    if (delay === 0) {
      this.setHovering(true)
      return
    }
    if (this.dwellTimer) return
    this.dwellTimer = setTimeout(() => {
      this.dwellTimer = null
      this.setHovering(true)
    }, delay)
  }

  private cancelDwell(): void {
    if (this.dwellTimer) clearTimeout(this.dwellTimer)
    this.dwellTimer = null
  }

  private cancelRelock(): void {
    if (this.relockTimer) clearTimeout(this.relockTimer)
    this.relockTimer = null
  }

  /** 光标离开后延迟一小会儿才恢复穿透，防抖（在按钮和弹层之间移动时）。 */
  private scheduleRelock(): void {
    if (!this.locked || !this.hovering) return
    this.cancelRelock()
    const delay = Math.max(0, configStore.get().hoverRelockDelayMs)
    if (delay === 0) {
      this.setHovering(false)
      return
    }
    this.relockTimer = setTimeout(() => {
      this.relockTimer = null
      this.setHovering(false)
    }, delay)
  }

  private setHovering(next: boolean): void {
    if (this.hovering === next) return
    this.hovering = next
    this.sync()
  }

  private clearTimers(): void {
    this.cancelDwell()
    this.cancelRelock()
  }

  /** 把「锁定 + 悬停」推导出的鼠标模式落到窗口上。 */
  private sync(): void {
    if (!this.win || this.win.isDestroyed()) return
    const interactive = !this.locked || this.hovering
    if (this.applied === interactive) return
    this.applied = interactive
    if (interactive) {
      this.win.setIgnoreMouseEvents(false)
    } else {
      this.win.setIgnoreMouseEvents(true, { forward: true })
    }
  }
}
