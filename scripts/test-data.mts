/**
 * 数据层纯函数测试：时区换算、载荷归一化、区间聚合。
 * 这些函数不依赖 Electron，可以脱离应用单独验证。
 *
 *   npm run test:data
 */
import { addDays, beijingToday, daysInRange, monthKeyOf, monthParams, monthsInRange } from '../src/main/deepseek/tz'
import { mergeDays, parseBalance, parseDays } from '../src/main/deepseek/normalize'
import { buildDataset, resolveRange } from '../src/main/deepseek/aggregate'
import { TOKEN_KEY_DENYLIST, TOKEN_STORAGE_KEYS, extractToken } from '../src/shared/token'
import type { DayRecord } from '../src/shared/types'

let passed = 0
let failed = 0

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.log(`  FAIL ${label}\n       期望 ${b}\n       实际 ${a}`)
  }
}

function ok(cond: boolean, label: string): void {
  eq(!!cond, true, label)
}

console.log('\n[tz] 北京时间与月份边界')
// 2025-01-01 00:30 UTC+8 == 2024-12-31 16:30 UTC
eq(beijingToday(Date.UTC(2024, 11, 31, 16, 30)), '2025-01-01', '跨年：UTC 还是 12/31，北京已是 1/1')
eq(beijingToday(Date.UTC(2024, 11, 31, 15, 59)), '2024-12-31', '差一分钟仍是北京的 12/31')
eq(beijingToday(Date.UTC(2024, 11, 31, 16, 0)), '2025-01-01', '整点跨入北京 1/1')
eq(addDays('2024-12-31', 1), '2025-01-01', 'addDays 跨年')
eq(addDays('2025-03-01', -1), '2025-02-28', 'addDays 回退跨月')
eq(daysInRange('2024-12-30', '2025-01-02'), ['2024-12-30', '2024-12-31', '2025-01-01', '2025-01-02'], 'daysInRange 跨年')
eq(monthsInRange('2024-12-20', '2025-01-05'), ['2024-12', '2025-01'], '跨年涉及 2 个月')
eq(monthsInRange('2024-11-15', '2025-01-05'), ['2024-11', '2024-12', '2025-01'], '跨年涉及 3 个月')
eq(monthKeyOf('2025-09-28'), '2025-09', 'monthKeyOf 零填充')
eq(monthParams('2025-09'), { month: '09', year: '2025' }, 'monthParams 零填充月份')

console.log('\n[normalize] 载荷解析')
const amountPayload = {
  days: [
    {
      date: '2025-09-27',
      data: [
        {
          model: 'deepseek-chat',
          usage: [
            { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '1000' },
            { type: 'PROMPT_CACHE_MISS_TOKEN', amount: 200 },
            { type: 'RESPONSE_TOKEN', amount: '30' },
            { type: 'REQUEST', amount: 7 },
            { type: 'SOME_FUTURE_TYPE', amount: 999 }
          ]
        }
      ]
    }
  ]
}
const amountDays = parseDays(amountPayload, 'amount')
eq(amountDays.length, 1, 'amount 解析出 1 天')
eq(amountDays[0].date, '2025-09-27', '日期正确')
eq(
  amountDays[0].totals,
  { cacheHit: 1000, cacheMiss: 200, response: 30, request: 7, cost: 0 },
  '字符串 amount 被转换，未知类型被忽略'
)

// cost 的 biz_data 是数组；REQUEST 类型必须被跳过，否则调用次数会被当成钱
const costPayload = [
  {
    days: [
      {
        date: '2025-09-27',
        data: [
          {
            model: 'deepseek-chat',
            usage: [
              { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '0.001' },
              { type: 'RESPONSE_TOKEN', amount: '0.002' },
              { type: 'REQUEST', amount: 999 }
            ]
          }
        ]
      }
    ]
  }
]
const costDays = parseDays(costPayload, 'cost')
eq(costDays[0].totals.cost, 0.003, 'cost 求和跳过 REQUEST')
eq(costDays[0].totals.request, 0, 'cost 载荷不产生 request 计数')

