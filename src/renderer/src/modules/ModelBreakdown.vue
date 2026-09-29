<template>
  <ModuleFrame :module-id="moduleId" :subtitle="rangeLabel">
    <table v-if="rows.length" class="table">
      <thead>
        <tr>
          <th class="left">模型</th>
          <th>缓存命中</th>
          <th>未命中</th>
          <th>输出</th>
          <th>请求</th>
          <th>消费</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.model">
          <td class="left mono">{{ r.model }}</td>
          <td class="mono">{{ formatTokens(r.cacheHit) }}</td>
          <td class="mono">{{ formatTokens(r.cacheMiss) }}</td>
          <td class="mono">{{ formatTokens(r.response) }}</td>
          <td class="mono">{{ formatInt(r.request) }}</td>
          <td class="mono">{{ formatMoney(r.cost) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="muted empty">
      {{ loading ? '加载中…' : '当前区间没有模型用量记录' }}
    </div>
  </ModuleFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ModuleFrame from '../components/ModuleFrame.vue'
import { describeFilter, formatInt, formatMoney, formatTokens } from '../format'
import { useUsage } from './useUsage'

const props = withDefaults(defineProps<{ moduleId?: string }>(), { moduleId: 'modelBreakdown' })
const moduleId = computed(() => props.moduleId)

const { perModel, range, filter, loading } = useUsage()

const rows = computed(() => perModel.value)

const rangeLabel = computed(() => {
  const r = range.value
  if (!r) return undefined
  return r.start === r.end ? `${r.start} · ${describeFilter(filter.value)}` : `${r.start} ~ ${r.end}`
})
</script>

<style scoped>
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.table th,
.table td {
  padding: 4px 6px;
  text-align: right;
  white-space: nowrap;
}

.table th {
  color: var(--muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.table td {
  border-bottom: 1px solid #1d232e;
}

.table .left {
  text-align: left;
}

.empty {
  padding: 12px 0;
  text-align: center;
}
</style>
