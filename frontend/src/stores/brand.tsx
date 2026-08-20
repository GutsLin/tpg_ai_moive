import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { getPublicBranding } from '../api/config'

export interface BrandState {
  systemName: string
  logoUrl: string | null
  hydrated: boolean
}

interface BrandContextValue {
  state: BrandState
  refresh: () => Promise<void>
}

const defaultBrandState: BrandState = {
  systemName: 'Narrix',
  logoUrl: null,
  hydrated: false,
}

const defaultContextValue: BrandContextValue = {
  state: defaultBrandState,
  refresh: async () => undefined,
}

const BrandContext = createContext<BrandContextValue>(defaultContextValue)

export const BrandProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<BrandState>(defaultBrandState)

  const refresh = async () => {
    try {
      const result = await getPublicBranding()
      setState({
        systemName: result.systemName || defaultBrandState.systemName,
        logoUrl: result.logoUrl,
        hydrated: true,
      })
    } catch {
      setState({
        ...defaultBrandState,
        hydrated: true,
      })
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    document.title = state.systemName || defaultBrandState.systemName
  }, [state.systemName])

  useEffect(() => {
    const faviconHref = state.logoUrl || '/favicon.ico'
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')

    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.appendChild(favicon)
    }

    favicon.href = faviconHref
  }, [state.logoUrl])

  const value = useMemo<BrandContextValue>(
    () => ({
      state,
      refresh,
    }),
    [state]
  )

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)
