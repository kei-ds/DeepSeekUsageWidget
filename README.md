# DeepSeek 用量桌面挂件

常驻桌面最上层的无边框小挂件，用来实时查看 DeepSeek 账号的**余额**与 **token 用量**。支持点击锁定后**鼠标穿透**（不影响下层窗口操作），模块可自由增删、拖拽排列。

技术栈：Electron 33 + Vue 3 + GridStack 11，零原生依赖。

---

## 功能

- **余额**：充值余额 / 赠送余额 / 合计（按币种）
- **今日消费**：北京时间当天的消费金额、缓存命中 / 未命中 / 输出 token、请求次数
- **日期筛选**：今日 / 近 7 日 / 近 30 日 / 指定单日，全局统一口径
- **按模型明细**：各模型的 token 与消费拆分
- **请求次数**：今日 / 区间 / 日均
- **用量趋势**：逐日柱状图，可切换「消费 / Token」两种口径
- **模块系统**：每个模块可添加、移除，拖标题栏重排，拖边缘缩放
- **鼠标穿透**：锁定后点击穿透到下层窗口；三种解锁方式（见下）
- **开机自启**：安装版可用，开机静默启动到托盘
- 窗口置顶、透明度、刷新间隔、快捷键均可配置

## 环境要求

- Windows 10 / 11（当前仅针对 Windows 打包）
- Node.js 18+（开发用；构建机器实测 Node 24 可用）

---

## 快速开始

```bash
npm install

# 用本地假服务器联调（无需真实账号）
npm run mock          # 终端 A：假服务器监听 127.0.0.1:8787
npm run dev           # 终端 B：启动应用
#   1. 「设置 → 数据 → 接口地址」填 http://127.0.0.1:8787
#   2. 「设置 → 登录状态 → 清除登录态」（重要：会话 token 优先级高于手动 token，
#      若已登录过真实账号，不清掉的话仍然会去打真实接口）
#   3. 「设置 → 登录状态 → 手动粘贴 token」填 test123（假服务器的固定 token）

# 或者直接用真实账号
npm run dev           # 启动后在「设置 → 登录状态」点「打开登录窗口」，登录一次即可
```

> 开发模式下**窗口不置顶**（避免调试窗口压在最上层妨碍干别的活），需要验证置顶效果时在设置或托盘菜单里手动打开。

