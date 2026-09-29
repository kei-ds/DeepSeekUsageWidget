/**
 * IPC 通道名的单一事实来源。主进程与 preload 都从这里引用，避免拼写漂移。
 */
export const CH = {
  // ---- 配置 ----
  CONFIG_GET: 'config:get',
  CONFIG_PATCH: 'config:patch',

  // ---- 窗口 ----
  WINDOW_GET_STATE: 'window:getState',
  WINDOW_SET_LOCKED: 'window:setLocked',
  WINDOW_SET_ALWAYS_ON_TOP: 'window:setAlwaysOnTop',
  WINDOW_SET_OPACITY: 'window:setOpacity',
  WINDOW_TOGGLE_VISIBLE: 'window:toggleVisible',
  WINDOW_HIDE: 'window:hide',
  WINDOW_MINIMIZE: 'window:minimize',
  /** 渲染进程上报锁定按钮的矩形（CSS px），供主进程悬停轮询命中判定 */
  WINDOW_REPORT_LOCK_RECT: 'window:reportLockRect',
  /** 快路径：渲染进程通过转发来的 mousemove 检测到光标进入/离开锁按钮 */
  WINDOW_REQUEST_INTERACTIVE: 'window:requestInteractive',
  WINDOW_REQUEST_CLICK_THROUGH: 'window:requestClickThrough',
  /** 主进程 -> 渲染进程：锁定/置顶/可见性变化 */
  WINDOW_STATE: 'window:state',

  // ---- 鉴权 ----
  AUTH_OPEN_LOGIN: 'auth:openLogin',
  AUTH_OPEN_LOGIN_DEVTOOLS: 'auth:openLoginDevtools',
  AUTH_GET_STATUS: 'auth:getStatus',
  AUTH_SET_MANUAL_TOKEN: 'auth:setManualToken',
  AUTH_CLEAR_TOKEN: 'auth:clearToken',
  AUTH_DUMP_STORAGE_KEYS: 'auth:dumpStorageKeys',
  AUTH_CHANGED: 'auth:changed',

  // ---- 用量数据 ----
  USAGE_REFRESH: 'usage:refresh',
  USAGE_QUERY: 'usage:query',
  USAGE_DATA: 'usage:data',
  USAGE_STATUS: 'usage:status',

  // ---- 布局 ----
  LAYOUT_GET: 'layout:get',
  LAYOUT_SAVE: 'layout:save',

  // ---- 开机自启 ----
  AUTOSTART_GET: 'autostart:get',
  AUTOSTART_SET: 'autostart:set',

  // ---- 全局快捷键 ----
  SHORTCUT_GET: 'shortcut:get',
  SHORTCUT_SET: 'shortcut:set',

  // ---- 应用 ----
  APP_QUIT: 'app:quit',
  APP_GET_INFO: 'app:getInfo',

  // ---- 主进程请求 UI 动作（托盘「设置」等）----
  UI_OPEN_SETTINGS: 'ui:openSettings'
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]
