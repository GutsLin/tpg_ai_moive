import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from './brand'

vi.mock('../api/config', () => ({
  getPublicBranding: vi.fn(),
}))

const BrandConsumer = () => {
  const { state } = useBrand()

  return (
    <div>
      <span>{state.systemName}</span>
      <span>{state.logoUrl ?? 'no-logo'}</span>
    </div>
  )
}

describe('BrandProvider', () => {
  it('加载公开品牌配置后会更新系统名称、Logo 和浏览器标题', async () => {
    const { getPublicBranding } = await import('../api/config')
    document.head.innerHTML = '<link rel="icon" href="/favicon.ico" />'

    vi.mocked(getPublicBranding).mockResolvedValue({
      systemName: '调皮狗云创',
      logoUrl: 'https://oss.example.com/logo.png',
    })

    render(
      <BrandProvider>
        <BrandConsumer />
      </BrandProvider>
    )

    expect(await screen.findByText('调皮狗云创')).toBeInTheDocument()
    expect(screen.getByText('https://oss.example.com/logo.png')).toBeInTheDocument()

    await waitFor(() => {
      expect(document.title).toBe('调皮狗云创')
    })

    const favicon = document.querySelector('link[rel="icon"]')
    expect(favicon).not.toBeNull()
    expect(favicon).toHaveAttribute('href', 'https://oss.example.com/logo.png')
  })
})
