/**
 * 接口诊断：用已保存的登录态直接打三个平台接口，只输出状态码与信封结构。
 * 不会打印 token 本身，也不会输出用量明细，避免泄露。
 *
 *   npx electron scripts/diag-api.cjs
 */
const { app, safeStorage, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

function beijingNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '01'
  return { year: get('year'), month: get('month'), day: get('day') }
}

async function probe(url, token) {
  try {
    const res = await net.fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
    const text = await res.text()
    let summary
    try {
      const j = JSON.parse(text)
      summary = {
        http: res.status,
        code: j?.code,
        msg: j?.msg,
        biz_code: j?.data?.biz_code,
        biz_msg: j?.data?.biz_msg,
        biz_data_type: Array.isArray(j?.data?.biz_data)
          ? `array(${j.data.biz_data.length})`
          : j?.data?.biz_data === null
            ? 'null'
            : typeof j?.data?.biz_data,
        top_keys: j && typeof j === 'object' ? Object.keys(j).join(',') : null
      }
    } catch {
      summary = {
        http: res.status,
        body_not_json: true,
        body_head: text.slice(0, 120).replace(/\s+/g, ' '),
        content_type: res.headers.get('content-type')
      }
    }
    return summary
  } catch (err) {
    return { error: `${err.name}: ${err.message}` }
  }
}

/**
 * 裸脚本运行时 Electron 的 app 名默认是 "Electron"，userData 会指到 %APPDATA%\Electron，
 * 那样 safeStorage 读的是别的 Local State，密钥不对、解密必然失败。
 * 必须在 app ready 之前把 userData 指到挂件自己的目录。
 */
const USER_DATA = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'DeepSeekUsageWidget')
  : null
if (USER_DATA && fs.existsSync(USER_DATA)) {
  app.setPath('userData', USER_DATA)
}

