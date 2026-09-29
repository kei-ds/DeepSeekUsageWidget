import { net } from 'electron'
import { AUTH_BIZ_CODES, REQUEST_TIMEOUT_MS } from '@shared/constants'
import { monthParams } from './tz'

export class AuthError extends Error {
  constructor(message = '登录态已失效，请重新登录') {
    super(message)
    this.name = 'AuthError'
  }
}

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 解开统一信封 {code, data:{biz_code, biz_data}}。
 * 鉴权错误单独抛 AuthError，好让 UI 区分「要重新登录」和「接口出错了」。
 */
export function unwrap(json: unknown): unknown {
  if (json == null || typeof json !== 'object') throw new ApiError(-1, '响应为空')
  const j = json as Record<string, unknown>

  const code = j.code
  if (typeof code === 'number' && AUTH_BIZ_CODES.includes(code)) {
    // 把服务端原文带上，排查时能直接看出是 token 失效还是别的原因
    const serverMsg = String(j.msg ?? j.message ?? '').trim()
    throw new AuthError(serverMsg ? `登录态已失效：${serverMsg}` : undefined)
  }
  if (typeof code === 'number' && code !== 0) {
    throw new ApiError(code, String(j.msg ?? j.message ?? '接口返回错误'))
  }

  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const bc = d.biz_code
    if (typeof bc === 'number' && AUTH_BIZ_CODES.includes(bc)) {
      const serverMsg = String(d.biz_msg ?? '').trim()
      throw new AuthError(serverMsg ? `登录态已失效：${serverMsg}` : undefined)
    }
    if (typeof bc === 'number' && bc !== 0) {
      throw new ApiError(bc, String(d.biz_msg ?? '业务处理失败'))
    }
    return d.biz_data
  }
  return undefined
}

async function requestJson(url: string, token: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await net.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    })

    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`HTTP ${res.status}`)
    }

    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      // 401 已经提前拦掉；这里多半是网关/反爬返回的 HTML
      throw new ApiError(res.status, `响应不是合法 JSON（HTTP ${res.status}）`)
    }
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
    return json
  } catch (err) {
    if (err instanceof AuthError || err instanceof ApiError) throw err
    const e = err as Error
    if (e.name === 'AbortError') throw new ApiError(-2, '请求超时')
    throw new ApiError(-3, e.message || '网络请求失败')
  } finally {
    clearTimeout(timer)
  }
}

const trimBase = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

export async function fetchBalance(baseUrl: string, token: string): Promise<unknown> {
  const json = await requestJson(`${trimBase(baseUrl)}/api/v0/users/get_user_summary`, token)
  return unwrap(json)
}

export async function fetchMonthAmount(
  baseUrl: string,
  token: string,
  monthKey: string
): Promise<unknown> {
  const { month, year } = monthParams(monthKey)
  const json = await requestJson(
    `${trimBase(baseUrl)}/api/v0/usage/amount?month=${month}&year=${year}`,
    token
  )
  return unwrap(json)
}

export async function fetchMonthCost(
  baseUrl: string,
  token: string,
  monthKey: string
): Promise<unknown> {
  const { month, year } = monthParams(monthKey)
  const json = await requestJson(
    `${trimBase(baseUrl)}/api/v0/usage/cost?month=${month}&year=${year}`,
    token
  )
  return unwrap(json)
}
