import { useCallback, useEffect, useState } from 'react'

export type StudyMode = 'guide' | 'cards' | 'exam' | 'match'
export const STUDY_MODES: readonly StudyMode[] = ['guide', 'cards', 'exam', 'match']

export type Route =
  | { page: 'home' }
  | { page: 'modes' }
  | { page: 'how' }
  | { page: 'decks' }
  | { page: 'workspace'; mode: StudyMode }

/** Parse a location hash ("#/workspace/cards") into a route. Unknown hashes fall back to home. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
  switch (parts[0]) {
    case 'modes':
      return { page: 'modes' }
    case 'how':
      return { page: 'how' }
    case 'decks':
      return { page: 'decks' }
    case 'workspace': {
      const m = parts[1] as StudyMode | undefined
      return { page: 'workspace', mode: m && STUDY_MODES.includes(m) ? m : 'guide' }
    }
    default:
      return { page: 'home' }
  }
}

export function hrefFor(route: Route): string {
  switch (route.page) {
    case 'home':
      return '#/'
    case 'workspace':
      return `#/workspace/${route.mode}`
    default:
      return `#/${route.page}`
  }
}

/**
 * Hash-based routing: the server only ever sees "/", so a refresh on any page can never 404
 * (no Vercel rewrite needed, and it works from file:// too).
 */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const navigate = useCallback((next: Route) => {
    const href = hrefFor(next)
    if (window.location.hash === href) setRoute(next)
    else window.location.hash = href
  }, [])
  return [route, navigate]
}
