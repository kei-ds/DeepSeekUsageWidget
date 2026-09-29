import { reactive } from 'vue'
import type {
  AuthStatus,
  Config,
  Filter,
  Rect,
  UsageDataset,
  UsageStatus,
  WindowState
} from '@shared/types'
import { api } from './api'

/** GridBoard 暴露给模块组件的能力（模块在 GridBoard 组件树之外命令式挂载，只能这样回调）。 */
export interface BoardApi {
  add(id: string): void
  remove(id: string): void
}

interface State {
  ready: boolean
  config: Config | null
  window: WindowState
  auth: AuthStatus
  usage: UsageDataset | null
  status: UsageStatus
  filter: Filter
  settingsOpen: boolean
  addMenuOpen: boolean
  /** 主进程返回的错误/提示条 */
  notice: string | null
  appVersion: string
  isPackaged: boolean
  /** 当前已放置的模块 id 列表（由 GridBoard 同步过来，供添加菜单显示勾选态） */
  activeIds: string[]
}

const state = reactive<State>({
  ready: false,
  config: null,
  window: { locked: false, alwaysOnTop: true, visible: true, opacity: 1 },
  auth: { hasToken: false, source: null, lastChecked: 0, loginWindowOpen: false },
  usage: null,
  status: { state: 'idle' },
  filter: { kind: 'last7' },
  settingsOpen: false,
  addMenuOpen: false,
  notice: null,
  appVersion: '',
  isPackaged: false,
  activeIds: []
})

let board: BoardApi | null = null
let initialized = false

const unsubscribers: (() => void)[] = []

function setNotice(message: string | null): void {
  state.notice = message
}

async function refresh(force = true): Promise<void> {
  const res = await api.usage.refresh(force)
  if (!res.ok) {
    // 具体原因由 usage:status 事件给出，这里只兜底提示
    if (state.status.state === 'idle') setNotice('刷新失败')
  }
}

async function setFilter(filter: Filter): Promise<void> {
  state.filter = filter
  const data = await api.usage.query(filter)
  if (data) state.usage = data
}

async function patchConfig(patch: Partial<Config>): Promise<void> {
  state.config = await api.config.patch(patch)
  state.window = await api.window.getState()
}

async function toggleLock(): Promise<void> {
  const next = !state.window.locked
  const s = await api.window.setLocked(next)
  if (s) state.window = s
}

async function setAlwaysOnTop(v: boolean): Promise<void> {
  const s = await api.window.setAlwaysOnTop(v)
  if (s) state.window = s
  if (state.config) state.config.window.alwaysOnTop = v
}

async function setOpacity(v: number): Promise<void> {
  const s = await api.window.setOpacity(v)
  if (s) state.window = s
  if (state.config) state.config.window.opacity = v
}

async function toggleAutostart(): Promise<void> {
  if (!state.config) return
  const next = !state.config.autostart
  const res = await api.autostart.set(next)
  state.config.autostart = next
  if (!res.supported) {
    setNotice('开发模式下无法真正写入开机自启，请用打包后的安装版验证')
  }
}

async function setShortcut(accelerator: string): Promise<void> {
  const res = await api.shortcut.set(accelerator)
  if (state.config) state.config.shortcut = res.accelerator
  if (!res.registered) {
    setNotice(res.reason ?? '快捷键注册失败')
  } else {
    setNotice(null)
  }
}

async function setManualToken(token: string): Promise<void> {
  state.auth = await api.auth.setManualToken(token)
  setNotice(state.auth.hasToken ? '已保存手动 token' : '已清空 token')
  await refresh(true)
}

async function clearToken(): Promise<void> {
  state.auth = await api.auth.clearToken()
  state.usage = null
  setNotice('已清除登录态，请重新登录')
}

async function openLogin(): Promise<void> {
  state.auth = await api.auth.openLogin()
  setNotice('已打开 DeepSeek 登录窗口，登录完成后会自动读取登录态')
}

function reportLockRect(rect: Rect): void {
  api.window.reportLockRect(rect)
}

function requestInteractive(): void {
  api.window.requestInteractive()
}

function requestClickThrough(): void {
  api.window.requestClickThrough()
}

function registerBoard(api2: BoardApi | null): void {
  board = api2
}

function addModule(id: string): void {
  board?.add(id)
}

function removeModule(id: string): void {
  board?.remove(id)
}

function isModuleActive(id: string): boolean {
  return state.activeIds.includes(id)
}

function setActiveIds(ids: string[]): void {
  state.activeIds = [...ids]
}

async function init(): Promise<void> {
  if (initialized) return
  initialized = true

  unsubscribers.push(
    api.window.onState((s) => {
      state.window = s
    })
  )
  unsubscribers.push(
    api.auth.onChanged((s) => {
      state.auth = s
    })
  )
  unsubscribers.push(
    api.usage.onData((d) => {
      state.usage = d
    })
  )
  unsubscribers.push(
    api.usage.onStatus((s) => {
      state.status = s
      if (s.state === 'auth') setNotice(s.message ?? '登录态已失效')
      else if (s.state === 'network' || s.state === 'api') setNotice(s.message ?? '请求失败')
      else if (s.state === 'ok') setNotice(s.message ?? null)
    })
  )
  unsubscribers.push(
    api.ui.onOpenSettings(() => {
      state.settingsOpen = true
    })
  )

  const [config, winState, auth, info] = await Promise.all([
    api.config.get(),
    api.window.getState(),
    api.auth.getStatus(),
    api.app.getInfo()
  ])
  state.config = config
  if (winState) state.window = winState
  state.auth = auth
  state.appVersion = info.version
  state.isPackaged = info.isPackaged

  state.ready = true
  // 首次查询：把渲染层的默认筛选同步给主进程
  await setFilter(state.filter)
}

function dispose(): void {
  for (const un of unsubscribers) un()
  unsubscribers.length = 0
  initialized = false
}

export const store = {
  state,
  init,
  dispose,
  refresh,
  setFilter,
  patchConfig,
  toggleLock,
  setAlwaysOnTop,
  setOpacity,
  toggleAutostart,
  setShortcut,
  setManualToken,
  clearToken,
  openLogin,
  reportLockRect,
  requestInteractive,
  requestClickThrough,
  registerBoard,
  addModule,
  removeModule,
  isModuleActive,
  setActiveIds,
  setNotice
}

export type Store = typeof store
