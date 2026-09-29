<template>
  <button
    ref="btn"
    class="lock-btn app-no-drag"
    :class="{ locked }"
    :title="locked ? '已锁定：鼠标可穿透到下层窗口（悬停此处或按快捷键解锁）' : '点击锁定：锁定后鼠标穿透到下层窗口'"
    @click="toggle"
  >
    <svg v-if="locked" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2H12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z"
        fill="currentColor"
      />
    </svg>
    <svg v-else viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M4.5 7V5a3.5 3.5 0 0 1 6.9-.8 1 1 0 1 1-1.94.48A1.5 1.5 0 0 0 6 5v2h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h.5Z"
        fill="currentColor"
      />
    </svg>
    <span>{{ locked ? '已锁定' : '锁定' }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { store } from '../store'

const btn = ref<HTMLButtonElement | null>(null)
const locked = computed(() => store.state.window.locked)

// 命中判定时外扩一点，光标到了按钮边缘也能触发
const PAD = 6
let wasInside = false
let ro: ResizeObserver | null = null

function reportRect(): void {
  const el = btn.value
  if (!el) return
  const r = el.getBoundingClientRect()
  store.reportLockRect({
    x: r.left - PAD,
    y: r.top - PAD,
    w: r.width + PAD * 2,
    h: r.height + PAD * 2
  })
}

/**
 * 快路径：锁定态下窗口是穿透的，但 setIgnoreMouseEvents(true, {forward:true})
 * 仍会把 mousemove 转发进来，于是能在这里判断光标是否落在锁按钮上。
 * 主进程还有一条轮询兜底（forward 转发并非在所有环境都可靠）。
 */
function onMove(e: MouseEvent): void {
  if (!locked.value) {
    wasInside = false
    return
  }
  const el = btn.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const inside =
    e.clientX >= r.left - PAD &&
    e.clientX <= r.right + PAD &&
    e.clientY >= r.top - PAD &&
    e.clientY <= r.bottom + PAD

  if (inside && !wasInside) {
    wasInside = true
    store.requestInteractive()
  } else if (!inside && wasInside) {
    wasInside = false
    store.requestClickThrough()
  }
}

function toggle(): void {
  void store.toggleLock()
}

onMounted(() => {
  reportRect()
  window.addEventListener('mousemove', onMove)
  window.addEventListener('resize', reportRect)
  ro = new ResizeObserver(reportRect)
  if (btn.value) ro.observe(btn.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('resize', reportRect)
  ro?.disconnect()
  ro = null
})

// 顶部布局变化（提示条出现/消失等）会让按钮位移，需要重新上报矩形
watch(
  () => [store.state.notice, locked.value],
  () => void nextTick(reportRect)
)
</script>

<style scoped>
.lock-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.lock-btn.locked {
  background: var(--warn);
  border-color: var(--warn);
  color: #21180a;
  font-weight: 600;
}
</style>
