<template>
  <ModuleFrame :module-id="moduleId" :subtitle="rangeLabel">
    <div class="trend">
      <div class="trend__head">
        <button :class="{ active: metric === 'cost' }" @click="metric = 'cost'">消费</button>
        <button :class="{ active: metric === 'tokens' }" @click="metric = 'tokens'">Token</button>
        <span class="spacer" />
        <span class="muted mono">峰值 {{ peakLabel }}</span>
      </div>

      <div v-if="series.length" class="trend__chart">
        <svg class="trend__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect
            v-for="p in points"
            :key="p.date"
            :x="p.x"
            :y="p.y"
            :width="p.w"
            :height="p.h"
            rx="1"
            class="bar"
            :class="{ dim: hover !== null && hover !== p.date }"
            @mouseenter="hover = p.date"
            @mouseleave="hover = null"
          />
        </svg>
      </div>
      <div v-else class="muted empty">当前区间没有数据</div>

      <div class="trend__axis muted mono">
        <span>{{ series[0] ? shortDate(series[0].date) : '' }}</span>
        <span class="hover-info">{{ hoverInfo }}</span>
        <span>{{ series.length ? shortDate(series[series.length - 1].date) : '' }}</span>
      </div>
    </div>
  </ModuleFrame>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ModuleFrame from '../components/ModuleFrame.vue'
import { describeFilter, formatMoney, formatTokens, shortDate } from '../format'
import { useUsage } from './useUsage'

const props = withDefaults(defineProps<{ moduleId?: string }>(), { moduleId: 'trend' })
const moduleId = computed(() => props.moduleId)

const { series, range, filter } = useUsage()

const metric = ref<'cost' | 'tokens'>('cost')
const hover = ref<string | null>(null)

const W = 100
const H = 100

const values = computed(() =>
  series.value.map((p) => (metric.value === 'cost' ? p.cost : p.tokens))
)

const peak = computed(() => Math.max(0, ...values.value))

const points = computed(() => {
  const n = series.value.length || 1
  const step = W / n
  const bw = Math.max(0.6, step * 0.68)
  const max = Math.max(peak.value, 1e-9)
  return series.value.map((p, i) => {
    const v = values.value[i] ?? 0
    const h = v <= 0 ? 0 : Math.max(1, (v / max) * (H - 4))
    return { date: p.date, value: v, x: i * step + (step - bw) / 2, y: H - h, h, w: bw }
  })
})

const peakLabel = computed(() =>
  metric.value === 'cost' ? formatMoney(peak.value) : formatTokens(peak.value)
)

const hoverInfo = computed(() => {
  if (!hover.value) return ''
  const i = series.value.findIndex((p) => p.date === hover.value)
  if (i < 0) return ''
  const v = values.value[i] ?? 0
  const label = metric.value === 'cost' ? formatMoney(v) : formatTokens(v)
  return `${shortDate(hover.value)} ${label}`
})

const rangeLabel = computed(() => {
  const r = range.value
  if (!r) return undefined
  return r.start === r.end ? `${r.start} · ${describeFilter(filter.value)}` : `${r.start} ~ ${r.end}`
})
</script>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.trend__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex: 0 0 auto;
}

.trend__head button {
  padding: 2px 8px;
  font-size: 11px;
}

.spacer {
  flex: 1;
}

.trend__chart {
  flex: 1;
  min-height: 40px;
}

.trend__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.bar {
  fill: var(--accent);
  transition: opacity 0.12s ease;
}

.bar.dim {
  opacity: 0.35;
}

.trend__axis {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  margin-top: 4px;
  flex: 0 0 auto;
}

.hover-info {
  color: var(--text);
}

.empty {
  padding: 12px 0;
  text-align: center;
}
</style>
