import { describe, expect, it } from 'vitest'
import { installState, isIos, readInstallEnv } from './install'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_OS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

describe('Lot 26 : l’application sur l’écran d’accueil', () => {
  it('reconnaît un iPhone, et un iPad qui se dit Mac mais tactile', () => {
    expect(isIos({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: IPAD_OS, maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: IPAD_OS, maxTouchPoints: 0 })).toBe(false)
    expect(isIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false)
  })

  it('dans Safari sur iPhone : l’aide ; installée : rien à dire ; ailleurs : rien', () => {
    const base = { maxTouchPoints: 5, displayModeStandalone: false }
    expect(installState({ ...base, userAgent: IPHONE })).toBe('ios-browser')
    expect(installState({ ...base, userAgent: IPHONE, standalone: true })).toBe(
      'installed'
    )
    expect(
      installState({ ...base, userAgent: ANDROID, displayModeStandalone: true })
    ).toBe('installed')
    expect(installState({ ...base, userAgent: ANDROID })).toBe('other')
  })

  it('lit le navigateur courant, et rien hors navigateur', () => {
    expect(readInstallEnv(null)).toEqual({
      userAgent: '',
      maxTouchPoints: 0,
      displayModeStandalone: false,
    })
    const fake = {
      navigator: { userAgent: IPHONE, maxTouchPoints: 5, standalone: true },
      matchMedia: (q: string) => ({
        matches: q === '(display-mode: standalone)',
      }),
    } as unknown as Window & typeof globalThis
    expect(readInstallEnv(fake)).toEqual({
      userAgent: IPHONE,
      maxTouchPoints: 5,
      standalone: true,
      displayModeStandalone: true,
    })
    const bare = {
      navigator: { userAgent: ANDROID },
    } as unknown as Window & typeof globalThis
    expect(installState(readInstallEnv(bare))).toBe('other')
    expect(installState(readInstallEnv())).toBe('other')
  })
})
