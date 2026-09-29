/**
 * 密钥泄露扫描。
 *
 * 由来：曾经在写测试用例时，把从诊断输出里看到的字符串碎片拼成了**真实的 userToken**
 * 写进源码，而 electron-builder 的 `files: out/**\/*` 又把测试打包产物一起打进了 asar，
 * 导致 exe 里嵌入了真实凭据。
 *
 * 这个脚本用 Electron 的 safeStorage 解密本机保存的真实登录态，然后在工作区里
 * 全文检索这些值——精确匹配，零误报。配合 `npm run dist` 在打包前执行，
 * 可以保证发布产物里不含本机凭据。
 *
 *   npm run scan          # 只扫描
 *   SCAN_STRICT=1 ...     # 命中时以非零退出码结束（用于 CI / 打包前置检查）
 */
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// 裸脚本跑时 Electron 的 app 名是 "Electron"，userData 会指错目录，
// safeStorage 读不到本应用的 Local State 就无法解密。必须在 ready 之前纠正。
if (process.env.APPDATA) {
  const dir = path.join(process.env.APPDATA, 'DeepSeekUsageWidget')
  if (fs.existsSync(dir)) app.setPath('userData', dir)
}

// 可只扫描指定子目录：node scripts/scan-secrets.cjs release
// （整树扫描是默认行为；指定目录用于打包产物另存到别处时做定向校验）
const ROOT = path.resolve(__dirname, '..', process.argv[2] || '.')
const SKIP_DIRS = new Set(['node_modules', '.git', '.tmp'])
const BINARY_EXT = /\.(exe|dll|node|png|jpg|ico|icns|asar|zip|7z|pak|bin)$/i
/** 单文件扫描上限，避免读入几百 MB 的产物把内存打满。 */
const MAX_FILE_BYTES = 300 * 1024 * 1024

function userDataDir() {
  const appData = process.env.APPDATA
  if (appData) {
    const p = path.join(appData, 'DeepSeekUsageWidget')
    if (fs.existsSync(p)) return p
  }
  return null
}

/** 收集本机所有「不该出现在代码里」的敏感值。 */
function collectSecrets() {
  const secrets = []
  const dir = userDataDir()
  if (!dir) return secrets
  const cfgPath = path.join(dir, 'config.json')
  if (!fs.existsSync(cfgPath)) return secrets

  let cfg
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  } catch {
    return secrets
  }

  const add = (value, label) => {
    const v = String(value ?? '').trim()
    // 太短的值检索起来全是噪音（例如空串、1~2 个字符）
    if (v.length >= 12) secrets.push({ label, value: v })
  }

  try {
    if (cfg.token?.stored) {
      const raw = cfg.token.encrypted
        ? safeStorage.decryptString(Buffer.from(cfg.token.stored, 'base64'))
        : cfg.token.stored
      // 存的是解包后的 token，但早期版本存过整串 JSON，两种都扫
      add(raw, '已保存的会话 token')
      if (raw.startsWith('{')) {
        try {
          const o = JSON.parse(raw)
          add(o.value, '会话 token 的 value 字段')
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.log(`  (无法解密已存 token，跳过: ${err.message})`)
  }
  add(cfg.token?.manual, '手动粘贴的 token')
  return secrets
}

function* walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      yield* walk(path.join(dir, e.name))
    } else if (e.isFile()) {
      yield path.join(dir, e.name)
    }
  }
}

app.whenReady().then(() => {
  const secrets = collectSecrets()
  if (!secrets.length) {
    console.log('[scan] 本机没有可检索的凭据（未登录或配置不存在），跳过')
    app.quit()
    return
  }
  console.log(`[scan] 用 ${secrets.length} 个本机凭据检索工作区…`)

  const hits = []
  let scanned = 0
  for (const file of walk(ROOT)) {
    let stat
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    if (stat.size > MAX_FILE_BYTES || stat.size === 0) continue
    // 二进制产物（exe/asar 等）同样要扫——泄露正是从那里出去的
    let buf
    try {
      buf = fs.readFileSync(file)
    } catch {
      continue
    }
    scanned++
    for (const s of secrets) {
      if (buf.includes(s.value)) {
        hits.push({ file: path.relative(ROOT, file), label: s.label })
      }
    }
  }

  console.log(`[scan] 已扫描 ${scanned} 个文件`)
  if (!hits.length) {
    console.log('[scan] 未发现凭据泄露 ✓')
    app.quit()
    return
  }

  console.error('\n[scan] ✗ 发现凭据泄露：')
  for (const h of hits) console.error(`   ${h.file}   ← ${h.label}`)
  console.error('\n请清理上述文件后重试。注意二进制产物需要重新构建。\n')
  process.exitCode = 1
  app.quit()
})
