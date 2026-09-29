import type { BrowserWindow } from 'electron'
import { CH } from '@shared/channels'
import type { Balance, Filter, UsageDataset, UsageStatus } from '@shared/types'
import { configStore } from '../config-store'
import { getAuthStatus, handleAuthFailure, onAuthChanged, resolveToken } from '../login-window'
import { ApiError, AuthError, fetchBalance } from './client'
import { ensureMonths } from './cache'
import { buildDataset, resolveRange } from './aggregate'
import { parseBalance } from './normalize'
import { beijingToday, monthKeyOf, monthsInRange } from './tz'

/** 默认看近 7 天：单日看不出趋势，而 Today 模块始终显示当天，不受筛选影响。 */
const DEFAULT_FILTER: Filter = { kind: 'last7' }

class UsageService {
  private win: BrowserWindow | null = null
  private filter: Filter = DEFAULT_FILTER
  private dataset: UsageDataset | null = null
  private balance: Balance | null = null
  private timer: NodeJS.Timeout | null = null
  private running = false
  private queued = false
  private unsubscribeAuth: (() => void) | null = null

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  init(): void {
    this.unsubscribeAuth = onAuthChanged(() => {
      this.send(CH.AUTH_CHANGED, getAuthStatus())
      // 拿到 token 后立刻拉一次，用户不用手动点刷新
      if (getAuthStatus().hasToken) void this.run(false)
    })
    this.restartTimer()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.unsubscribeAuth?.()
    this.unsubscribeAuth = null
  }

  restartTimer(): void {
    if (this.timer) clearInterval(this.timer)
    const interval = Math.max(15_000, configStore.get().refreshIntervalMs)
    this.timer = setInterval(() => void this.run(false), interval)
  }

  getFilter(): Filter {
    return this.filter
  }

  getDataset(): UsageDataset | null {
    return this.dataset
  }

  getBalance(): Balance | null {
    return this.balance
  }

  setFilter(filter: Filter): Promise<UsageDataset | null> {
    this.filter = filter
    // 切筛选走缓存，通常零网络请求
    return this.run(false)
  }

  refresh(force = true): Promise<UsageDataset | null> {
    return this.run(force)
  }

  /** 并发保护：正在跑时把请求合并成一次尾随调用。 */
  private async run(force: boolean): Promise<UsageDataset | null> {
    if (this.running) {
      this.queued = true
      return this.dataset
    }
    this.running = true
    try {
      return await this.doRun(force)
    } finally {
      this.running = false
      if (this.queued) {
        this.queued = false
        void this.run(force)
      }
    }
  }

  private async doRun(force: boolean): Promise<UsageDataset | null> {
    const cfg = configStore.get()
    this.send(CH.USAGE_STATUS, { state: 'loading' } satisfies UsageStatus)

    const resolved = await resolveToken()
    console.log(
      `[usage] 拉取开始 filter=${this.filter.kind} token=${resolved ? `有(${resolved.source})` : '无'} base=${cfg.baseUrl}`
    )
    if (!resolved) {
      this.send(CH.USAGE_STATUS, {
        state: 'auth',
        message: '尚未登录，请点击「登录」获取 DeepSeek 登录态'
      } satisfies UsageStatus)
      return null
    }

    const today = beijingToday()
    const range = resolveRange(this.filter, today)
    // 始终把「当前月」并进来，保证 Today 模块在任何筛选下都有数据
    const months = [...new Set([...monthsInRange(range.start, range.end), monthKeyOf(today)])]

    const [monthsResult, balanceResult] = await Promise.allSettled([
      ensureMonths(cfg.baseUrl, resolved.token, months, cfg.refreshIntervalMs, force),
      fetchBalance(cfg.baseUrl, resolved.token).then((raw) => ({
        ...parseBalance(raw),
        fetchedAt: Date.now()
      }))
    ])

    const authErr = [monthsResult, balanceResult].find(
      (r) => r.status === 'rejected' && (r.reason as Error)?.name === 'AuthError'
    )
    if (authErr && authErr.status === 'rejected') {
      handleAuthFailure()
      this.send(CH.USAGE_STATUS, {
        state: 'auth',
        message: '登录态已失效，已为你打开登录窗口，请重新登录'
      } satisfies UsageStatus)
      return null
    }

    if (monthsResult.status === 'rejected') {
      this.send(CH.USAGE_STATUS, this.describeError(monthsResult.reason) satisfies UsageStatus)
      return null
    }

    if (balanceResult.status === 'fulfilled') {
      this.balance = balanceResult.value
    }

    this.dataset = buildDataset(this.filter, monthsResult.value.days, {
      today,
      partial: monthsResult.value.partial,
      fetchedAt: Date.now()
    })
    this.dataset.balance = this.balance

    this.send(CH.USAGE_DATA, this.dataset)
    this.send(CH.USAGE_STATUS, {
      state: 'ok',
      message: monthsResult.value.partial ? '部分月份数据获取失败，统计可能不完整' : undefined
    } satisfies UsageStatus)
    return this.dataset
  }

  private describeError(err: unknown): UsageStatus {
    if (err instanceof AuthError) return { state: 'auth', message: err.message }
    if (err instanceof ApiError) return { state: 'api', message: err.message }
    return { state: 'network', message: (err as Error)?.message || '网络请求失败' }
  }

  private send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload)
    }
  }
}

export const usageService = new UsageService()
