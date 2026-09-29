<template>
  <div class="module-frame">
    <!-- 这个标题栏同时是 GridStack 的拖拽手柄（见 GridBoard 的 draggable.handle）。
         注意不能加 app-drag，否则 OS 会吞掉 mousedown，模块就拖不动了。 -->
    <div class="module-frame__header">
      <span class="module-frame__title">{{ def?.title ?? moduleId }}</span>
      <span class="module-frame__sub">{{ subtitle ?? def?.description }}</span>
      <button class="module-frame__close app-no-drag" title="移除该模块" @click="remove">×</button>
    </div>
    <div class="module-frame__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getModule } from '../registry'
import { store } from '../store'

const props = withDefaults(defineProps<{ moduleId?: string; subtitle?: string }>(), {
  moduleId: '',
  subtitle: undefined
})

const def = computed(() => getModule(props.moduleId))

function remove(): void {
  store.removeModule(props.moduleId)
}
</script>
