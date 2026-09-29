<template>
  <div ref="root" class="menu">
    <div class="menu__hint muted">勾选即添加，取消即移除</div>
    <div
      v-for="m in MODULES"
      :key="m.id"
      class="menu__item"
      :class="{ on: isActive(m.id) }"
      @click="toggle(m.id)"
    >
      <span class="menu__check">{{ isActive(m.id) ? '✓' : '' }}</span>
      <span class="menu__text">
        <span class="menu__title">{{ m.title }}</span>
        <span class="menu__desc muted">{{ m.description }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MODULES } from '../registry'
import { store } from '../store'

const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)

function isActive(id: string): boolean {
  return store.isModuleActive(id)
}

function toggle(id: string): void {
  if (isActive(id)) store.removeModule(id)
  else store.addModule(id)
}

function onDocClick(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  // 延后一拍再挂，避免触发本次打开菜单的那次点击立刻把它关掉
  window.setTimeout(() => {
    document.addEventListener('mousedown', onDocClick)
  }, 0)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  width: 280px;
  padding: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
}

.menu__hint {
  font-size: 11px;
  padding: 2px 6px 6px;
}

.menu__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
}

.menu__item:hover {
  background: #222a38;
}

.menu__item.on {
  background: #1d2a44;
}

.menu__check {
  width: 14px;
  color: var(--accent);
  font-weight: 700;
  line-height: 16px;
}

.menu__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.menu__title {
  font-size: 12px;
  font-weight: 600;
}

.menu__desc {
  font-size: 11px;
}
</style>
