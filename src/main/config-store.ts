import { app, safeStorage } from 'electron'
import { join } from 'path'
import { DEFAULTS, DEFAULT_BASE_URL } from '@shared/constants'
import type { Config, TokenSource } from '@shared/types'
import { createDebouncedWriter, readJsonSafe } from './atomic-json'

export function defaultConfig(): Config {
  return {
    version: 1,
    window: { ...DEFAULTS.window },
    autostart: false,
    shortcut: DEFAULTS.shortcut,
    refreshIntervalMs: DEFAULTS.refreshIntervalMs,
    hoverUnlockDelayMs: DEFAULTS.hoverUnlockDelayMs,
    hoverRelockDelayMs: DEFAULTS.hoverRelockDelayMs,
    alwaysInteractiveStripHeight: 0,
    showResizeHandles: true,
    activeLayout: 'default',
    token: { stored: null, encrypted: false, manual: null, source: null },
    baseUrl: DEFAULT_BASE_URL
  }
}

/**
 * 只对已知的嵌套对象做深合并，避免用户数据里的任意对象把默认值污染掉。
 * 用户显式写入的值优先（含 false / 0）。
 */
function mergeConfig(base: Config, loaded: Partial<Config>): Config {
  const out: Config = { ...base, ...loaded }
  out.window = { ...base.window, ...(loaded.window ?? {}) }
  out.token = { ...base.token, ...(loaded.token ?? {}) }
  out.version = 1
  return out
}

const CONFIG_FILE = () => join(app.getPath('userData'), 'config.json')

class ConfigStore {
  private config: Config = defaultConfig()
  private writerRef: ReturnType<typeof createDebouncedWriter> | null = null
  private loaded = false

  /** 惰性创建：userData 路径依赖 app，不能在建模块时就取。 */
  private get writer(): ReturnType<typeof createDebouncedWriter> {
    if (!this.writerRef) this.writerRef = createDebouncedWriter(CONFIG_FILE(), 250)
    return this.writerRef
  }

  load(): Config {
    if (this.loaded) return this.config
    const raw = readJsonSafe<Partial<Config>>(CONFIG_FILE())
    this.config = raw ? mergeConfig(defaultConfig(), raw) : defaultConfig()
    this.loaded = true
    return this.config
  }

  get(): Config {
    if (!this.loaded) this.load()
    return this.config
  }

  patch(patch: Partial<Config>): Config {
    const current = this.get()
    const next = mergeConfig(current, patch)
    // token 分支单独合并，避免 patch 里少一个字段就把其余字段清空
    next.token = { ...current.token, ...(patch.token ?? {}) }
    this.config = next
    this.persist()
    return next
  }

  persist(): void {
    this.writer.schedule(() => this.config)
  }

  flush(): void {
    this.writer.flush()
  }

  // ---- token 存取（safeStorage 加密） ----

  setStoredToken(token: string | null, source: TokenSource | null): void {
    const cfg = this.get()
    if (!token) {
      this.patch({ token: { ...cfg.token, stored: null, encrypted: false, source: null } })
      return
    }
    let stored = token
    let encrypted = false
    try {
      if (safeStorage.isEncryptionAvailable()) {
        stored = safeStorage.encryptString(token).toString('base64')
        encrypted = true
      }
    } catch {
      // 加密不可用则退化为明文；绝不把 token 写进日志
    }
    this.patch({ token: { ...cfg.token, stored, encrypted, source } })
  }

  getStoredToken(source: TokenSource): string | null {
    const t = this.get().token
    if (!t.stored || t.source !== source) return null
    if (!t.encrypted) return t.stored
    try {
      return safeStorage.decryptString(Buffer.from(t.stored, 'base64'))
    } catch {
      // 换机器/换用户后无法解密，视为无 token
      return null
    }
  }

  getManualToken(): string | null {
    return this.get().token.manual || null
  }

  setManualToken(token: string | null): void {
    const cfg = this.get()
    this.patch({ token: { ...cfg.token, manual: token || null } })
  }
}

export const configStore = new ConfigStore()