const merged = mergeDays([amountDays, costDays])
eq(merged.length, 1, '同一天被合并为一条')
eq(
  merged[0].totals,
  { cacheHit: 1000, cacheMiss: 200, response: 30, request: 7, cost: 0.003 },
  '合并后 token 与 cost 共存'
)

eq(parseDays({ days: [] }, 'amount'), [], '空月份返回空数组')
eq(parseDays(null, 'cost'), [], 'null 载荷不抛错')
eq(parseDays([], 'cost'), [], '空数组载荷不抛错')

console.log('\n[normalize] 余额')
eq(
  parseBalance({
    is_available: true,
    normal_wallets: [{ currency: 'CNY', balance: '100' }],
    bonus_wallets: [{ currency: 'CNY', balance: '10' }]
  }).wallets,
  [{ currency: 'CNY', normal: 100, bonus: 10, total: 110 }],
  '同日币种的充值/赠送钱包合并'
)
eq(parseBalance(undefined).wallets, [], '缺失载荷返回空钱包')

console.log('\n[aggregate] 区间与聚合')
const today = '2025-01-03'
eq(resolveRange({ kind: 'today' }, today), { start: today, end: today }, 'today 区间')
eq(resolveRange({ kind: 'last7' }, today), { start: '2024-12-28', end: today }, '近 7 日跨年')
eq(resolveRange({ kind: 'last30' }, today), { start: '2024-12-05', end: today }, '近 30 日跨年')
eq(resolveRange({ kind: 'day', date: '2024-11-09' }, today), { start: '2024-11-09', end: '2024-11-09' }, '单日区间')

function day(date: string, cost: number, hit: number, req: number, model = 'deepseek-chat'): DayRecord {
  return {
    date,
    models: { [model]: { cacheHit: hit, cacheMiss: 0, response: 0, request: req, cost } },
    totals: { cacheHit: hit, cacheMiss: 0, response: 0, request: req, cost }
  }
}

const allDays: DayRecord[] = [
  day('2024-12-30', 1, 100, 1),
  day('2024-12-31', 2, 200, 2),
  day('2025-01-01', 4, 400, 4, 'deepseek-reasoner'),
  day('2025-01-02', 8, 800, 8),
  day('2025-01-03', 16, 1600, 16)
]

const ds = buildDataset({ kind: 'last7' }, allDays, { today, fetchedAt: 111 })
eq(ds.range, { start: '2024-12-28', end: today }, 'last7 区间跨年')
eq(ds.totals.cost, 31, '近 7 日消费合计（含跨年数据）')
eq(ds.totals.cacheHit, 3100, '近 7 日 token 合计')
eq(ds.totals.request, 31, '近 7 日请求合计')
eq(ds.today.date, '2025-01-03', 'today 取北京时间当天')
eq(ds.today.totals.cost, 16, 'today 消费正确')
eq(ds.series.length, 7, '趋势序列补齐 7 天')
eq(ds.series[0], { date: '2024-12-28', cost: 0, tokens: 0, request: 0 }, '缺失日期补零而不是缺柱子')
eq(ds.series[6].cost, 16, '最后一天是今天')
eq(ds.balance, null, 'balance 占位为 null，由 service 回填')

const ds30 = buildDataset({ kind: 'last30' }, allDays, { today })
eq(ds30.totals.cost, 31, '近 30 日包含全部数据')

const dsDay = buildDataset({ kind: 'day', date: '2025-01-01' }, allDays, { today })
eq(dsDay.totals.cost, 4, '单日消费')
eq(dsDay.perModel[0].model, 'deepseek-reasoner', '单日按模型拆分')
eq(dsDay.today.totals.cost, 16, '筛选为过去某天时，today 仍返回当天数据')

