import { nativeImage, type NativeImage } from 'electron'

/**
 * 用原始 BGRA 位图在代码里画托盘图标，免去打包一个二进制 .ico 资源。
 * 图形：蓝色圆角方块 + 三根白色柱子（呼应「用量统计」）。
 */
export function createTrayIcon(size = 32): NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const radius = size * 0.22

  const put = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    // BGRA
    buf[i] = b
    buf[i + 1] = g
    buf[i + 2] = r
    buf[i + 3] = a
  }

  // 圆角方块的覆盖判定（含边缘抗锯齿的简单近似）
  const insideRounded = (x: number, y: number): number => {
    const cx = Math.min(Math.max(x, radius), size - radius)
    const cy = Math.min(Math.max(y, radius), size - radius)
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= radius - 0.5) return 1
    if (dist >= radius + 0.5) return 0
    return radius + 0.5 - dist
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cov = insideRounded(x, y)
      if (cov <= 0) continue
      // 竖直渐变：上浅下深
      const t = y / (size - 1)
      const r = Math.round(79 + (27 - 79) * t)
      const g = Math.round(140 + (79 - 140) * t)
      const b = Math.round(255 + (216 - 255) * t)
      put(x, y, r, g, b, Math.round(255 * Math.min(1, cov)))
    }
  }

  // 三根白柱
  const bars = [
    { x: size * 0.26, h: size * 0.3 },
    { x: size * 0.46, h: size * 0.48 },
    { x: size * 0.66, h: size * 0.38 }
  ]
  const barW = Math.max(2, Math.round(size * 0.1))
  const baseY = size * 0.76
  for (const bar of bars) {
    const x0 = Math.round(bar.x)
    const y0 = Math.round(baseY - bar.h)
    const y1 = Math.round(baseY)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x < x0 + barW; x++) {
        put(x, y, 255, 255, 255, 255)
      }
    }
  }

  const img = nativeImage.createFromBitmap(buf, { width: size, height: size })
  return img
}
