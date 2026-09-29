/**
 * DeepSeek 平台接口的本地假服务器，用于在没有真实账号时跑通整条数据链路。
 *
 *   node scripts/mock-deepseek.mjs            # 监听 8787
 *   PORT=9000 MOCK_TOKEN=abc node scripts/mock-deepseek.mjs
 *
 * 然后把设置里的「接口地址」改成 http://127.0.0.1:8787，token 随便填 abc 即可。
 *
 * 可用的故障注入开关（用于验证错误处理路径）：
 *   MOCK_SCENARIO=auth      始终返回业务码 40002（登录态失效）
 *   MOCK_SCENARIO=http401   始终返回 HTTP 401
 *   MOCK_SCENARIO=badjson   返回一段 HTML 而不是 JSON
 *   MOCK_SCENARIO=empty     返回结构合法但没有数据（空月份/新账号）
 *   MOCK_SCENARIO=nullshape 返回 biz_data 为 null
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8787)
const TOKEN = process.env.MOCK_TOKEN || 'test123'
const SCENARIO = process.env.MOCK_SCENARIO || 'normal'

/** 确定性哈希：同一天同一模型每次生成相同数据，方便反复对照。 */
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick(seed, min, max) {
  const range = max - min + 1
  // 取模后再归一，避免有符号位移产生的负值把结果拉成负数
  return min + (((seed % range) + range) % range)
}

const MODELS = ['deepseek-chat', 'deepseek-reasoner']

/** 北京时间的今天。 */
function beijingToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

function daysOfMonth(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const today = beijingToday()
  const out = []
  for (let d = 1; d <= last; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // 未来日期不返回数据
    if (date <= today) out.push(date)
  }
  return out
}

/** 单日单模型的 token 与费用分解。 */
function dayModelUsage(date, model) {
  const seed = hash(`${date}|${model}`)
  const cacheHit = pick(seed, 0, 900_000)
  const cacheMiss = pick(seed >>> 3, 0, 120_000)
  const response = pick(seed >>> 7, 0, 60_000)
  const request = pick(seed >>> 11, 1, 120)

  // 价格按公开档位粗算，只为让数字量级看起来合理
  const isReasoner = model.includes('reasoner')
  const inMissRate = isReasoner ? 4 / 1_000_000 : 2 / 1_000_000
  const inHitRate = isReasoner ? 0.4 / 1_000_000 : 0.2 / 1_000_000
  const outRate = isReasoner ? 16 / 1_000_000 : 8 / 1_000_000

  const parts = [
    { type: 'PROMPT_CACHE_HIT_TOKEN', amount: cacheHit, cost: cacheHit * inHitRate },
    { type: 'PROMPT_CACHE_MISS_TOKEN', amount: cacheMiss, cost: cacheMiss * inMissRate },
    { type: 'RESPONSE_TOKEN', amount: response, cost: response * outRate },
    // REQUEST 是次数，cost 侧必须被忽略（客户端会跳过这个类型）
    { type: 'REQUEST', amount: request, cost: 999 }
  ]
  return { parts, request }
}

function buildMonth(year, month) {
  const amountDays = []
  const costDays = []

  for (const date of daysOfMonth(year, month)) {
    const amountData = []
    const costData = []
    for (const model of MODELS) {
      const { parts } = dayModelUsage(date, model)
      amountData.push({
        model,
        usage: parts.map((p) => ({ type: p.type, amount: p.amount }))
      })
      costData.push({
        model,
        usage: parts.map((p) => ({ type: p.type, amount: Number(p.cost.toFixed(8)) }))
      })
    }
    amountDays.push({ date, data: amountData })
    costDays.push({ date, data: costData })
  }

  // 注意：cost 接口的 biz_data 是数组，amount 是对象
  return { amount: { days: amountDays }, cost: [{ days: costDays }] }
}

function envelope(bizData, bizCode = 0) {
  return JSON.stringify({
    code: 0,
    msg: 'ok',
    data: { biz_code: bizCode, biz_data: bizData }
  })
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  console.log(`[mock-deepseek] ${req.method} ${url.pathname}${url.search}`)

  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (SCENARIO === 'http401') {
    res.statusCode = 401
    res.end(JSON.stringify({ code: 40101, msg: 'unauthorized' }))
    return
  }
  if (SCENARIO === 'badjson') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body>gateway error</body></html>')
    return
  }

  const auth = String(req.headers.authorization || '')
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token || (SCENARIO !== 'auth' && token !== TOKEN)) {
    res.end(envelope(null, 40002))
    return
  }
  if (SCENARIO === 'auth') {
    res.end(envelope(null, 40002))
    return
  }
  if (SCENARIO === 'nullshape') {
    res.end(envelope(null))
    return
  }
  if (SCENARIO === 'empty') {
    if (url.pathname.endsWith('/usage/cost')) res.end(envelope([{ days: [] }]))
    else if (url.pathname.endsWith('/usage/amount')) res.end(envelope({ days: [] }))
    else res.end(envelope({ is_available: true, normal_wallets: [], bonus_wallets: [] }))
    return
  }

  if (url.pathname === '/api/v0/users/get_user_summary') {
    res.end(
      envelope({
        is_available: true,
        normal_wallets: [{ currency: 'CNY', balance: '92.35' }],
        bonus_wallets: [{ currency: 'CNY', balance: '7.65' }]
      })
    )
    return
  }

  if (url.pathname === '/api/v0/usage/amount' || url.pathname === '/api/v0/usage/cost') {
    const year = Number(url.searchParams.get('year'))
    const month = Number(url.searchParams.get('month'))
    if (!year || !month) {
      res.end(envelope(null, 40001))
      return
    }
    const built = buildMonth(year, month)
    res.end(envelope(url.pathname.endsWith('/cost') ? built.cost : built.amount))
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ code: 40400, msg: 'not found' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-deepseek] 监听 http://127.0.0.1:${PORT}`)
  console.log(`[mock-deepseek] token = ${TOKEN}（在设置里填这个，或先在登录窗口登录后被自动覆盖）`)
  console.log(`[mock-deepseek] 场景 = ${SCENARIO}`)
  console.log(`[mock-deepseek] 北京时间今天 = ${beijingToday()}`)
})
