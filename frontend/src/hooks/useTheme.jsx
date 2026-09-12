import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const SPEICHER = 'brickhub-theme'
const ThemeContext = createContext(null)

/** Liest, was gerade gilt - das Startskript in index.html hat die Klasse
 *  bereits gesetzt, also ist sie die Wahrheit. */
function istDunkel() {
  return document.documentElement.classList.contains('dark')
}

function gemerkteWahl() {
  try {
    return localStorage.getItem(SPEICHER)
  } catch {
    return null
  }
}

export function ThemeProvider({ children }) {
  const [dunkel, setDunkel] = useState(istDunkel)

  const anwenden = useCallback((istDunkelNeu) => {
    document.documentElement.classList.toggle('dark', istDunkelNeu)
    setDunkel(istDunkelNeu)
  }, [])

  const umschalten = useCallback(() => {
    const neu = !istDunkel()
    try {
      localStorage.setItem(SPEICHER, neu ? 'dark' : 'light')
    } catch {
      // Nicht speicherbar - die Wahl gilt dann nur fuer diese Sitzung.
    }
    anwenden(neu)
  }, [anwenden])

  // Der Systemeinstellung folgen, solange nichts eigenes gewaehlt wurde
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const beiWechsel = (e) => {
      if (!gemerkteWahl()) anwenden(e.matches)
    }
    mq.addEventListener('change', beiWechsel)
    return () => mq.removeEventListener('change', beiWechsel)
  }, [anwenden])

  return (
    <ThemeContext.Provider value={{ dunkel, umschalten }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme muss innerhalb von ThemeProvider benutzt werden')
  return ctx
}
