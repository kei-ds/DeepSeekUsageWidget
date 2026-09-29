/** DeepSeek 平台默认地址。可在设置里覆盖（本地假服务器用于测试）。 */
export const DEFAULT_BASE_URL = 'https://platform.deepseek.com'

/** 内嵌登录窗口使用的持久化 session 分区，保证 cookie/localStorage 跨重启存活。 */
export const LOGIN_PARTITION = 'persist:deepseek'

/**
 * 平台用量接口的 token 类型枚举 -> 展示分桶。
 *
 * PROMPT_TOKEN 是「输入 token 总量」，实测在全部样本里恒为 0（amount 与 cost 两侧都是），
 * 属于占位类型。但它语义上等于 命中 + 未命中，一旦平台开始填值就会造成重复计算，
 * 所以显式排除，而不是依赖「它现在是 0」。
 */
export const TOKEN_TYPE = {
  PROMPT: 'PROMPT_TOKEN',
  CACHE_HIT: 'PROMPT_CACHE_HIT_TOKEN',
  CACHE_MISS: 'PROMPT_CACHE_MISS_TOKEN',
  RESPONSE: 'RESPONSE_TOKEN',
  REQUEST: 'REQUEST'
} as const

/** 服务端返回这两个业务码表示登录态失效，需要重新登录。 */
export const AUTH_BIZ_CODES: readonly number[] = [40002, 40003]

/** 请求超时。 */
export const REQUEST_TIMEOUT_MS = 15_000

/** 数据层默认值。 */
export const DEFAULTS = {
  refreshIntervalMs: 120_000,
  hoverUnlockDelayMs: 600,
  hoverRelockDelayMs: 400,
  shortcut: 'CommandOrControl+Alt+L',
  window: { width: 900, height: 700, alwaysOnTop: true, opacity: 1, locked: false, visible: true }
} as const

/** 布局栅格列数。 */
export const GRID_COLUMNS = 12

/** 悬停轮询间隔（毫秒）——forward 转发不可靠时的兜底路径。 */
export const HOVER_POLL_MS = 120

/** 历史月份数据不再变化，缓存 24 小时。 */
export const PAST_MONTH_TTL_MS = 24 * 60 * 60 * 1000
