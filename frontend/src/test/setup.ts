import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

class MemoryStorage {
  private store = new Map<string, string>()

  public getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  public setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  public removeItem(key: string) {
    this.store.delete(key)
  }

  public clear() {
    this.store.clear()
  }
}

Object.defineProperty(window, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class ResizeObserverMock {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})

configure({
  asyncUtilTimeout: 8_000,
})

const originalGetComputedStyle = window.getComputedStyle.bind(window)

window.getComputedStyle = ((element: Element, pseudoElt?: string) => {
  if (pseudoElt) {
    return originalGetComputedStyle(element)
  }

  return originalGetComputedStyle(element, pseudoElt)
}) as typeof window.getComputedStyle

afterEach(() => {
  cleanup()
})
