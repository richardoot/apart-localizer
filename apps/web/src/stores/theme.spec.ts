import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { THEME_STORAGE_KEY, useThemeStore } from './theme'

describe('theme store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('follows the system by default and leaves the attribute off', () => {
    const theme = useThemeStore()
    theme.initialize()
    expect(theme.mode).toBe('system')
    expect(theme.resolved).toBe('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('applies and persists an explicit choice', () => {
    const theme = useThemeStore()
    theme.setMode('dark')
    expect(theme.isDark).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    theme.setMode('system')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('restores the stored choice and toggles', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const theme = useThemeStore()
    theme.initialize()
    expect(theme.mode).toBe('dark')
    theme.toggle()
    expect(theme.mode).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    const theme = useThemeStore()
    theme.initialize()
    expect(theme.mode).toBe('system')
  })
})