// 按模型聚合：跨天合并同模型
const multiModel = buildDataset({ kind: 'last7' }, allDays, { today })
const chat = multiModel.perModel.find((m) => m.model === 'deepseek-chat')
const reasoner = multiModel.perModel.find((m) => m.model === 'deepseek-reasoner')
eq(chat?.cost, 27, 'chat 模型跨天合并消费')
eq(reasoner?.cost, 4, 'reasoner 模型消费')
eq(multiModel.perModel[0].model, 'deepseek-chat', '按 token 量降序排列')

console.log('\n[token] 登录态解包（真实 bug 的回归测试）')
// 平台真实存储形态：整串是 JSON，而不是裸 token。
// 直接把 JSON 当 Bearer 发出去会得到 40003 Authorization Failed (invalid token)。
// 下面用的是**构造的假 token**（64 位十六进制，非任何真实凭据），仅为还原结构。
const FAKE_TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const STORED_JSON_SHAPE = JSON.stringify({ value: FAKE_TOKEN, __version: '0' })
eq(
  extractToken(STORED_JSON_SHAPE),
  FAKE_TOKEN,
  '真实形态：从 {"value":..., "__version":"0"} 中取出 token'
)
ok(!extractToken(STORED_JSON_SHAPE).startsWith('{'), '解包结果不再以 { 开头（旧版本正是这里出错）')
eq(extractToken('plain-token-123'), 'plain-token-123', '裸 token 原样返回')
eq(extractToken('Bearer abc.def.ghi'), 'abc.def.ghi', '去掉 Bearer 前缀')
eq(extractToken('"quoted"'), 'quoted', '去掉包裹的引号')
eq(extractToken(''), '', '空串返回空')
eq(extractToken(null), '', 'null 返回空')
eq(extractToken(undefined), '', 'undefined 返回空')
eq(
  extractToken(JSON.stringify({ t: 'short', other: 'a-much-longer-value' })),
  'a-much-longer-value',
  '未知字段名时取最长字符串字段兜底'
)
eq(extractToken(JSON.stringify({ token: 'via-token-field' })), 'via-token-field', '识别 token 字段')
ok(
  TOKEN_KEY_DENYLIST.test('__tea_cache_tokens_20006841'),
  '埋点 SDK 的缓存键被列入黑名单（它们也存 JWT 形态的值）'
)
ok(TOKEN_KEY_DENYLIST.test('__appKit_userInfo'), 'appKit 键被排除')
ok(!TOKEN_KEY_DENYLIST.test('userToken'), 'userToken 不在黑名单里')
ok(TOKEN_STORAGE_KEYS.includes('userToken'), 'userToken 是首选候选键')

console.log('\n[normalize] PROMPT_TOKEN 必须被排除（聚合值，计入会翻倍）')
const withPrompt = parseDays(
  {
    days: [
      {
        date: '2025-09-27',
        data: [
          {
            model: 'deepseek-v4-flash',
            usage: [
              { type: 'PROMPT_TOKEN', amount: '1500' }, // = 1000 + 500，聚合占位
              { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '1000' },
              { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '500' },
              { type: 'RESPONSE_TOKEN', amount: '200' }
            ]
          }
        ]
      }
    ]
  },
  'amount'
)
eq(
  withPrompt[0].totals,
  { cacheHit: 1000, cacheMiss: 500, response: 200, request: 0, cost: 0 },
  'amount 侧 PROMPT_TOKEN 不计入任何分桶（否则输入 token 翻倍）'
)

const costWithPrompt = parseDays(
  {
    days: [
      {
        date: '2025-09-27',
        data: [
          {
            model: 'deepseek-v4-flash',
            usage: [
              { type: 'PROMPT_TOKEN', amount: '9.99' },
              { type: 'PROMPT_CACHE_HIT_TOKEN', amount: '0.001' },
              { type: 'PROMPT_CACHE_MISS_TOKEN', amount: '0.002' }
            ]
          }
        ]
      }
    ]
  },
  'cost'
)
eq(
  costWithPrompt[0].totals.cost,
  0.003,
  'cost 侧 PROMPT_TOKEN 被排除（含它会把输入侧费用加两遍）'
)

console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
process.exit(failed === 0 ? 0 : 1)
