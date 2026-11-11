import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = {
  loading: false,
  isAuthenticated: false,
  $subscribe: vi.fn(),
}
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

import router from './index'

describe('router guard', () => {
  beforeEach(async () => {
    authState.isAuthenticated = false
    authState.loading = false
    await router.push('/login')
  })

  it('sends a visitor to the login page, remembering where they were going', async () => {
    await router.push('/?tab=map')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/?tab=map')
  })

  it('lets a signed-in user open the home page and sets the title', async () => {
    authState.isAuthenticated = true
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
    expect(document.title).toBe('Accueil — apart-localizer')
  })

  it('sends a signed-in user away from the login page', async () => {
    authState.isAuthenticated = true
    await router.push('/')
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('protects the nested listing routes and titles them', async () => {
    authState.isAuthenticated = true
    await router.push('/annonces/11111111-1111-4111-8111-111111111111')
    expect(router.currentRoute.value.name).toBe('listing')
    expect(document.title).toBe('Annonce — apart-localizer')
    await router.push('/annonces/nouvelle')
    expect(router.currentRoute.value.name).toBe('listing-new')
    authState.isAuthenticated = false
    await router.push('/annonces?view=map')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/annonces?view=map')
  })

  it('protects the search criteria page and titles it', async () => {
    await router.push('/criteres')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/criteres')
    authState.isAuthenticated = true
    await router.push('/criteres')
    expect(router.currentRoute.value.name).toBe('criteria')
    expect(document.title).toBe('Critères — apart-localizer')
  })

  it('protects the workspace page (lot 8) and titles it', async () => {
    await router.push('/espace')
    expect(router.currentRoute.value.name).toBe('login')
    authState.isAuthenticated = true
    await router.push('/espace')
    expect(router.currentRoute.value.name).toBe('workspace')
    expect(document.title).toBe('Espace — apart-localizer')
  })

  it('lot 20 : protects the opinion criteria page (workspace settings) and titles it', async () => {
    await router.push('/espace/criteres-des-avis')
    expect(router.currentRoute.value.name).toBe('login')
    authState.isAuthenticated = true
    await router.push('/espace/criteres-des-avis')
    expect(router.currentRoute.value.name).toBe('opinion-criteria')
    expect(document.title).toBe('Critères des avis — apart-localizer')
  })

  it('protects the OAuth consent page and keeps authorization_id through the login', async () => {
    await router.push('/oauth/consent?authorization_id=abc123')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe(
      '/oauth/consent?authorization_id=abc123'
    )
    authState.isAuthenticated = true
    await router.push('/oauth/consent?authorization_id=abc123')
    expect(router.currentRoute.value.name).toBe('oauth-consent')
    expect(router.currentRoute.value.meta.bare).toBe(true)
    expect(document.title).toBe('Autorisation — apart-localizer')
  })

  it('redirects an unknown path to the home page (then to login when signed out)', async () => {
    await router.push('/nope/nothing')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/')
  })

  it('waits for the session to be known before deciding', async () => {
    authState.loading = true
    let release: (() => void) | undefined
    authState.$subscribe.mockImplementation((cb: () => void) => {
      release = () => {
        authState.loading = false
        authState.isAuthenticated = true
        cb()
      }
      return vi.fn()
    })
    const navigation = router.push('/')
    // The guard runs on a microtask: wait for it to subscribe before releasing.
    await vi.waitFor(() => expect(release).toBeDefined())
    release?.()
    await navigation
    expect(router.currentRoute.value.name).toBe('home')
  })
})
