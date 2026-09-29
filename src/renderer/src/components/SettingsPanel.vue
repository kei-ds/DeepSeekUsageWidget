<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="panel">
      <div class="panel__head">
        <span class="panel__title">设置</span>
        <span class="muted mono">v{{ state.appVersion }}</span>
        <span class="spacer" />
        <button @click="$emit('close')">关闭</button>
      </div>

      <div class="panel__body">
        <!-- 登录状态 -->
        <section>
          <h4>登录状态</h4>
          <div class="row">
            <span class="muted">当前来源</span>
            <span class="mono">{{ sourceLabel }}</span>
          </div>
          <div class="row">
            <span class="muted">登录窗口</span>
            <span class="mono">{{ state.auth.loginWindowOpen ? '已打开' : '未打开' }}</span>
          </div>
          <div class="actions">
            <button @click="openLogin">打开登录窗口</button>
            <button @click="openDevtools">登录窗口 DevTools</button>
            <button @click="dumpKeys" title="用于确认 token 在 localStorage 里的真实 key 名">
              查看 localStorage keys
            </button>
            <button class="danger" @click="clearToken">清除登录态</button>
          </div>
          <p class="hint">
            登录一次后会常驻读取登录态；若失效，程序会自动重新弹出登录窗口。
          </p>

          <details class="adv">
            <summary>手动粘贴 token（兜底）</summary>
            <div class="actions">
              <input
                v-model="manualToken"
                type="text"
                placeholder="粘贴 platform.deepseek.com 的 userToken"
                class="grow"
              />
              <button @click="saveManualToken">保存</button>
            </div>
            <p class="hint">
              在浏览器打开 platform.deepseek.com，F12 → Application → Local Storage，
              找到 userToken 复制即可。仅当自动获取不可用时才需要。
            </p>
          </details>

          <pre v-if="keyDump" class="dump">{{ keyDump }}</pre>
        </section>

        <!-- 窗口 -->
        <section>
          <h4>窗口</h4>
          <label class="row">
            <span class="muted">窗口置顶</span>
            <input type="checkbox" :checked="state.window.alwaysOnTop" @change="onAlwaysOnTop" />
          </label>
          <label class="row">
            <span class="muted">不透明度</span>
            <span class="slider-wrap">
              <input
                type="range"
                min="0.3"
                max="1"
                step="0.05"
                :value="state.window.opacity"
                @input="onOpacity"
              />
              <span class="mono">{{ Math.round(state.window.opacity * 100) }}%</span>
            </span>
          </label>
          <label class="row">
            <span class="muted">显示缩放手柄（四角图标）</span>
            <input
              type="checkbox"
              :checked="state.config?.showResizeHandles !== false"
              @change="onShowResizeHandles"
            />
          </label>
          <p class="hint">
            关掉只是隐藏四角的小箭头图标；把鼠标移到卡片边缘仍可缩放（光标会变成缩放指针）。
          </p>
          <label class="row">
            <span class="muted">开机自启</span>
            <input
              type="checkbox"
              :checked="state.config?.autostart ?? false"
              :disabled="!autostartSupported"
              @change="toggleAutostart"
            />
          </label>
          <p v-if="!autostartSupported" class="hint warn">
            开发模式下自启不可用（会把裸 electron.exe 写进注册表）；用安装版才有意义。
          </p>
        </section>

        <!-- 交互 -->
        <section>
          <h4>锁定与穿透</h4>
          <div class="row">
            <span class="muted">全局快捷键</span>
            <span class="inline">
              <input v-model="accelerator" type="text" class="grow" />
              <button @click="saveShortcut">应用</button>
            </span>
          </div>
          <p class="hint">默认 CommandOrControl+Alt+L，用来在完全穿透时一键解锁。</p>
          <label class="row">
            <span class="muted">悬停多久才解锁 (ms)</span>
            <input
              type="number"
              min="0"
              step="100"
              :value="state.config?.hoverUnlockDelayMs"
              @change="patchNumber('hoverUnlockDelayMs', $event)"
            />
          </label>
          <label class="row">
            <span class="muted">移开后多久恢复穿透 (ms)</span>
            <input
              type="number"
              min="0"
              step="100"
              :value="state.config?.hoverRelockDelayMs"
              @change="patchNumber('hoverRelockDelayMs', $event)"
            />
          </label>
          <label class="row">
            <span class="muted">顶部常驻可交互条带 (px)</span>
            <input
              type="number"
              min="0"
              step="4"
              :value="state.config?.alwaysInteractiveStripHeight"
              @change="patchNumber('alwaysInteractiveStripHeight', $event)"
            />
          </label>
          <p class="hint">
            条带 &gt; 0 时，窗口顶部这一条永远不穿透，代价是那一条会挡住下层窗口的点击。0 表示关闭，完全依赖悬停解锁。
          </p>
        </section>

        <!-- 数据 -->
        <section>
          <h4>数据</h4>
          <label class="row">
            <span class="muted">自动刷新间隔 (秒)</span>
            <input
              type="number"
              min="15"
              step="15"
              :value="Math.round((state.config?.refreshIntervalMs ?? 120000) / 1000)"
              @change="patchInterval"
            />
          </label>
          <label class="row">
            <span class="muted">接口地址</span>
            <input
              type="text"
              class="grow"
              :value="state.config?.baseUrl"
              @change="patchBaseUrl"
            />
          </label>
          <p class="hint">
            接口地址默认指向 platform.deepseek.com。本地联调时可改成假服务器地址。
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Config } from '@shared/types'
import { api } from '../api'
import { store } from '../store'

