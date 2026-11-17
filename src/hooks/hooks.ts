import { useCallback, useEffect, useRef, useState } from 'react'
import { THEME_KEY } from '../utils/storage'

export type Theme = 'light' | 'dark'

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return [theme, toggle]
}

type Handler = (e: KeyboardEvent) => void

/** Global key handlers (ignored while typing; Space/Enter ignored on focused buttons). */
export function useHotkeys(handlers: Record<string, Handler>, enabled = true): void {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const name = e.key === ' ' ? 'Space' : e.key
      const inTabs = !!t?.closest('[role="tablist"]')
      if ((name === 'Space' || name === 'Enter') && t && !inTabs && (t.tagName === 'BUTTON' || t.tagName === 'A')) return
      const h = ref.current[name]
      if (h) {
        e.preventDefault()
        h(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** Stopwatch in ms. `running` toggles ticking; `reset` zeroes it. */
export function useStopwatch(): { ms: number; start: () => void; stop: () => number; reset: () => void; running: boolean } {
  const [ms, setMs] = useState(0)
  const [running, setRunning] = useState(false)
  const startedAt = useRef(0)
  const latest = useRef(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      latest.current = Date.now() - startedAt.current
      setMs(latest.current)
    }, 100)
    return () => window.clearInterval(id)
  }, [running])

  const start = useCallback(() => {
    startedAt.current = Date.now()
    latest.current = 0
    setMs(0)
    setRunning(true)
  }, [])
  const stop = useCallback(() => {
    const final = Date.now() - startedAt.current
    latest.current = final
    setMs(final)
    setRunning(false)
    return final
  }, [])
  const reset = useCallback(() => {
    setRunning(false)
    latest.current = 0
    setMs(0)
  }, [])
  return { ms, start, stop, reset, running }
}

/** Countdown in seconds (fractional). Calls onExpire once when it reaches 0. */
export function useCountdown(
  seconds: number,
  active: boolean,
  resetKey: string,
  onExpire: () => void,
): number {
  const [left, setLeft] = useState(seconds)
  const expire = useRef(onExpire)
  useEffect(() => {
    expire.current = onExpire
  })
  useEffect(() => {
    setLeft(seconds)
    if (!active) return
    const deadline = Date.now() + seconds * 1000
    let fired = false
    const id = window.setInterval(() => {
      const remaining = Math.max(0, (deadline - Date.now()) / 1000)
      setLeft(remaining)
      if (remaining <= 0 && !fired) {
        fired = true
        window.clearInterval(id)
        expire.current()
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [seconds, active, resetKey])
  return left
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 100) / 10
  const m = Math.floor(total / 60)
  const s = (total % 60).toFixed(1).padStart(4, '0')
  return m > 0 ? `${m}:${s}` : `${s}s`
}
