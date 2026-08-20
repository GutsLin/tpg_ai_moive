import { useEffect, useRef } from 'react'

export const usePolling = (fn: () => Promise<void> | void, interval: number, active: boolean) => {
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    if (!active) {
      return
    }

    const timer = window.setInterval(() => {
      void fnRef.current()
    }, interval)

    return () => {
      window.clearInterval(timer)
    }
  }, [active, interval])
}