defineEmits<{ close: [] }>()

const state = store.state
const manualToken = ref('')
const accelerator = ref('')
const keyDump = ref('')
const autostartSupported = ref(true)

const sourceLabel = computed(() => {
  if (!state.auth.hasToken) return '未登录'
  return state.auth.source === 'manual' ? '手动 token' : '登录会话'
})

onMounted(async () => {
  accelerator.value = state.config?.shortcut ?? ''
  const a = await api.autostart.get()
  autostartSupported.value = a.supported
})

function openLogin(): void {
  void store.openLogin()
}

function openDevtools(): void {
  void api.auth.openLoginDevtools()
}

async function dumpKeys(): Promise<void> {
  const keys = await api.auth.dumpStorageKeys()
  keyDump.value = keys.length
    ? `localStorage keys:\n${keys.join('\n')}`
    : '（没有取到，可能尚未登录或页面未加载完）'
}

function clearToken(): void {
  void store.clearToken()
}

function saveManualToken(): void {
  void store.setManualToken(manualToken.value)
  manualToken.value = ''
}

function onAlwaysOnTop(e: Event): void {
  void store.setAlwaysOnTop((e.target as HTMLInputElement).checked)
}

function onOpacity(e: Event): void {
  void store.setOpacity(Number((e.target as HTMLInputElement).value))
}

function onShowResizeHandles(e: Event): void {
  void store.patchConfig({ showResizeHandles: (e.target as HTMLInputElement).checked })
}

function toggleAutostart(): void {
  void store.toggleAutostart()
}

function saveShortcut(): void {
  void store.setShortcut(accelerator.value.trim())
}

function patchNumber(key: keyof Config, e: Event): void {
  const value = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  void store.patchConfig({ [key]: value } as Partial<Config>)
}

function patchInterval(e: Event): void {
  const seconds = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(seconds)) return
  void store.patchConfig({ refreshIntervalMs: Math.max(15, seconds) * 1000 })
}

function patchBaseUrl(e: Event): void {
  const value = (e.target as HTMLInputElement).value.trim()
  if (!value) return
  void store.patchConfig({ baseUrl: value })
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  /* 遮罩压暗得明显一些，让「底下的模块此刻不可操作」这件事一眼可见 */
  background: rgba(6, 9, 14, 0.75);
  cursor: default;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.panel {
  width: min(440px, 92vw);
  height: 100%;
  background: var(--panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-2);
}

.panel__title {
  font-weight: 700;
}

.spacer {
  flex: 1;
}

.panel__body {
  flex: 1;
  overflow: auto;
  padding: 10px 12px 20px;
}

section {
  padding: 8px 0 12px;
  border-bottom: 1px solid var(--border);
}

section:last-child {
  border-bottom: none;
}

h4 {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--accent);
  letter-spacing: 0.04em;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
}

.row input[type='number'] {
  width: 96px;
}

.row input[type='text'],
.row .grow {
  flex: 1;
  min-width: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.slider-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-wrap input {
  width: 120px;
}

.hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
}

.hint.warn {
  color: var(--warn);
}

.danger:hover {
  border-color: var(--bad);
  color: var(--bad);
}

.adv {
  margin-top: 8px;
}

.adv summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
}

.dump {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow: auto;
}
</style>