### 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式启动（渲染层热更新、主进程自动重启） |
| `npm run build` | 仅构建到 `out/`，不打包 |
| `npm run start` | 预览构建产物 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test:data` | 数据层纯函数测试（59 项，无需账号） |
| `npm run mock` | 启动本地假 DeepSeek 服务器 |
| `npm run diag` | 接口诊断：用已存登录态打三个接口，打印状态码与字段结构（**不输出 token 和用量明细**） |
| `npm run icon` | 生成 `build/icon.png` 应用图标 |
| `npm run dist` | 打包出 NSIS 安装包 + 免安装版 |
| `npm run dist:portable` | 只打包免安装版 |

---

## 使用说明

### 首次登录

1. 打开应用 → 「设置 → 登录状态 → 打开登录窗口」
2. 在弹出的窗口里登录 platform.deepseek.com
3. 登录成功后程序自动读取登录态，窗口自动隐藏——**不需要手动关闭**

登录态会加密保存在本地，并靠常驻的隐藏登录窗口自动续期。token 失效时界面顶部会出现提示横幅，点「打开登录」重新登录即可——**不会反复弹窗**（只有完全未登录时才会自动打开一次）。

登录窗口带正常标题栏，可以直接关掉；关掉后若要重新打开，用「设置 → 打开登录窗口」或托盘菜单的「登录 / 重新登录」。

> 「设置 → 登录状态 → 查看 localStorage keys」可以列出页面的所有存储键，用于排查登录态问题。

### 锁定与鼠标穿透

点顶栏的「锁定」按钮 → 按钮变黄，此后鼠标点击**穿透到下层窗口**，挂件不拦截任何操作。

解锁方式（三种）：

| 方式 | 说明 |
|---|---|
| 悬停解锁 | 鼠标移到锁定按钮上停留约 0.6 秒自动恢复交互，移开后重新穿透（延迟可配置） |
| 全局快捷键 | 默认 `Ctrl+Alt+L`；被占用时会自动回退到 `Ctrl+Alt+D` 等备选组合，可在设置里改 |
| 托盘菜单 | 托盘图标右键 → 「解锁（恢复交互）」 |

托盘图标左键单击可切换窗口显示/隐藏。**点窗口的 × 是隐藏到托盘，不是退出**；要彻底退出请用托盘菜单的「退出」。

### 模块管理

- 顶栏「模块」按钮：勾选即添加、取消即移除
- 模块标题栏右侧 `×`：移除该模块
- 拖模块**标题栏**重排位置；拖**卡片边缘**缩放大小
- 布局自动保存，重启后恢复

### 设置项

| 分组 | 项目 |
|---|---|
| 登录状态 | 打开登录窗口 / 登录窗口 DevTools / 查看 localStorage keys / 清除登录态 / 手动粘贴 token |
| 窗口 | 窗口置顶 / 不透明度 / 显示缩放手柄（四角图标）/ 开机自启 |
| 锁定与穿透 | 全局快捷键 / 悬停多久才解锁 / 移开后多久恢复穿透 / 顶部常驻可交互条带高度 |
| 数据 | 自动刷新间隔 / 接口地址 |

> 「显示缩放手柄」关掉只是隐藏四角的小箭头图标，鼠标移到卡片边缘仍可缩放。
> 「顶部常驻可交互条带」大于 0 时，窗口顶部这一条永远不穿透（代价是会挡住下层窗口在该区域的点击），用于不方便用快捷键的场景。

---

## 打包

```bash
npm run dist
# 产物在 dist/：
#   DeepSeekUsageWidget-Setup-<version>.exe     安装包（可选安装目录、建快捷方式、装完自动启动）
#   DeepSeekUsageWidget-Portable-<version>.exe  免安装版，双击直接运行
```

**关于 exe 图标**：当前 `electron-builder.yml` 里设了 `signAndEditExecutable: false`。原因是改写 exe 内嵌资源需要 electron-builder 下载 `winCodeSign` 工具包，而该包内含 macOS 的 `.dylib` **符号链接**，在未开启 Windows 开发者模式的普通账户下解压会因无法创建符号链接而失败（`app-builder` 会反复重试直至构建中断）。

代价是 exe 文件本身显示 Electron 默认图标（安装包与快捷方式图标不受影响）。想换掉的话：开启「设置 → 系统 → 开发者选项 → 开发人员模式」，删掉那行配置重新打包即可。

产物未做代码签名，首次运行 Windows SmartScreen 会提示，点「更多信息 → 仍可运行」即可。

---

## 项目结构

```
src/
├─ shared/            主进程与渲染进程的共享契约
│  ├─ channels.ts     IPC 通道名（单一事实来源）
│  ├─ types.ts        Config / Layout / UsageDataset 等类型
│  ├─ constants.ts    接口地址、token 类型枚举、默认值
│  └─ token.ts        登录态解包（有独立回归测试）
├─ main/              主进程
│  ├─ index.ts        生命周期、单实例、装配
│  ├─ widget-window.ts      无边框置顶窗口 + bounds 持久化
│  ├─ click-through.ts      穿透与悬停解锁状态机
│  ├─ login-window.ts       内嵌登录、登录态读取与续期
│  ├─ tray.ts / tray-icon.ts  托盘（图标用位图代码生成）
│  ├─ shortcuts.ts / autostart.ts
│  ├─ config-store.ts / layout-store.ts / atomic-json.ts   原子写持久化
│  ├─ deepseek/       client(HTTP) / normalize / cache / aggregate / tz / service
│  └─ ipc/index.ts    所有 ipcMain 处理器
├─ preload/index.ts   仅通过 contextBridge 暴露 window.api
└─ renderer/src/
   ├─ App.vue / store.ts / api.ts / registry.ts
   ├─ grid/          GridBoard.vue（GridStack 集成）+ mountModule.ts
   ├─ components/    TopBar / FilterBar / LockButton / ModuleFrame /
   │                 AddModuleMenu / SettingsPanel / ErrorBanner
   └─ modules/       六个模块组件 + useUsage.ts
