/**
 * 时间处理一律按北京时间（UTC+8）。不信任本机时区——用户可能在别的时区，
 * 而 DeepSeek 平台的「今天」和月份边界都按北京时间切分。
 */

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const pad = (n: number): string => String(n).padStart(2, '0')

/** 当前北京时间日期，格式 YYYY-MM-DD。可注入 now 以便测试。 */
export function beijingToday(now: number = Date.now()): string {
  const parts = PARTS.formatToParts(new Date(now))
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** 日历日加减。纯日期运算，不涉及时区。 */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** 闭区间日期列表，升序。 */
export function daysInRange(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  // 加个上限防御，避免 start > end 时死循环
  for (let i = 0; i < 400 && cur <= end; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export const monthKeyOf = (date: string): string => date.slice(0, 7)

/** 闭区间涉及的月份键列表，升序。跨年（12月→1月）也要正确。 */
export function monthsInRange(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = start.slice(0, 7).split('-').map(Number)
  const [ey, em] = end.slice(0, 7).split('-').map(Number)
  for (let i = 0; i < 120 && (y < ey || (y === ey && m <= em)); i++) {
    out.push(`${y}-${pad(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** 'YYYY-MM' -> 接口需要的 { month, year }（month 零填充）。 */
export function monthParams(monthKey: string): { month: string; year: string } {
  const [year, month] = monthKey.split('-')
  return { month, year }
}
