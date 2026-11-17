import { ArrowRight, Moon, Sun } from 'lucide-react'
import { hrefFor, type Route } from '../router'
import type { Theme } from '../hooks/hooks'

interface Props {
  route: Route
  deckCount: number
  theme: Theme
  onToggleTheme: () => void
  onStart: () => void
}

const LINKS: { label: string; route: Route; id: Route['page'] }[] = [
  { label: 'Home', route: { page: 'home' }, id: 'home' },
  { label: 'Study Modes', route: { page: 'modes' }, id: 'modes' },
  { label: 'How It Works', route: { page: 'how' }, id: 'how' },
  { label: 'My Decks', route: { page: 'decks' }, id: 'decks' },
]

export function NavBar({ route, deckCount, theme, onToggleTheme, onStart }: Props) {
  const links = (
    <>
      {LINKS.map((l) => {
        const active = route.page === l.id
        return (
          <a
            key={l.id}
            href={hrefFor(l.route)}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold [transition:background-color_160ms_var(--ease-out),color_160ms_var(--ease-out)] ${
              active ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-accent-soft hover:text-ink'
            }`}
          >
            {l.label}
            {l.id === 'decks' && deckCount > 0 && (
              <span
                className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-accent-ink tabular-nums"
                aria-label={`${deckCount} saved ${deckCount === 1 ? 'deck' : 'decks'}`}
              >
                {deckCount}
              </span>
            )}
          </a>
        )
      })}
    </>
  )

  return (
    <header className="no-print glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <a href="#/" className="mr-2 flex items-center gap-2 rounded-lg" aria-label="TalaTest home">
          <span className="grid size-8 place-items-center rounded-lg bg-accent font-display text-lg font-bold text-accent-ink" aria-hidden>T</span>
          <span className="font-display text-xl font-bold">TalaTest</span>
        </a>
        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
          {links}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            className="btn btn-ghost !min-w-11 !px-3"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            <span className="hidden lg:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Start<span className="hidden sm:inline">&nbsp;Reviewing</span> <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {/* Phones: links live in a scrollable second row so nothing is hidden behind a menu. */}
      <nav aria-label="Primary (mobile)" className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-1 md:hidden">
        {links}
      </nav>
    </header>
  )
}
