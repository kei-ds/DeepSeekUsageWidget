import { TOKEN_TYPE } from '@shared/constants'
import type { Buckets, DayRecord, ModelBuckets } from '@shared/types'

export function emptyBuckets(): Buckets {
  return { cacheHit: 0, cacheMiss: 0, response: 0, request: 0, cost: 0 }
}

/** 接口的 amount 可能是字符串，统一转数字并容错。 */
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function bucketOf(type: string): keyof Buckets | null {
  switch (type) {
    case TOKEN_TYPE.CACHE_HIT:
      return 'cacheHit'
    case TOKEN_TYPE.CACHE_MISS:
      return 'cacheMiss'
    case TOKEN_TYPE.RESPONSE:
      return 'response'
    case TOKEN_TYPE.REQUEST:
      return 'request'
    // PROMPT_TOKEN 是 命中+未命中 的聚合值，单独计入会重复计算，必须跳过
    case TOKEN_TYPE.PROMPT:
      return null
    default:
      return null // 未知类型忽略，但不抛错
  }
}

/** 这些类型不参与 cost 求和：REQUEST 是调用次数（不是钱），PROMPT_TOKEN 是聚合占位。 */
const COST_EXCLUDED: readonly string[] = [TOKEN_TYPE.REQUEST, TOKEN_TYPE.PROMPT]

export function sumModels(models: Record<string, Buckets>): Buckets {
  const t = emptyBuckets()
  for (const b of Object.values(models)) {
    t.cacheHit += b.cacheHit
    t.cacheMiss += b.cacheMiss
    t.response += b.response
    t.request += b.request
    t.cost += b.cost
  }
  return t
}

/**
 * 从接口返回里挖出 days 数组。amount 接口是 {days:[...]}，
 * cost 接口的 biz_data 是数组（取第一个有 days 的元素）。空月份可能是 null/{}
 * 或空数组，这里全部容错为返回 []。
 */
function extractDays(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const days = extractDays(item)
      if (days.length) return days
    }
    return []
  }
  if (payload && typeof payload === 'object') {
    const days = (payload as { days?: unknown }).days
    if (Array.isArray(days)) return days
  }
  return []
}

/**
 * 解析一个月的 amount 或 cost 载荷。
 * - mode='amount'：按 type 累加到 token 分桶
 * - mode='cost'：把各 type 的 amount 当作金额累加到 cost（跳过 REQUEST，否则会把调用次数当钱加上去）
 */
export function parseDays(payload: unknown, mode: 'amount' | 'cost'): DayRecord[] {
  const out: DayRecord[] = []
  for (const raw of extractDays(payload)) {
    const d = raw as Record<string, unknown>
    const date = String(d?.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const models: Record<string, Buckets> = {}
    const entries = Array.isArray(d?.data) ? d.data : []
    for (const rawEntry of entries) {
      const e = rawEntry as Record<string, unknown>
      const model = String(e?.model ?? e?.model_name ?? e?.name ?? 'unknown')
      const b = models[model] ?? (models[model] = emptyBuckets())
      const usages = Array.isArray(e?.usage) ? e.usage : []
      for (const rawU of usages) {
        const u = rawU as Record<string, unknown>
        const type = String(u?.type ?? '')
        const amount = num(u?.amount)
        if (mode === 'amount') {
          const key = bucketOf(type)
          if (key) b[key] += amount
        } else {
          if (COST_EXCLUDED.includes(type)) continue
          b.cost += amount
        }
      }
    }
    out.push({ date, models, totals: sumModels(models) })
  }
  return out
}

/** 把若干个月的记录合并成按日期升序、去重累加的一份列表。 */
export function mergeDays(lists: DayRecord[][]): DayRecord[] {
  const byDate = new Map<string, DayRecord>()
  for (const list of lists) {
    for (const day of list) {
      let target = byDate.get(day.date)
      if (!target) {
        target = { date: day.date, models: {}, totals: emptyBuckets() }
        byDate.set(day.date, target)
      }
      for (const [model, b] of Object.entries(day.models)) {
        const cur = target.models[model] ?? (target.models[model] = emptyBuckets())
        cur.cacheHit += b.cacheHit
        cur.cacheMiss += b.cacheMiss
        cur.response += b.response
        cur.request += b.request
        cur.cost += b.cost
      }
    }
  }
  const out = [...byDate.values()]
  for (const d of out) d.totals = sumModels(d.models)
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}

/** 余额载荷归一化。 */
export function parseBalance(payload: unknown): {
  wallets: { currency: string; normal: number; bonus: number; total: number }[]
  isAvailable: boolean | null
} {
  const p = (payload ?? {}) as Record<string, unknown>
  const byCurrency = new Map<string, { normal: number; bonus: number }>()

  const collect = (arr: unknown, field: 'normal' | 'bonus'): void => {
    if (!Array.isArray(arr)) return
    for (const raw of arr) {
      const w = raw as Record<string, unknown>
      const currency = String(w?.currency ?? 'CNY') || 'CNY'
      const entry = byCurrency.get(currency) ?? { normal: 0, bonus: 0 }
      entry[field] += num(w?.balance)
      byCurrency.set(currency, entry)
    }
  }
  collect(p.normal_wallets, 'normal')
  collect(p.bonus_wallets, 'bonus')

  const wallets = [...byCurrency.entries()].map(([currency, v]) => ({
    currency,
    normal: v.normal,
    bonus: v.bonus,
    total: v.normal + v.bonus
  }))

  const isAvailable =
    typeof p.is_available === 'boolean' ? p.is_available : null

  return { wallets, isAvailable }
}

export function toModelBuckets(models: Record<string, Buckets>): ModelBuckets[] {
  return Object.entries(models)
    .map(([model, b]) => ({ model, ...b }))
    .sort((a, b) => b.cacheHit + b.cacheMiss + b.response - (a.cacheHit + a.cacheMiss + a.response))
}