app.whenReady().then(async () => {
  const cfgPath = path.join(app.getPath('userData'), 'config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const base = (cfg.baseUrl || 'https://platform.deepseek.com').replace(/\/+$/, '')
  const now = beijingNow()

  console.log(`配置: baseUrl=${base}  北京时间=${now.year}-${now.month}-${now.day}`)

  let token = null
  if (cfg.token?.stored) {
    try {
      token = cfg.token.encrypted
        ? safeStorage.decryptString(Buffer.from(cfg.token.stored, 'base64'))
        : cfg.token.stored
    } catch (err) {
      console.log('token 解密失败:', err.message)
    }
  }

  if (!token) {
    console.log('没有可用的已保存 token —— 需要先在应用里登录')
    app.quit()
    return
  }
  console.log(
    `token: 长度=${token.length} 形态=${token.split('.').length === 3 ? 'JWT(3段)' : '非JWT'} 前缀=${token.slice(0, 4)}…`
  )

  // 平台把登录态存成了 JSON 而不是裸 token。先解析出结构，再挑出真正能用的那个字段。
  let candidates = [{ label: '原始值', value: token }]
  if (token.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(token)
      console.log('\n解析为 JSON，顶层字段：')
      for (const [k, v] of Object.entries(obj)) {
        const desc =
          typeof v === 'string'
            ? `string(长度 ${v.length}${v ? ', 前缀 ' + v.slice(0, 4) + '…' : ''})`
            : `${typeof v}(${JSON.stringify(v)})`
        console.log(`    ${k}: ${desc}`)
      }
      // 字符串字段全部作为候选，按长度降序（token 通常最长）
      candidates = Object.entries(obj)
        .filter(([, v]) => typeof v === 'string' && v.length > 8)
        .map(([k, v]) => ({ label: `字段 ${k}`, value: v }))
        .sort((a, b) => b.value.length - a.value.length)
      if (!candidates.length) candidates = [{ label: '原始值', value: token }]
    } catch (err) {
      console.log('看起来像 JSON 但解析失败:', err.message)
    }
  }

  const urls = [
    `${base}/api/v0/users/get_user_summary`,
    `${base}/api/v0/usage/amount?month=${now.month}&year=${now.year}`,
    `${base}/api/v0/usage/cost?month=${now.month}&year=${now.year}`
  ]

  for (const cand of candidates) {
    console.log(`\n======== 用候选【${cand.label}】(长度 ${cand.value.length}) 测试`)
    for (const u of urls) {
      const r = await probe(u, cand.value)
      console.log(`  ${u.replace(base, '')}\n     ${JSON.stringify(r)}`)
    }
  }

  // 验证真实载荷的字段名：模型字段叫什么、usage 的 type 枚举有哪些
  const verifiedToken = candidates[0].value
  console.log('\n======== 真实载荷结构（用于核对 normalize.ts 的假设）')
  for (const [name, url] of [
    ['amount', `${base}/api/v0/usage/amount?month=${now.month}&year=${now.year}`],
    ['cost', `${base}/api/v0/usage/cost?month=${now.month}&year=${now.year}`]
  ]) {
    const res = await net.fetch(url, { headers: { Authorization: `Bearer ${verifiedToken}` } })
    const j = await res.json()
    let bd = j?.data?.biz_data
    if (Array.isArray(bd)) bd = bd[0]
    const days = bd?.days
    console.log(`  [${name}] days 类型=${Array.isArray(days) ? 'array(' + days.length + ')' : typeof days}`)
    if (!Array.isArray(days) || !days.length) continue
    const d = days[days.length - 1]
    console.log(`     day 字段: ${Object.keys(d).join(',')}`)
    const entries = d.data
    console.log(`     data 类型=${Array.isArray(entries) ? 'array(' + entries.length + ')' : typeof entries}`)
    if (!Array.isArray(entries) || !entries.length) continue
    console.log(`     entry 字段: ${Object.keys(entries[0]).join(',')}`)
    console.log(`     模型字段值: ${entries.map((e) => e.model ?? e.model_name ?? '(无 model 字段)').join(' | ')}`)
    const usages = entries[0].usage
    console.log(`     usage 类型=${Array.isArray(usages) ? 'array(' + usages.length + ')' : typeof usages}`)
    if (Array.isArray(usages) && usages.length) {
      console.log(`     usage[].type 枚举: ${usages.map((u) => u.type).join(' | ')}`)
      console.log(`     usage[].amount 类型: ${usages.map((u) => typeof u.amount).join(' | ')}`)

      // PROMPT_TOKEN 到底是「输入总量(=命中+未命中)」还是「另一类独立的输入」？
      // 这决定了它该不该计入求和——算错要么翻倍要么漏算。只看关系，不打印具体数值。
      const get = (t) => {
        const it = usages.find((u) => u.type === t)
        return it ? Number(it.amount) : null
      }
      const hit = get('PROMPT_CACHE_HIT_TOKEN')
      const miss = get('PROMPT_CACHE_MISS_TOKEN')
      const prompt = get('PROMPT_TOKEN')
      const resp = get('RESPONSE_TOKEN')
      if (hit != null && miss != null && prompt != null) {
        const sum = hit + miss
        const eq = Math.abs(sum - prompt) < 1e-9
        console.log(
          `     PROMPT_TOKEN == HIT + MISS ? ${eq}   (差值占比 ${(
            Math.abs(sum - prompt) / Math.max(prompt, 1e-9)
          ).toFixed(6)})`
        )
      }
      if (name === 'cost') {
        const withPrompt = [hit, miss, resp, prompt].filter((x) => x != null).reduce((a, b) => a + b, 0)
        const withoutPrompt = [hit, miss, resp].filter((x) => x != null).reduce((a, b) => a + b, 0)
        console.log(
          `     cost 含 PROMPT_TOKEN=${withPrompt.toFixed(6)}  不含=${withoutPrompt.toFixed(6)}  比值=${(
            withPrompt / Math.max(withoutPrompt, 1e-9)
          ).toFixed(4)}`
        )
      }
    }
  }

  // 全量核对 PROMPT_TOKEN 的语义：amount 侧应是 命中+未命中 的聚合；cost 侧应为占位 0。
  console.log('\n======== PROMPT_TOKEN 语义全量核对')
  for (const [name, url] of [
    ['amount', `${base}/api/v0/usage/amount?month=${now.month}&year=${now.year}`],
    ['cost', `${base}/api/v0/usage/cost?month=${now.month}&year=${now.year}`]
  ]) {
    const res = await net.fetch(url, { headers: { Authorization: `Bearer ${verifiedToken}` } })
    const j = await res.json()
    const bd = Array.isArray(j?.data?.biz_data) ? j.data.biz_data[0] : j?.data?.biz_data
    let total = 0
    let equal = 0
    let zero = 0
    let other = 0
    for (const day of bd?.days ?? []) {
      for (const entry of day.data ?? []) {
        const get = (t) => {
          const it = (entry.usage ?? []).find((u) => u.type === t)
          return it ? Number(it.amount) : null
        }
        const hit = get('PROMPT_CACHE_HIT_TOKEN')
        const miss = get('PROMPT_CACHE_MISS_TOKEN')
        const prompt = get('PROMPT_TOKEN')
        if (hit == null || miss == null || prompt == null) continue
        total++
        if (prompt === 0) zero++
        else if (Math.abs(hit + miss - prompt) < 1e-9) equal++
        else other++
      }
    }
    console.log(
      `  [${name}] 样本=${total}  等于 HIT+MISS=${equal}  为 0=${zero}  其它=${other}`
    )
  }

  app.quit()
})
