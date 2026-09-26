import { useSyncExternalStore } from 'react'

/**
 * Light / dark / system theme. The choice is a UI preference (not a credential), so it lives in
 * localStorage; index.html applies it before first paint so a dark page never flashes white.
 * "system" follows the OS setting live.
 */
export type ThemePref = 'light' | 'dark' | 'system'
export const THEME_KEY = 'stocksense-theme'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = typeof window === 'undefined' ? 'system' : readPref()
const listeners = new Set<() => void>()

const resolve = (p: ThemePref): 'light' | 'dark' => (p === 'system' ? (media().matches ? 'dark' : 'light') : p)

function apply() {
  const dark = resolve(pref) === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  media().addEventListener('change', () => {
    if (pref === 'system') apply()
  })
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, next)
  } catch {
    /* private mode: the choice still applies for this visit */
  }
  apply()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** `pref` is what the user picked; `resolved` is what is on screen. */
export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => pref)
  const resolved = useSyncExternalStore(subscribe, () => resolve(pref))
  return { pref: current, resolved, setPref: setThemePref }
}
