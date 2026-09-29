/**
 * 生成 build/icon.png（512x512 应用图标），供 electron-builder 自动转成 .ico。
 *
 * 手工编码 PNG 而不是引第三方图形库：只需要 zlib + CRC32，几十行就够，
 * 且不引入任何原生依赖（原生依赖在中文路径下最容易出问题）。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../build/icon.png')

// ---------------- PNG 编码 ----------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // 每行前面的 filter 字节
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------------- 绘制 ----------------

const buf = Buffer.alloc(SIZE * SIZE * 4)

/** 注意：PNG 的 color type 6 是 RGBA 顺序（索引 0 = 红）。
 *  别和 nativeImage.createFromBitmap 搞混——那个要的是 BGRA。 */
function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  const src = a / 255
  const dstA = buf[i + 3] / 255
  const outA = src + dstA * (1 - src)
  if (outA <= 0) return
  buf[i] = Math.round((r * src + buf[i] * dstA * (1 - src)) / outA)
  buf[i + 1] = Math.round((g * src + buf[i + 1] * dstA * (1 - src)) / outA)
  buf[i + 2] = Math.round((b * src + buf[i + 2] * dstA * (1 - src)) / outA)
  buf[i + 3] = Math.round(outA * 255)
}

const radius = SIZE * 0.22
const bars = [
  { x: 0.25, h: 0.3 },
  { x: 0.45, h: 0.48 },
  { x: 0.65, h: 0.38 }
]
const barW = SIZE * 0.1
const baseY = SIZE * 0.76

/** 圆角矩形的覆盖率（边缘做 1px 渐变，避免锯齿）。 */
function coverage(x, y) {
  const cx = Math.min(Math.max(x, radius), SIZE - radius)
  const cy = Math.min(Math.max(y, radius), SIZE - radius)
  const dist = Math.hypot(x - cx, y - cy)
  if (dist <= radius - 0.5) return 1
  if (dist >= radius + 0.5) return 0
  return radius + 0.5 - dist
}

function inBar(x, y) {
  for (const bar of bars) {
    const x0 = bar.x * SIZE
    const y1 = baseY
    const y0 = baseY - bar.h * SIZE
    if (x >= x0 && x < x0 + barW && y >= y0 && y <= y1) return true
  }
  return false
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // 2x2 超采样，让圆角与柱子边缘都平滑
    let cov = 0
    let barCov = 0
    for (const dy of [0.25, 0.75]) {
      for (const dx of [0.25, 0.75]) {
        cov += coverage(x + dx, y + dy)
        if (coverage(x + dx, y + dy) > 0 && inBar(x + dx, y + dy)) barCov += 1
      }
    }
    cov /= 4
    barCov /= 4
    if (cov <= 0) continue

    // 竖直渐变：上浅下深
    const t = y / (SIZE - 1)
    const r = Math.round(79 + (27 - 79) * t)
    const g = Math.round(140 + (79 - 140) * t)
    const b = Math.round(255 + (216 - 255) * t)
    put(x, y, r, g, b, Math.round(255 * cov))

    if (barCov > 0) put(x, y, 255, 255, 255, Math.round(255 * barCov * cov))
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, encodePng(SIZE, SIZE, buf))
console.log(`已生成 ${OUT} (${SIZE}x${SIZE})`)
