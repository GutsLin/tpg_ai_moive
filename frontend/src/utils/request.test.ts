import { describe, expect, it } from 'vitest'

import { resolveApiBaseUrl, shouldRedirectToLoginOnUnauthorized } from './request'

describe('resolveApiBaseUrl', () => {
  it('未配置时回退到同源代理', () => {
    expect(resolveApiBaseUrl()).toBe('')
    expect(resolveApiBaseUrl('')).toBe('')
    expect(resolveApiBaseUrl('   ')).toBe('')
  })

  it('占位域名时回退到同源代理', () => {
    expect(resolveApiBaseUrl('https://api.your-domain.com')).toBe('')
    expect(resolveApiBaseUrl('https://api.your-domain.com/')).toBe('')
    expect(resolveApiBaseUrl('http://api.your-domain.com')).toBe('')
  })

  it('保留显式配置的有效 API 地址', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:23000')).toBe('http://127.0.0.1:23000')
    expect(resolveApiBaseUrl('/backend')).toBe('/backend')
  })

  it('自动剥离尾部 api 前缀，避免请求变成 /api/api/*', () => {
    expect(resolveApiBaseUrl('/api')).toBe('')
    expect(resolveApiBaseUrl('/api/')).toBe('')
    expect(resolveApiBaseUrl('http://127.0.0.1:23000/api')).toBe('http://127.0.0.1:23000')
    expect(resolveApiBaseUrl('https://example.com/api/')).toBe('https://example.com')
  })
})

describe('shouldRedirectToLoginOnUnauthorized', () => {
  it('登录接口返回 401 时不应触发全局跳转', () => {
    expect(
      shouldRedirectToLoginOnUnauthorized({
        response: { status: 401 },
        config: { url: '/api/auth/login' },
      })
    ).toBe(false)
  })

  it('受保护接口返回 401 时仍应触发全局跳转', () => {
    expect(
      shouldRedirectToLoginOnUnauthorized({
        response: { status: 401 },
        config: { url: '/api/assets' },
      })
    ).toBe(true)
  })
})
