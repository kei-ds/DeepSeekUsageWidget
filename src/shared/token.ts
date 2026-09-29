/**
 * 登录态解包。
 *
 * 踩过的坑：platform.deepseek.com 的 localStorage['userToken'] **不是裸 token**，
 * 而是一个 JSON 字符串（实测形如 {"value":"<64位token>","__version":"0"}）。
 * 早期版本把整串直接当 Bearer token 发出去，服务端返回
 * `code: 40003 "Authorization Failed (invalid token)"`，
 * 表现为「一直刷新但没有数据」，并触发无休止的重新登录弹窗。
 *
 * 注意：preload / 登录窗口注入的 READ_TOKEN_JS 里有一份等价的 JS 实现（页面上下文里
 * 不能引用模块），两者行为必须保持一致，改动时请同步。
 */
export function extractToken(raw: unknown): string {
  let v = String(raw ?? '').trim()
  if (!v) return ''

  if (v.startsWith('{')) {
    try {
      const obj = JSON.parse(v) as Record<string, unknown>
      if (obj && typeof obj === 'object') {
        for (const key of ['value', 'token', 'userToken', 'accessToken', 'access_token']) {
          const cand = obj[key]
          if (typeof cand === 'string' && cand) {
            v = cand
            break
          }
        }
        // 兜底：没有已知字段名时取最长的字符串字段
        if (v.startsWith('{')) {
          const strs = Object.values(obj).filter((x): x is string => typeof x === 'string')
          if (strs.length) v = strs.reduce((a, b) => (b.length > a.length ? b : a), '')
        }
      }
    } catch {
      /* 不是合法 JSON，按原值返回 */
    }
  }

  return v.replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '')
}

/** localStorage 里候选取值的键名，按优先级排列。 */
export const TOKEN_STORAGE_KEYS: readonly string[] = [
  'userToken',
  'user_token',
  'token',
  'access_token',
  'accessToken',
  'ds_token'
]

/**
 * 埋点 SDK 的缓存键（__tea_* 等）里也存 JWT 形态的值。
 * 早期版本用「JWT 形态盲扫」兜底时抓到的正是它们，这是无效 token 的来源之一，必须排除。
 */
export const TOKEN_KEY_DENYLIST = /^(__tea|__appKit|_applog|smidV2)/i
