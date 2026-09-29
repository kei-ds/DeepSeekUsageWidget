/** 全局日期筛选状态。全应用唯一，所有模块共用同一口径。 */
export type Filter =
  | { kind: 'today' }
  | { kind: 'last7' }
  | { kind: 'last30' }
  | { kind: 'day'; date: string } // YYYY-MM-DD（北京时间）

/** 一组用量分桶。cost 为金额，其余为 token/次数。 */
export interface Buckets {
  cacheHit: number
  cacheMiss: number
  response: number
  request: number
  cost: number
}

export interface ModelBuckets extends Buckets {
  model: string
}

/** 单日归一化记录。 */
export interface DayRecord {
  date: string // YYYY-MM-DD
  models: Record<string, Buckets>
  totals: Buckets
}

export interface WalletInfo {
  currency: string
  normal: number // 充值余额
  bonus: number // 赠送余额
  total: number
}

export interface Balance {
  wallets: WalletInfo[]
  isAvailable: boolean | null
  fetchedAt: number
}

export interface DayPoint {
  date: string
  cost: number
  tokens: number // cacheHit + cacheMiss + response
  request: number
}

/** 推送给渲染层的一次查询结果（已按 filter 聚合完毕）。 */
export interface UsageDataset {
  filter: Filter
  range: { start: string; end: string }
  totals: Buckets
  perModel: ModelBuckets[]
  series: DayPoint[]
  today: DayRecord
  todayDate: string
  balance: Balance | null
  fetchedAt: number
  /** 数据是否完整（某些月份拉取失败时为 false，UI 可提示） */
  partial: boolean
}

export type UsageState = 'idle' | 'loading' | 'ok' | 'auth' | 'network' | 'api'

export interface UsageStatus {
  state: UsageState
  message?: string
}

export type TokenSource = 'session' | 'manual'

export interface AuthStatus {
  hasToken: boolean
  source: TokenSource | null
  lastChecked: number
  /** 登录窗口是否已打开（用户可能需要在其上登录） */
  loginWindowOpen: boolean
}

export interface WindowState {
  locked: boolean
  alwaysOnTop: boolean
  visible: boolean
  opacity: number
}

export interface AppInfo {
  version: string
  isPackaged: boolean
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Config {
  version: 1
  window: {
    x?: number
    y?: number
    width: number
    height: number
    alwaysOnTop: boolean
    opacity: number
    locked: boolean
    visible: boolean
  }
  autostart: boolean
  shortcut: string
  refreshIntervalMs: number
  hoverUnlockDelayMs: number
  hoverRelockDelayMs: number
  /** 顶部始终保持可点击的条带高度（px）。0 = 关闭（此时完全依赖悬停解锁）。 */
  alwaysInteractiveStripHeight: number
  /** 是否显示模块四角的缩放手柄图标。关掉只是隐藏图标，拖边缘仍可缩放。 */
  showResizeHandles: boolean
  activeLayout: string
  token: {
    /** safeStorage 加密后的 base64，或未加密时的明文 */
    stored: string | null
    encrypted: boolean
    /** 手动粘贴的兜底 token */
    manual: string | null
    source: TokenSource | null
  }
  baseUrl: string
}

export interface LayoutItem {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface Layout {
  version: 1
  updatedAt: number
  items: LayoutItem[]
}

/** preload 暴露给渲染进程的 API 形状。 */
export interface WidgetApi {
  config: {
    get(): Promise<Config>
    patch(patch: Partial<Config>): Promise<Config>
  }
  window: {
    getState(): Promise<WindowState>
    setLocked(locked: boolean): Promise<WindowState>
    setAlwaysOnTop(v: boolean): Promise<WindowState>
    setOpacity(v: number): Promise<WindowState>
    toggleVisible(): Promise<WindowState>
    hide(): Promise<void>
    minimize(): Promise<void>
    reportLockRect(rect: Rect): void
    requestInteractive(): void
    requestClickThrough(): void
    onState(cb: (s: WindowState) => void): () => void
  }
  auth: {
    openLogin(): Promise<AuthStatus>
    openLoginDevtools(): Promise<void>
    getStatus(): Promise<AuthStatus>
    setManualToken(token: string): Promise<AuthStatus>
    clearToken(): Promise<AuthStatus>
    dumpStorageKeys(): Promise<string[]>
    onChanged(cb: (s: AuthStatus) => void): () => void
  }
  usage: {
    refresh(force?: boolean): Promise<{ ok: boolean; fetchedAt: number }>
    query(filter: Filter): Promise<UsageDataset | null>
    onData(cb: (d: UsageDataset) => void): () => void
    onStatus(cb: (s: UsageStatus) => void): () => void
  }
  layout: {
    get(): Promise<Layout | null>
    save(layout: Layout): void
  }
  autostart: {
    get(): Promise<{ enabled: boolean; supported: boolean }>
    set(enabled: boolean): Promise<{ enabled: boolean; supported: boolean }>
  }
  shortcut: {
    get(): Promise<{ accelerator: string; registered: boolean; reason?: string }>
    set(
      accelerator: string
    ): Promise<{ accelerator: string; registered: boolean; reason?: string }>
  }
  app: {
    quit(): Promise<void>
    getInfo(): Promise<AppInfo>
  }
  ui: {
    onOpenSettings(cb: () => void): () => void
  }
}
