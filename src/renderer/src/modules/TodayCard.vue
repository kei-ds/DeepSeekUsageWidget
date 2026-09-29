<template>
  <ModuleFrame :module-id="moduleId" :subtitle="todayDate || undefined">
    <template v-if="today">
      <div class="stat-row">
        <span class="stat-label">今日消费</span>
        <span class="stat-value big" :class="costTone">{{ formatMoney(today.totals.cost) }}</span>
      </div>
      <div class="pairs">
        <div class="stat-row">
          <span class="stat-label">命中缓存</span>
          <span class="stat-value mono">{{ formatTokens(today.totals.cacheHit) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">未命中</span>
          <span class="stat-value mono">{{ formatTokens(today.totals.cacheMiss) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">输出</span>
          <span class="stat-value mono">{{ formatTokens(today.totals.response) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">请求次数</span>
          <span class="stat-value mono">{{ formatInt(today.totals.request) }}</span>
        </div>
      </div>
    </template>
    <div v-else class="muted empty">{{ loading ? '加载中…' : '暂无数据' }}</div>
  </ModuleFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ModuleFrame from '../components/ModuleFrame.vue'
import { formatInt, formatMoney, formatTokens } from '../format'
import { useUsage } from './useUsage'

const props = withDefaults(defineProps<{ moduleId?: string }>(), { moduleId: 'today' })
const moduleId = computed(() => props.moduleId)

const { today, todayDate, loading } = useUsage()

const costTone = computed(() => {
  const c = today.value?.totals.cost ?? 0
  if (c <= 0) return ''
  return c > 10 ? 'bad' : c > 1 ? 'warn' : 'good'
})
</script>

<style scoped>
.empty {
  padding: 12px 0;
  text-align: center;
}
</style>
