import { markRaw, type Component } from 'vue'
import type { LayoutItem } from '@shared/types'
import BalanceCard from './modules/BalanceCard.vue'
import TodayCard from './modules/TodayCard.vue'
import DateRangeStats from './modules/DateRangeStats.vue'
import ModelBreakdown from './modules/ModelBreakdown.vue'
import RequestCount from './modules/RequestCount.vue'
import UsageTrend from './modules/UsageTrend.vue'

export interface ModuleDef {
  id: string
  title: string
  description: string
  component: Component
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
}

/** 可添加/删除的模块清单。v1 每个类型单例，避免同类型多实例的状态同步问题。 */
export const MODULES: ModuleDef[] = [
  {
    id: 'balance',
    title: '账户余额',
    description: '充值余额 / 赠送余额 / 合计',
    component: markRaw(BalanceCard),
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 3, h: 2 }
  },
  {
    id: 'today',
    title: '今日消费',
    description: '北京时间当天的消费与 token 用量',
    component: markRaw(TodayCard),
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 3, h: 2 }
  },
  {
    id: 'rangeStats',
    title: '区间统计',
    description: '跟随顶部日期筛选汇总',
    component: markRaw(DateRangeStats),
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 3, h: 2 }
  },
  {
    id: 'trend',
    title: '用量趋势',
    description: '逐日消费 / token 柱状图',
    component: markRaw(UsageTrend),
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 }
  },
  {
    id: 'modelBreakdown',
    title: '按模型明细',
    description: '各模型 token 与消费拆分',
    component: markRaw(ModelBreakdown),
    defaultSize: { w: 7, h: 4 },
    minSize: { w: 4, h: 3 }
  },
  {
    id: 'requests',
    title: '请求次数',
    description: 'API 调用次数统计',
    component: markRaw(RequestCount),
    defaultSize: { w: 5, h: 2 },
    minSize: { w: 3, h: 2 }
  }
]

export const getModule = (id: string): ModuleDef | undefined => MODULES.find((m) => m.id === id)

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'balance', x: 0, y: 0, w: 6, h: 2 },
  { id: 'today', x: 6, y: 0, w: 6, h: 2 },
  { id: 'rangeStats', x: 0, y: 2, w: 6, h: 3 },
  { id: 'trend', x: 6, y: 2, w: 6, h: 3 },
  { id: 'modelBreakdown', x: 0, y: 5, w: 7, h: 4 },
  { id: 'requests', x: 7, y: 5, w: 5, h: 2 }
]