scripts/
├─ mock-deepseek.mjs     本地假服务器（含多种故障注入场景）
├─ diag-api.cjs          接口诊断（npm run diag）
├─ generate-icon.mjs     手工编码 PNG 生成应用图标
└─ test-data.mts         数据层测试（npm run test:data）
```

### 数据存储位置

`%APPDATA%\DeepSeekUsageWidget\`

- `config.json` — 窗口位置尺寸、设置、加密后的登录态
- `layout.json` — 模块布局
- `Partitions\deepseek\` — 登录窗口的会话数据（cookie / localStorage）

---

## 数据来源与免责

界面数据来自 platform.deepseek.com 的**非公开内部接口**，借用你自己的登录态只读访问：

| 接口 | 返回 |
|---|---|
| `GET /api/v0/users/get_user_summary` | 余额（充值钱包 / 赠送钱包） |
| `GET /api/v0/usage/amount?month=&year=` | 按天/模型/类型的 token 用量 |
| `GET /api/v0/usage/cost?month=&year=` | 按天/模型的消费金额 |

统一信封 `{code, data:{biz_code, biz_data}}`，鉴权失败为业务码 `40002` / `40003`。

> ⚠️ 这些是未公开接口，不属于 DeepSeek 官方 API 承诺的稳定契约，**可能随时变更**，也可能与平台服务条款存在冲突。程序仅读取你自己的数据，不修改任何内容，但请自行评估使用风险。

---

## 实现要点（非显而易见的坑）

维护时容易踩的地方，按踩坑顺序记录：

1. **GridStack 与 Vue 争夺 DOM**：GridStack 直接改动 DOM（位置、内联样式、顺序），用 `v-for` 渲染网格项会被 GridStack 的改动与 Vue 的更新互相回滚。因此采用**命令式挂载**——每个网格项内部单独 `createApp()` 一个 Vue 实例，与 GridBoard 组件树解耦。
2. **拖拽句柄的绑定时机**：GridStack 在 `addWidget()` 时**一次性**用 `querySelectorAll(handle)` 解析拖拽句柄（见 `dd-draggable.js`）。而 Vue 内容是之后才挂进去的，那一刻句柄还不存在 → 得到空数组 → 模块永远拖不动。**挂载完成后必须调用 `grid.prepareDragDrop(el, true)` 强制重新绑定。**
3. **不要把 `.grid-stack-item-content` 的 `overflow` 改成 `visible`**：GridStack 自带 `overflow-y:auto` 正是它把内容限制在卡片内的机制，覆盖成 `visible` 会让内容溢出并压到下一个模块上。
4. **IPC 边界要去掉 Vue 的响应式代理**：`reactive()` 包装的 Proxy 无法通过结构化克隆，直接传给 `ipcRenderer.invoke` 会抛 `An object could not be cloned`。渲染层 `api.ts` 统一做了深拷贝。
5. **`userToken` 是 JSON 不是裸 token**：localStorage 里的值是 `{"value":"<token>","__version":"0"}`，直接当 Bearer 发出去会得到 `40003 Authorization Failed`。见 `shared/token.ts`。另外**不要按 JWT 形态盲扫**——埋点 SDK 的 `__tea_cache_tokens_*` 也存 JWT 形态的值，会抓错。
6. **用量接口只能按月查**：不支持任意日期区间。「近 7 日 / 近 30 日」必须由客户端算出涉及的月份（通常 1~2 个，跨年可能 3 个）逐月拉取后聚合，按 `YYYY-MM` 缓存；历史月份数据不变所以缓存很久，当月按刷新间隔失效。
7. **`PROMPT_TOKEN` 是恒为 0 的聚合占位类型**（实测 180 个样本全为 0），语义上等于「命中 + 未命中」，必须显式排除，否则平台一旦开始填值就会重复计算。`cost` 求和还要跳过 `REQUEST`（那是调用次数不是钱）。
8. **穿透状态机只有一个真相来源**：穿透 = `locked && !hovering`，所有鼠标模式切换都经过唯一的 `sync()`。早期版本在各处直接调 `setIgnoreMouseEvents`，把条件写反过一次，导致应用一启动就整体穿透（表现为「窗口拖不动、点什么都穿透到下层」）。
9. **时间一律按北京时间（UTC+8）**：不信任本机时区——用户可能在别的时区，而平台的「今天」和月份边界按北京时间切分。
10. **`-webkit-app-region: drag` 只加在顶栏**，模块标题栏必须是 `no-drag`，否则 OS 会吞掉 mousedown，GridStack 收不到拖拽起始事件。
11. **打开模态面板时要让网格彻底不可交互**：只盖一层半透明遮罩不够——模块标题栏仍带 `cursor:move`、缩放手柄还在，而且 GridStack 的 `.ui-draggable-dragging` 带 `z-index:10000` 会盖到面板上面。
12. **打包相关**：NSIS 与 portable 的默认 `artifactName` 完全相同，后构建的会**覆盖**前者，必须分开命名；`skipTaskbar` 时托盘是唯一入口，托盘创建失败要有回退（当前会退回显示任务栏图标）。

---

## 已知限制

- 平台不提供历史余额，所以**趋势图只能画用量，画不了余额变化**
- 「今日消费」在平台侧可能有延迟，下单后不一定立刻出现在当天数据里
- 仅针对 Windows 打包；理论上 Electron 跨平台，但未在 macOS / Linux 上验证

## 故障排查

| 现象 | 处理 |
|---|---|
| 一直显示「未登录」或提示登录态已失效 | 设置 → 打开登录窗口重新登录；持久失败可试「清除登录态」后重登 |
| 数据不刷新 | 先跑 `npm run diag` 看接口真实返回；检查「设置 → 数据 → 接口地址」是否被改成过假服务器地址 |
| 找不到窗口 | 窗口可能被隐藏了，左键单击托盘图标切换显示；若托盘也没有，可能是托盘创建失败，检查是否有第二个实例在跑 |
| 快捷键无效 | 组合被其它软件占用，在设置里换一个；托盘菜单里也有解锁入口 |
| 打包报符号链接错误 | `winCodeSign` 解压失败，见上文「关于 exe 图标」；保持 `signAndEditExecutable: false` 即可绕开 |

## License

MIT
