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
/**
 * 关键：Electron 会给 fs 打补丁，使 readFileSync('xxx.asar') 去读**归档内部**而不是
 * 归档文件本身，于是抛 ENOENT。若把异常 catch 掉，asar 就会被静默跳过、
 * 得出「未发现泄露」的假结论——这个 bug 真实发生过（漏掉了整个 app.asar）。
 * original-fs 绕开该补丁，拿到的是磁盘上的原始字节。
 */
const origFs = require('original-fs')
const path = require('node:path')

// 裸脚本跑时 Electron 的 app 名是 "Electron"，userData 会指错目录，
// safeStorage 读不到本应用的 Local State 就无法解密。必须在 ready 之前纠正。
if (process.env.APPDATA) {
  const dir = path.join(process.env.APPDATA, 'DeepSeekUsageWidget')
  if (fs.existsSync(dir)) app.setPath('userData', dir)
}

// 可只扫描指定子目录：node scripts/scan-secrets.cjs release
// 默认扫「源码 + out/」——即真正会被打进产物的一切；
// 历史产物目录 dist/ release/ 默认跳过：它们是上一轮的输出，
// 若纳入扫描，一旦旧产物里有东西且被占用删不掉，构建就会被永久卡住。
const EXPLICIT = process.argv[2]
const ROOT = path.resolve(__dirname, '..', EXPLICIT || '.')
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.tmp',
  ...(EXPLICIT ? [] : ['dist', 'release'])
])
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
  const skipped = []
  let scanned = 0
  for (const file of walk(ROOT)) {
    let stat
    try {
      stat = origFs.statSync(file)
    } catch (err) {
      skipped.push({ file, why: `stat 失败: ${err.code || err.message}` })
      continue
    }
    if (stat.size === 0) continue
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push({ file, why: `超过扫描上限 (${stat.size} bytes)` })
      continue
    }
    // 二进制产物（exe / asar 等）同样要扫——泄露正是从那里出去的
    let buf
    try {
      buf = origFs.readFileSync(file)
    } catch (err) {
      // 绝不静默跳过：漏读一个文件就可能漏掉整个泄露
      skipped.push({ file, why: `读取失败: ${err.code || err.message}` })
      continue
    }
    scanned++
    for (const s of secrets) {
      if (buf.includes(s.value)) {
        hits.push({ file: path.relative(ROOT, file), label: s.label, kind: '完整匹配' })
        continue
      }
      // 前缀命中也要报：真实事故中写进代码的是凭据的**前 24 字符**（不是完整值），
      // 只查完整匹配会漏掉这类半截泄露。16 字符的随机重合概率极低，噪音可接受。
      for (const n of [24, 16]) {
        if (s.value.length > n && buf.includes(s.value.slice(0, n))) {
          hits.push({ file: path.relative(ROOT, file), label: s.label, kind: `前 ${n} 字符前缀` })
          break
        }
      }
    }
  }

  console.log(`[scan] 已扫描 ${scanned} 个文件`)
  if (skipped.length) {
    console.log(`[scan] 已跳过 ${skipped.length} 个文件（未读取，不计入结论）：`)
    for (const s of skipped.slice(0, 10)) {
      console.log(`   ${path.relative(ROOT, s.file)}  ← ${s.why}`)
    }
    if (skipped.length > 10) console.log(`   …还有 ${skipped.length - 10} 个`)
  }

  if (!hits.length) {
    console.log(`[scan] 未发现凭据泄露 ✓${skipped.length ? '（但存在被跳过的文件，结论不完整）' : ''}`)
    app.quit()
    return
  }

  console.error('\n[scan] ✗ 发现凭据泄露：')
  for (const h of hits) console.error(`   ${h.file}   ← ${h.label} / ${h.kind}`)
  console.error('\n请清理上述文件后重试。注意二进制产物需要重新构建。')
  console.error('（若某个文件被其它进程占用而删不掉，通常是杀软或索引器持有句柄，重启后再试）\n')
  process.exitCode = 1
  app.quit()
})
