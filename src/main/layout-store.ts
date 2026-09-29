import { app } from 'electron'
import { join } from 'path'
import type { Layout } from '@shared/types'
import { createDebouncedWriter, readJsonSafe } from './atomic-json'

const LAYOUT_FILE = () => join(app.getPath('userData'), 'layout.json')

let writerRef: ReturnType<typeof createDebouncedWriter> | null = null
let cache: Layout | null = null
let loaded = false

/** 惰性创建：userData 路径依赖 app，不能在建模块时就取。 */
function getWriter(): ReturnType<typeof createDebouncedWriter> {
  if (!writerRef) writerRef = createDebouncedWriter(LAYOUT_FILE(), 300)
  return writerRef
}

export function getLayout(): Layout | null {
  if (!loaded) {
    const raw = readJsonSafe<Layout>(LAYOUT_FILE())
    cache = raw && raw.version === 1 && Array.isArray(raw.items) ? raw : null
    loaded = true
  }
  return cache
}

export function saveLayout(layout: Layout): void {
  cache = { version: 1, updatedAt: Date.now(), items: layout.items }
  loaded = true
  getWriter().schedule(() => cache)
}

export function flushLayout(): void {
  getWriter().flush()
}

/** 退出/重启后需要重新绑定 userData 路径时才用得到（测试用）。 */
export function resetLayoutWriter(): void {
  writerRef = createDebouncedWriter(LAYOUT_FILE(), 300)
}
