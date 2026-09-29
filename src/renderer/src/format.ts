/** 金额：小额保留 4 位有效小数，避免 ¥0.00 看不出差别。 */
export function formatMoney(value: number, currency = 'CNY'): string {
  const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : `${currency} `
  const abs = Math.abs(value)
  const digits = abs === 0 ? 2 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2
  return `${symbol}${value.toFixed(digits)}`
}

/** token 数：用 K/M/B 缩写，卡片里放得下。 */
export function formatTokens(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString('zh-CN')
}

/** 'YYYY-MM-DD' -> 'MM-DD' */
export function shortDate(date: string): string {
  return date.slice(5)
}

export const FILTER_LABELS: Record<string, string> = {
  today: '今日',
  last7: '近 7 日',
  last30: '近 30 日'
}

export function describeFilter(filter: { kind: string; date?: string }): string {
  if (filter.kind === 'day') return filter.date ?? ''
  return FILTER_LABELS[filter.kind] ?? filter.kind
}
