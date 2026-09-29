<template>
  <div class="banner" :class="tone">
    <span class="banner__text">{{ message }}</span>
    <button v-if="actionLabel" class="banner__action" @click="$emit('action')">{{ actionLabel }}</button>
    <button class="banner__close" title="关闭" @click="$emit('close')">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../store'

withDefaults(defineProps<{ message: string; actionLabel?: string }>(), {
  actionLabel: ''
})
defineEmits<{ close: []; action: [] }>()

const tone = computed(() => (store.state.status.state === 'auth' ? 'warn' : 'info'))
</script>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
}

.banner.warn {
  background: #3a2d10;
  color: #f0d089;
}

.banner.info {
  background: var(--panel-2);
  color: var(--muted);
}

.banner__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner__action,
.banner__close {
  padding: 2px 8px;
  font-size: 11px;
}
</style>
