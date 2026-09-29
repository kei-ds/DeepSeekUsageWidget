import type {
  Buckets,
  DayPoint,
  DayRecord,
  Filter,
  ModelBuckets,
  UsageDataset
} from '@shared/types'
import { addDays, beijingToday, daysInRange } from './tz'
import { emptyBuckets, toModelBuckets } from './normalize'

/** 把筛选条件解析成闭区间日期。today 可注入以便测试。 */
export function resolveRange(filter: Filter, today: string = beijingToday()): { start: string; end: string } {
  switch (filter.kind) {
    case 'today':
      return { start: today, end: today }
    case 'last7':
      return { start: addDays(today, -6), end: today }
    case 'last30':
      return { start: addDays(today, -29), end: today }
    case 'day':
      return { start: filter.date, end: filter.date }
  }
}

export function emptyDay(date: string): DayRecord {
  return { date, models: {}, totals: emptyBuckets() }
}

/** 按日期闭区间切片（输入需已按日期升序）。 */
export function sliceRange(days: DayRecord[], start: string, end: string): DayRecord[] {
  return days.filter((d) => d.date >= start && d.date <= end)
}

/** 区间内某天的记录，缺失返回空记录（不是 null，省得调用方到处判空）。 */
export function findDay(days: DayRecord[], date: string): DayRecord {
  return days.find((d) => d.date === date) ?? emptyDay(date)
}

function sumBuckets(list: Buckets[]): Buckets {
  const t = emptyBuckets()
  for (const b of list) {
    t.cacheHit += b.cacheHit
    t.cacheMiss += b.cacheMiss
    t.response += b.response
    t.request += b.request
    t.cost += b.cost
  }
  return t
}

export function totalsOf(days: DayRecord[]): Buckets {
  return sumBuckets(days.map((d) => d.totals))
}

/** 区间内按模型聚合（跨天合并同模型）。 */
export function perModelOf(days: DayRecord[]): ModelBuckets[] {
  const merged: Record<string, Buckets> = {}
  for (const day of days) {
    for (const [model, b] of Object.entries(day.models)) {
      const cur = merged[model] ?? (merged[model] = emptyBuckets())
      cur.cacheHit += b.cacheHit
      cur.cacheMiss += b.cacheMiss
      cur.response += b.response
      cur.request += b.request
      cur.cost += b.cost
    }
  }
  return toModelBuckets(merged)
}

/**
 * 区间内逐日序列。缺数据的日期补零——否则趋势图会少柱子，
 * 看起来像那天没消费而不是没数据。
 */
export function seriesOf(days: DayRecord[], start: string, end: string): DayPoint[] {
  const map = new Map(days.map((d) => [d.date, d]))
  return daysInRange(start, end).map((date) => {
    const rec = map.get(date)
    if (!rec) return { date, cost: 0, tokens: 0, request: 0 }
    const t = rec.totals
    return {
      date,
      cost: t.cost,
      tokens: t.cacheHit + t.cacheMiss + t.response,
      request: t.request
    }
  })
}

/** 装配推送给渲染层的完整数据集。 */
export function buildDataset(
  filter: Filter,
  allDays: DayRecord[],
  opts: { today?: string; fetchedAt?: number; partial?: boolean } = {}
): UsageDataset {
  const todayDate = opts.today ?? beijingToday()
  const range = resolveRange(filter, todayDate)
  const scoped = sliceRange(allDays, range.start, range.end)

  return {
    filter,
    range,
    totals: totalsOf(scoped),
    perModel: perModelOf(scoped),
    series: seriesOf(allDays, range.start, range.end),
    today: findDay(allDays, todayDate),
    todayDate,
    // 余额由 service 单独拉取后回填（它和用量是两条独立的请求）
    balance: null,
    fetchedAt: opts.fetchedAt ?? Date.now(),
    partial: opts.partial ?? false
  }
}
