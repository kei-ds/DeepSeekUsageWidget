<template>
  <div class="filter-bar app-no-drag">
    <button
      v-for="opt in OPTIONS"
      :key="opt.kind"
      :class="{ active: filter.kind === opt.kind }"
      :disabled="busy"
      @click="pick(opt.kind)"
    >
      {{ opt.label }}
    </button>
    <input
      type="date"
      class="date-input"
      :class="{ active: filter.kind === 'day' }"
      :value="filter.kind === 'day' ? filter.date : ''"
      :disabled="busy"
      title="选择单日"
      @change="onDate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Filter } from '@shared/types'
import { store } from '../store'
import { useUsage } from '../modules/useUsage'

const OPTIONS: { kind: Filter['kind']; label: string }[] = [
  { kind: 'today', label: '今日' },
  { kind: 'last7', label: '近 7 日' },
  { kind: 'last30', label: '近 30 日' }
]

const { filter, loading } = useUsage()
const busy = computed(() => loading.value)

function pick(kind: Filter['kind']): void {
  if (kind === 'today') void store.setFilter({ kind: 'today' })
  else if (kind === 'last7') void store.setFilter({ kind: 'last7' })
  else void store.setFilter({ kind: 'last30' })
}

function onDate(e: Event): void {
  const value = (e.target as HTMLInputElement).value
  if (!value) return
  void store.setFilter({ kind: 'day', date: value })
}
</script>

<style scoped>
.filter-bar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.filter-bar button {
  padding: 3px 8px;
  font-size: 11px;
}

.date-input {
  width: 118px;
  padding: 2px 5px;
  font-size: 11px;
}

.date-input.active {
  border-color: var(--accent);
}
</style>
