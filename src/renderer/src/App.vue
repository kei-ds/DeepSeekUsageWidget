<template>
  <div class="app-shell">
    <TopBar />

    <ErrorBanner
      v-if="state.notice"
      :message="state.notice"
      :action-label="bannerAction"
      @close="state.notice = null"
      @action="openLogin"
    />

    <GridBoard />

    <SettingsPanel v-if="state.settingsOpen" @close="state.settingsOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import ErrorBanner from './components/ErrorBanner.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TopBar from './components/TopBar.vue'
import GridBoard from './grid/GridBoard.vue'
import { store } from './store'

const state = store.state

const bannerAction = computed(() => (state.status.state === 'auth' ? '打开登录' : ''))

function openLogin(): void {
  void store.openLogin()
}

onMounted(() => {
  void store.init()
})

onBeforeUnmount(() => {
  store.dispose()
})
</script>
