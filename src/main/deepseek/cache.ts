import { PAST_MONTH_TTL_MS } from '@shared/constants'
import type { DayRecord } from '@shared/types'
import { fetchMonthAmount, fetchMonthCost } from './client'
import { mergeDays, parseDays } from './normalize'
import { beijingToday, monthKeyOf } from './tz'

interface MonthEntry {
  days: DayRecord[]
  fetchedAt: number
}

const cache = new Map<string, MonthEntry>()
const inflight = new Map<string, Promise<MonthEntry>>()

/** 当月数据会变，用刷新间隔做 TTL；历史月份数据不再变化，缓存很久。 */
function ttlFor(monthKey: string, refreshIntervalMs: number): number {
  return monthKey === monthKeyOf(beijingToday()) ? refreshIntervalMs : PAST_MONTH_TTL_MS
}

export function clearCache(): void {
  cache.clear()
}

async function loadMonth(
  baseUrl: string,
  token: string,
  monthKey: string,
  force: boolean,
  refreshIntervalMs: number
): Promise<MonthEntry> {
  const hit = cache.get(monthKey)
  const ttl = ttlFor(monthKey, refreshIntervalMs)
  if (!force && hit && Date.now() - hit.fetchedAt < ttl) return hit

  const existing = inflight.get(monthKey)
  if (existing && !force) return existing

  const job = (async (): Promise<MonthEntry> => {
    // amount 和 cost 并行拉，两个都成功才算这个月拿到数据
    const [amountRaw, costRaw] = await Promise.all([
      fetchMonthAmount(baseUrl, token, monthKey),
      fetchMonthCost(baseUrl, token, monthKey)
    ])
    const days = mergeDays([parseDays(amountRaw, 'amount'), parseDays(costRaw, 'cost')])
    const entry: MonthEntry = { days, fetchedAt: Date.now() }
    cache.set(monthKey, entry)
    return entry
  })()

  inflight.set(monthKey, job)
  try {
    return await job
  } finally {
    inflight.delete(monthKey)
  }
}

export interface MonthLoadResult {
  days: DayRecord[]
  partial: boolean
}

/**
 * 确保给定的月份都已加载（只拉缺失/过期的），再合并返回。
 * 切换 1→7→30 天时若月份都在缓存里，这里不会产生任何网络请求。
 * 月份列表由调用方给出，便于把「当前月」额外并进来（用于 Today 模块）。
 */
export async function ensureMonths(
  baseUrl: string,
  token: string,
  months: string[],
  refreshIntervalMs: number,
  force = false
): Promise<MonthLoadResult> {
  const results = await Promise.allSettled(
    months.map((m) => loadMonth(baseUrl, token, m, force, refreshIntervalMs))
  )

  // 鉴权错误直接上抛——重试其它月份没有意义
  for (const r of results) {
    if (r.status === 'rejected' && (r.reason as Error)?.name === 'AuthError') {
      throw r.reason
    }
  }

  const dayLists: DayRecord[][] = []
  let partial = false
  for (const r of results) {
    if (r.status === 'fulfilled') {
      dayLists.push(r.value.days)
    } else {
      partial = true
      console.warn('[cache] 某个月份拉取失败:', (r.reason as Error)?.message)
    }
  }

  return { days: mergeDays(dayLists), partial }
}
