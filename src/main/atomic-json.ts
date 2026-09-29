import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'

/**
 * 原子写 JSON：先写同目录临时文件，再 rename 覆盖。
 * rename 在同一 NTFS 卷上是原子的，因此不会出现半截文件。
 */
export function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

/**
 * 读 JSON。文件不存在返回 null；解析失败则把损坏文件备份到 <file>.corrupt-<ts>.json
 * 并返回 null，让调用方回落到默认值而不是崩溃。
 */
export function readJsonSafe<T>(file: string): T | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    try {
      renameSync(file, `${file}.corrupt-${Date.now()}.json`)
    } catch {
      /* 备份失败也不能让启动挂掉 */
    }
    console.warn(`[store] ${file} 解析失败，已备份并回落默认值:`, (err as Error).message)
    return null
  }
}

/** 防抖写入器：合并高频写，支持在退出前强制 flush。 */
export function createDebouncedWriter(file: string, delayMs: number) {
  let timer: NodeJS.Timeout | null = null
  let pending: (() => unknown) | null = null

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    const fn = pending
    pending = null
    try {
      writeJsonAtomic(file, fn())
    } catch (err) {
      console.error(`[store] 写入 ${file} 失败:`, (err as Error).message)
    }
  }

  return {
    schedule(getData: () => unknown): void {
      pending = getData
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    flush
  }
}
