<template>
  <ModuleFrame :module-id="moduleId" :subtitle="rangeLabel">
    <template v-if="today || totals">
      <div class="pairs">
        <div class="stat-row">
          <span class="stat-label">今日请求</span>
          <span class="stat-value big mono">{{ formatInt(todayRequests) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">区间请求</span>
          <span class="stat-value big mono">{{ formatInt(rangeRequests) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">日均请求</span>
          <span class="stat-value mono">{{ formatInt(avgRequests) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">区间天数</span>
          <span class="stat-value mono">{{ days }}</span>
        </div>
      </div>
    </template>
    <div v-else class="muted empty">{{ loading ? '加载中…' : '暂无数据' }}</div>
  </ModuleFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ModuleFrame from '../components/ModuleFrame.vue'
import { describeFilter, formatInt } from '../format'
import { useUsage } from './useUsage'

const props = withDefaults(defineProps<{ moduleId?: string }>(), { moduleId: 'requests' })
const moduleId = computed(() => props.moduleId)

const { today, totals, range, filter, loading } = useUsage()

const todayRequests = computed(() => today.value?.totals.request ?? 0)
const rangeRequests = computed(() => totals.value?.request ?? 0)

const days = computed(() => {
  const r = range.value
  if (!r) return 1
  const a = Date.parse(`${r.start}T00:00:00Z`)
  const b = Date.parse(`${r.end}T00:00:00Z`)
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
})

const avgRequests = computed(() => rangeRequests.value / days.value)

const rangeLabel = computed(() => {
  const r = range.value
  if (!r) return undefined
  return r.start === r.end ? `${r.start} · ${describeFilter(filter.value)}` : `${r.start} ~ ${r.end}`
})
</script>

<style scoped>
.empty {
  padding: 12px 0;
  text-align: center;
}
</style>
