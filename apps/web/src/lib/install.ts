/**
 * Lot 26 (ADR 0036) : l'application installée sur l'écran d'accueil de
 * l'iPhone. iOS ne propose jamais l'installation de lui-même : le membre
 * l'ajoute depuis le bouton Partager de Safari. Les notifications push n'y
 * marchent que dans l'application ouverte depuis l'écran d'accueil (WebKit,
 * « Web Push for Web Apps on iOS and iPadOS », iOS 16.4, 16 février 2023).
 * Pur : l'environnement est passé en argument (tests sans navigateur).
 */

/**
 * `installed` : ouverte depuis l'écran d'accueil (n'importe quel appareil) ;
 * `ios-browser` : un iPhone ou un iPad, dans le navigateur (l'aide
 * s'affiche) ; `other` : un autre appareil dans son navigateur (rien à dire).
 */
export type InstallState = 'installed' | 'ios-browser' | 'other'

export interface InstallEnv {
  userAgent: string
  /** `navigator.maxTouchPoints` : un iPad sous iPadOS se dit « Macintosh ». */
  maxTouchPoints: number
  /** `navigator.standalone` (propre à Safari iOS) ; absent ailleurs. */
  standalone?: boolean | undefined
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone: boolean
}

/** Un iPhone, un iPod ou un iPad (iPadOS se présente comme un Mac tactile). */
export function isIos(
  env: Pick<InstallEnv, 'userAgent' | 'maxTouchPoints'>
): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1
}

export function installState(env: InstallEnv): InstallState {
  if (env.standalone === true || env.displayModeStandalone) return 'installed'
  return isIos(env) ? 'ios-browser' : 'other'
}

/** L'environnement du navigateur courant ; `other` hors navigateur. */
export function readInstallEnv(
  win: (Window & typeof globalThis) | null = typeof window === 'undefined'
    ? null
    : window
): InstallEnv {
  if (!win) {
    return { userAgent: '', maxTouchPoints: 0, displayModeStandalone: false }
  }
  const nav = win.navigator as Navigator & { standalone?: boolean }
  const media =
    typeof win.matchMedia === 'function'
      ? win.matchMedia('(display-mode: standalone)')
      : null
  return {
    userAgent: nav.userAgent ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone,
    displayModeStandalone: media?.matches === true,
  }
}
