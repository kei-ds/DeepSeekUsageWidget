import { BrowserWindow } from 'electron'
import { LOGIN_PARTITION } from '@shared/constants'
import { extractToken } from '@shared/token'
import type { AuthStatus, TokenSource } from '@shared/types'
import { configStore } from './config-store'

const SIGN_IN_URL = 'https://platform.deepseek.com/sign_in'
const TOKEN_REREAD_MS = 5 * 60 * 1000
const POLL_MS = 1500
const POLL_MAX_MS = 3 * 60 * 1000

let loginWin: BrowserWindow | null = null
let rereadTimer: NodeJS.Timeout | null = null
let pollTimer: NodeJS.Timeout | null = null
let pollDeadline = 0
let lastChecked = 0

const listeners = new Set<(s: AuthStatus) => void>()

function notify(): void {
  const status = getAuthStatus()
  for (const cb of listeners) {
    try {
      cb(status)
    } catch (err) {
      console.warn('[login] 监听器异常:', (err as Error).message)
    }
  }
}

export function onAuthChanged(cb: (s: AuthStatus) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 页面读取逻辑。解包规则必须与 shared/token.ts 的 extractToken 保持一致。 */
const READ_TOKEN_JS = `(() => {
  const CANDIDATES = ['userToken','user_token','token','access_token','accessToken','ds_token'];
  const unwrap = (raw) => {
    let v = String(raw == null ? '' : raw).trim();
    if (!v) return '';
    if (v[0] === '{') {
      try {
        const o = JSON.parse(v);
        if (o && typeof o === 'object') {
          for (const k of ['value','token','userToken','accessToken','access_token']) {
            if (typeof o[k] === 'string' && o[k]) { v = o[k]; break; }
          }
          if (v[0] === '{') {
            const strs = Object.values(o).filter((x) => typeof x === 'string');
            if (strs.length) v = strs.reduce((a, b) => (b.length > a.length ? b : a), '');
          }
        }
      } catch (e) {}
    }
    return v.replace(/^Bearer\\s+/i, '').replace(/^"|"$/g, '');
  };
  const ls = window.localStorage;
  for (const k of CANDIDATES) {
    const v = unwrap(ls.getItem(k));
    if (v) return { key: k, value: v };
  }
  // 兜底：key 名含 token 的。必须排除埋点 SDK 的缓存键——__tea_* 之类也存 JWT 形态的值，
  // 早期版本按 JWT 形态盲扫时抓到的正是它们，那才是发出无效 token 的根源。
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i) || '';
    if (!/token/i.test(k)) continue;
    if (/^(__tea|__appKit|_applog|smidV2)/i.test(k)) continue;
    const v = unwrap(ls.getItem(k));
    if (v && v.length > 16) return { key: k, value: v };
  }
  return null;
})()`

async function readTokenFromPage(): Promise<{ key: string; value: string } | null> {
  if (!loginWin || loginWin.isDestroyed()) return null
  try {
    const res = await loginWin.webContents.executeJavaScript(READ_TOKEN_JS, true)
    if (res && typeof res.value === 'string' && res.value) return res as { key: string; value: string }
    return null
  } catch {
    return null
  }
}

/** 从页面读一次 token 并落盘。返回是否拿到了。 */
async function captureToken(): Promise<boolean> {
  lastChecked = Date.now()
  const found = await readTokenFromPage()
  if (!found) return false

  const token = extractToken(found.value)
  if (!token) return false

  const existing = configStore.getStoredToken('session')
  if (existing !== token) {
    configStore.setStoredToken(token, 'session')
    console.log(`[login] 已获取登录态 (localStorage key = ${found.key}, 长度 ${token.length})`)
    // 只在 token 真正变化时通知：轮询期间每次都通知会让数据层被反复触发去拉接口
    notify()
  }
  return true
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 登录是个 SPA，跳转后 token 才异步写进 localStorage，所以在时间窗内轮询。 */
function startPolling(): void {
  stopPolling()
  pollDeadline = Date.now() + POLL_MAX_MS
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) {
      stopPolling()
      return
    }
    if (await captureToken()) {
      stopPolling()
      hideLoginWindow()
    }
  }, POLL_MS)
}

function startReread(): void {
  if (rereadTimer) clearInterval(rereadTimer)
  // 页面常驻（隐藏状态）时 SPA 会自行刷新 localStorage 里的 token，
  // 定期重读就相当于自动续期。
  rereadTimer = setInterval(() => {
    void captureToken()
  }, TOKEN_REREAD_MS)
}

