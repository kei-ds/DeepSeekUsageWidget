<template>
  <!-- 整条顶栏是可拖动区域（无边框窗口靠它移动）；里面的控件都是 no-drag -->
  <div class="topbar app-drag">
    <!-- 这些非交互元素显式标 app-drag：不依赖 -webkit-app-region 是否向下继承，
         否则一旦不继承，顶栏会被子元素铺满而完全没有可拖拽的像素。 -->
    <span class="brand app-drag">DeepSeek 用量</span>
    <span class="status-dot app-drag" :class="dotTone" :title="dotTitle" />

    <FilterBar />

    <div class="spacer app-drag" title="按住此处拖动窗口" />

    <button class="app-no-drag" :disabled="loading" @click="refresh" title="立即刷新">
      {{ loading ? '刷新中' : '刷新' }}
    </button>

    <LockButton />

    <div class="add-wrap">
      <button
        class="app-no-drag"
        :class="{ active: state.addMenuOpen }"
        @click="toggleAddMenu"
        title="添加 / 移除模块"
      >
        模块
      </button>
      <AddModuleMenu v-if="state.addMenuOpen" @close="state.addMenuOpen = false" />
    </div>

    <button
      class="app-no-drag"
      :class="{ active: state.settingsOpen }"
      @click="state.settingsOpen = !state.settingsOpen"
      title="设置"
    >
      设置
    </button>

    <button class="app-no-drag close" title="隐藏到系统托盘" @click="hide">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AddModuleMenu from './AddModuleMenu.vue'
import FilterBar from './FilterBar.vue'
import LockButton from './LockButton.vue'
import { api } from '../api'
import { store } from '../store'
import { useUsage } from '../modules/useUsage'

const { loading } = useUsage()
const state = store.state

const dotTone = computed(() => {
  if (state.auth.hasToken === false) return 'bad'
  switch (state.status.state) {
    case 'ok':
      return 'good'
    case 'loading':
    case 'idle':
      return 'idle'
    case 'auth':
      return 'warn'
    default:
      return 'bad'
  }
})

const dotTitle = computed(() => {
  if (!state.auth.hasToken) return '未登录'
  switch (state.status.state) {
    case 'ok':
      return `数据正常（${state.auth.source === 'manual' ? '手动 token' : '登录会话'}）`
    case 'loading':
      return '正在加载'
    case 'auth':
      return '登录态失效，请重新登录'
    case 'network':
      return '网络异常'
    case 'api':
      return state.status.message ?? '接口异常'
    default:
      return '空闲'
  }
})

function refresh(): void {
  void store.refresh(true)
}

function toggleAddMenu(): void {
  state.addMenuOpen = !state.addMenuOpen
}

function hide(): void {
  void api.window.hide()
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}

.brand {
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--muted);
}

.status-dot.good {
  background: var(--good);
}

.status-dot.warn {
  background: var(--warn);
}

.status-dot.bad {
  background: var(--bad);
}

.status-dot.idle {
  background: var(--muted);
}

.spacer {
  flex: 1;
  min-width: 8px;
}

.topbar button {
  padding: 3px 8px;
  font-size: 11px;
}

.topbar .close {
  font-size: 14px;
  line-height: 1;
  padding: 2px 7px;
}

.add-wrap {
  position: relative;
}
</style>
