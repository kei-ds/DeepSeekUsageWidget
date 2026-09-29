<template>
  <ModuleFrame :module-id="moduleId" :subtitle="rangeLabel">
    <template v-if="totals">
      <div class="stat-row">
        <span class="stat-label">消费合计</span>
        <span class="stat-value big">{{ formatMoney(totals.cost) }}</span>
      </div>
      <div class="pairs">
        <div class="stat-row">
          <span class="stat-label">缓存命中</span>
          <span class="stat-value mono">{{ formatTokens(totals.cacheHit) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">缓存未命中</span>
          <span class="stat-value mono">{{ formatTokens(totals.cacheMiss) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">输出 token</span>
          <span class="stat-value mono">{{ formatTokens(totals.response) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Token 合计</span>
          <span class="stat-value mono">{{ formatTokens(totalTokens) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">请求次数</span>
          <span class="stat-value mono">{{ formatInt(totals.request) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">日均消费</span>
          <span class="stat-value mono">{{ formatMoney(avgCost) }}</span>
        </div>
      </div>
      <div v-if="usage?.partial" class="muted warn-line">部分月份数据未取到，统计可能不完整</div>
    </template>
    <div v-else class="muted empty">{{ loading ? '加载中…' : '暂无数据' }}</div>
  </ModuleFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ModuleFrame from '../components/ModuleFrame.vue'
import { describeFilter, formatInt, formatMoney, formatTokens } from '../format'
import { useUsage } from './useUsage'

const props = withDefaults(defineProps<{ moduleId?: string }>(), { moduleId: 'rangeStats' })
const moduleId = computed(() => props.moduleId)

const { totals, range, filter, usage, loading } = useUsage()

const totalTokens = computed(() => {
  const t = totals.value
  return t ? t.cacheHit + t.cacheMiss + t.response : 0
})

const days = computed(() => {
  const r = range.value
  if (!r) return 1
  const a = Date.parse(`${r.start}T00:00:00Z`)
  const b = Date.parse(`${r.end}T00:00:00Z`)
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
})

const avgCost = computed(() => (totals.value ? totals.value.cost / days.value : 0))

const rangeLabel = computed(() => {
  const r = range.value
  if (!r) return undefined
  if (r.start === r.end) return `${r.start} · ${describeFilter(filter.value)}`
  return `${r.start} ~ ${r.end}（${days.value} 天）`
})
</script>

<style scoped>
.warn-line {
  margin-top: 6px;
  font-size: 11px;
  color: var(--warn);
}

.empty {
  padding: 12px 0;
  text-align: center;
}
</style>