export function createLoginWindow(show = true): BrowserWindow {
  if (loginWin && !loginWin.isDestroyed()) {
    if (show) {
      loginWin.show()
      loginWin.focus()
    }
    return loginWin
  }

  loginWin = new BrowserWindow({
    width: 1000,
    height: 760,
    title: 'DeepSeek 登录',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      partition: LOGIN_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 隐藏时也要让页面继续跑，否则 SPA 不会刷新 token
      backgroundThrottling: false
    }
  })

  loginWin.once('ready-to-show', () => {
    if (show) loginWin?.show()
  })

  loginWin.webContents.on('did-finish-load', () => {
    startPolling()
  })

  loginWin.webContents.on('did-navigate', () => {
    startPolling()
  })

  loginWin.webContents.on('did-navigate-in-page', () => {
    startPolling()
  })

  loginWin.on('closed', () => {
    loginWin = null
    stopPolling()
    notify()
  })

  void loginWin.loadURL(SIGN_IN_URL)
  startReread()
  return loginWin
}

export function showLoginWindow(): BrowserWindow {
  const win = createLoginWindow(true)
  win.show()
  win.focus()
  return win
}

export function hideLoginWindow(): void {
  if (loginWin && !loginWin.isDestroyed()) loginWin.hide()
  notify()
}

export function isLoginWindowOpen(): boolean {
  return !!loginWin && !loginWin.isDestroyed()
}

/** 强制刷新页面——当 token 明显失效、重读也拿不到时用。 */
export function reloadLoginWindow(): void {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.webContents.reload()
  }
}

export function openLoginDevtools(): void {
  const win = createLoginWindow(true)
  win.webContents.openDevTools({ mode: 'detach' })
}

/** Phase 0 自查用：列出 localStorage 的所有 key，确认真实的 token key 名。 */
export async function dumpStorageKeys(): Promise<string[]> {
  const target = createLoginWindow(true)
  try {
    return (await target.webContents.executeJavaScript('Object.keys(window.localStorage)', true)) as string[]
  } catch {
    return []
  }
}

export function disposeLoginWindow(): void {
  stopPolling()
  if (rereadTimer) {
    clearInterval(rereadTimer)
    rereadTimer = null
  }
  if (loginWin && !loginWin.isDestroyed()) loginWin.destroy()
  loginWin = null
}

/**
 * 解析当前可用的 token。优先级：常驻登录窗口的实时会话 token > 落盘的会话 token > 手动粘贴。
 */
export async function resolveToken(): Promise<{ token: string; source: TokenSource } | null> {
  if (isLoginWindowOpen()) {
    const found = await readTokenFromPage()
    if (found) {
      const token = extractToken(found.value)
      if (token) {
        lastChecked = Date.now()
        if (configStore.getStoredToken('session') !== token) {
          configStore.setStoredToken(token, 'session')
        }
        return { token, source: 'session' }
      }
    }
  }
  const stored = configStore.getStoredToken('session')
  if (stored) {
    // 自愈：早期版本把 localStorage 的原始 JSON 整串存了进来，
    // 这里再解包一次并覆盖回去，用户无需重新登录。
    const token = extractToken(stored)
    if (token) {
      if (token !== stored) {
        console.log('[login] 检测到旧格式的已存 token，已自动修正')
        configStore.setStoredToken(token, 'session')
      }
      return { token, source: 'session' }
    }
  }
  const manual = configStore.getManualToken()
  if (manual) return { token: manual, source: 'manual' }
  return null
}

export function getAuthStatus(): AuthStatus {
  const manual = configStore.getManualToken()
  const stored = configStore.getStoredToken('session')
  const source: TokenSource | null = stored ? 'session' : manual ? 'manual' : null
  return {
    hasToken: !!source,
    source,
    lastChecked,
    loginWindowOpen: isLoginWindowOpen()
  }
}

/** 手动粘贴 token。 */
export function setManualToken(token: string): AuthStatus {
  configStore.setManualToken(token.trim() || null)
  notify()
  return getAuthStatus()
}

/** 清除登录态（含 session 分区里的 cookie，让下次是干净登录）。 */
export async function clearAuth(): Promise<AuthStatus> {
  configStore.setStoredToken(null, null)
  configStore.setManualToken(null)
  if (loginWin && !loginWin.isDestroyed()) {
    await loginWin.webContents.session.clearStorageData({ storages: ['localstorage', 'cookies'] })
  }
  notify()
  return getAuthStatus()
}

let autoShownLogin = false

/**
 * 会话 token 失效时调用。
 *
 * 这里刻意**不**无条件弹出登录窗口：早期实现每次鉴权失败都 show，
 * 于是窗口被关掉又立刻弹回来，用户感觉「关不掉」，而且会陷入
 * 失败→弹窗→关闭→再失败的循环。现在只在「完全没有登录态」的首次配置场景
 * 自动打开一次；已有 token 但被拒时，交给界面上的提示横幅与托盘菜单去触发重登。
 */
export function handleAuthFailure(): void {
  if (getAuthStatus().hasToken) return
  if (autoShownLogin) return
  autoShownLogin = true
  showLoginWindow()
  void captureToken()
}

export function getLoginSession() {
  return loginWin && !loginWin.isDestroyed() ? loginWin.webContents.session : null
}
