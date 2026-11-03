import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

/** Same key as public/theme-init.js, which applies the choice before first paint. */
export const THEME_STORAGE_KEY = 'apart-localizer-theme'

/**
 * Clair, sombre ou système. Le choix s'exprime par `data-theme` sur <html> :
 * les jetons de src/style.css le lisent, et « système » retire l'attribut
 * pour laisser `prefers-color-scheme` décider.
 */
export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('system')

  function systemPreference(): 'light' | 'dark' {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  const resolved = computed<'light' | 'dark'>(() =>
    mode.value === 'system' ? systemPreference() : mode.value
  )
  const isDark = computed(() => resolved.value === 'dark')

  function apply(): void {
    if (typeof document === 'undefined') return
    if (mode.value === 'system')
      document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', mode.value)
  }

  function setMode(next: ThemeMode): void {
    mode.value = next
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Stockage indisponible : le choix vaut pour la session.
    }
    apply()
  }

  function toggle(): void {
    setMode(resolved.value === 'dark' ? 'light' : 'dark')
  }

  function initialize(): void {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') mode.value = stored
    } catch {
      // Idem.
    }
    apply()
  }

  return { mode, resolved, isDark, setMode, toggle, initialize }
})
