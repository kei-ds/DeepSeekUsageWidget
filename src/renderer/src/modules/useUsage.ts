import { computed } from 'vue'
import { store } from '../store'

/**
 * 模块组件是命令式挂载的根组件（在 GridBoard 组件树之外），
 * 所以不能靠 provide/inject，统一直接读响应式单例 store。
 */
export function useUsage() {
  return {
    usage: computed(() => store.state.usage),
    status: computed(() => store.state.status),
    filter: computed(() => store.state.filter),
    balance: computed(() => store.state.usage?.balance ?? null),
    today: computed(() => store.state.usage?.today ?? null),
    todayDate: computed(() => store.state.usage?.todayDate ?? ''),
    range: computed(() => store.state.usage?.range ?? null),
    totals: computed(() => store.state.usage?.totals ?? null),
    perModel: computed(() => store.state.usage?.perModel ?? []),
    series: computed(() => store.state.usage?.series ?? []),
    loading: computed(() => store.state.status.state === 'loading')
  }
}
