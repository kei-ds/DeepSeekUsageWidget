<template>
  <ModuleFrame :module-id="moduleId" :subtitle="fetchedLabel">
    <div v-if="balance && balance.wallets.length" class="wallets">
      <div v-for="w in balance.wallets" :key="w.currency" class="wallet">
        <div class="stat-row">
          <span class="stat-label">{{ w.currency }} 总余额</span>
          <span class="stat-value big">{{ formatMoney(w.total, w.currency) }}</span>
        </div>
        <div class="pairs">
          <div class="stat-row">
            <span class="stat-label">充值</span>
            <span class="stat-value mono">{{ formatMoney(w.normal, w.currency) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">赠送</span>
            <span class="stat-value mono">{{ formatMoney(w.bonus, w.currency) }}</span>
          </div>
        </div>
      </div>
      <div v-if="balance.isAvailable === false" class="stat-row">
        <span class="pill" style="color: var(--bad); border-color: var(--bad)">余额不足</span>
      </div>
    </div>
    <div v-else class="muted empty">{{ loading ? '加载中…' : '暂无余额数据，请先登录' }}</div>
  </ModuleFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ModuleFrame from '../components/ModuleFrame.vue'
import { formatMoney } from '../format'
import { useUsage } from './useUsage'

const props = withDefaults(defineProps<{ moduleId?: string }>(), { moduleId: 'balance' })
const moduleId = computed(() => props.moduleId)

const { balance, loading } = useUsage()

const fetchedLabel = computed(() => {
  if (!balance.value) return undefined
  const d = new Date(balance.value.fetchedAt)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())} 更新`
})
</script>

<style scoped>
.wallet + .wallet {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.empty {
  padding: 12px 0;
  text-align: center;
}
</style>
