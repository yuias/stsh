export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/** Shared with the pre-paint snippet in `index.html`. */
const STORAGE_KEY = 'stsh.theme'

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

function readStoredOverride(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : null
  } catch {
    // Private browsing modes can throw on access; fall back to the OS setting.
    return null
  }
}

const state = $state<{ override: Theme | null }>({ override: readStoredOverride() })

/** The manual choice, or null while following the OS setting. */
export function themeOverride(): Theme | null {
  return state.override
}

/** Pass null to go back to following the OS setting. */
export function setThemeOverride(next: Theme | null): void {
  state.override = next

  try {
    if (next) localStorage.setItem(STORAGE_KEY, next)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Persisting is best-effort; the choice still applies to this session.
  }

  syncDocumentTheme()
}

/**
 * The palette itself is `light-dark()` in CSS, so a manual choice only has to
 * pin `color-scheme` — which `:root[data-theme]` does. Removing the attribute
 * hands the decision back to `prefers-color-scheme`.
 */
export function syncDocumentTheme(): void {
  const root = document.documentElement
  if (state.override) root.dataset.theme = state.override
  else delete root.dataset.theme
}
