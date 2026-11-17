import { useCallback, useEffect, type ReactElement } from 'react'
import { useTheme } from './hooks/hooks'
import { useRoute, type StudyMode } from './router'
import { DeckProvider, useDeckStore } from './state/deckStore'
import type { Deck } from './types'
import { Decks } from './components/Decks'
import { Home } from './components/Home'
import { HowItWorks } from './components/HowItWorks'
import { NavBar } from './components/NavBar'
import { Studio } from './components/Studio'
import { Workspace } from './components/Workspace'

function Shell() {
  const { deck, decks, notice, openDeck, closeDeck } = useDeckStore()
  const [theme, toggle] = useTheme()
  const [route, navigate] = useRoute()

  // New page → start at the top (the "Study Modes" link scrolls to its section instead).
  useEffect(() => {
    if (route.page !== 'modes') window.scrollTo(0, 0)
  }, [route.page])

  /** Start a brand-new reviewer in the upload studio. */
  const startNew = useCallback(
    (mode: StudyMode = 'guide') => {
      closeDeck()
      navigate({ page: 'workspace', mode })
    },
    [closeDeck, navigate],
  )

  /** Launch a study mode: current deck, else the most recent saved deck, else the upload studio. */
  const launchMode = useCallback(
    (mode: StudyMode) => {
      if (!deck && decks[0]) openDeck(decks[0])
      navigate({ page: 'workspace', mode })
    },
    [deck, decks, openDeck, navigate],
  )

  const openFromLibrary = useCallback(
    (d: Deck, mode: StudyMode) => {
      openDeck(d)
      navigate({ page: 'workspace', mode })
    },
    [openDeck, navigate],
  )

  let page: ReactElement
  switch (route.page) {
    case 'how':
      page = <HowItWorks onStart={() => startNew()} />
      break
    case 'decks':
      page = <Decks onOpen={openFromLibrary} onNew={() => startNew()} />
      break
    case 'workspace':
      page = deck ? (
        <Workspace
          deck={deck}
          mode={route.mode}
          onMode={(mode) => navigate({ page: 'workspace', mode })}
          onBack={() => {
            closeDeck()
            navigate({ page: 'home' })
          }}
        />
      ) : (
        <Studio mode={route.mode} />
      )
      break
    default:
      page = <Home route={route} navigate={navigate} onLaunchMode={launchMode} />
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>
      <NavBar route={route} deckCount={decks.length} theme={theme} onToggleTheme={toggle} onStart={() => startNew()} />
      <div id="main" key={route.page === 'modes' ? 'home' : route.page}>{page}</div>
      {notice && (
        <div role="status" className="animate-rise fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper shadow-lg sm:bottom-6">
          {notice}
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <DeckProvider>
      <Shell />
    </DeckProvider>
  )
}
