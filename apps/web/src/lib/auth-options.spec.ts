import { describe, expect, it } from 'vitest'
import { passwordSignInEnabled, safeRedirectPath } from './auth-options'

describe('passwordSignInEnabled', () => {
  it('is on only for VITE_AUTH_PASSWORD=1', () => {
    expect(passwordSignInEnabled({ VITE_AUTH_PASSWORD: '1' })).toBe(true)
    expect(passwordSignInEnabled({ VITE_AUTH_PASSWORD: 'true' })).toBe(false)
    expect(passwordSignInEnabled({ VITE_AUTH_PASSWORD: '0' })).toBe(false)
    expect(passwordSignInEnabled({})).toBe(false)
  })

  it('is off by default (the test environment, like production, sets nothing)', () => {
    expect(passwordSignInEnabled()).toBe(false)
  })
})

describe('safeRedirectPath', () => {
  it('keeps an application path with its query', () => {
    expect(safeRedirectPath('/oauth/consent?authorization_id=x')).toBe(
      '/oauth/consent?authorization_id=x'
    )
  })

  it('refuses another origin or a non-string', () => {
    expect(safeRedirectPath('https://evil.invalid')).toBe('/')
    expect(safeRedirectPath('//evil.invalid')).toBe('/')
    expect(safeRedirectPath('/\\evil.invalid')).toBe('/')
    expect(safeRedirectPath(['/a'])).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
  })
})
