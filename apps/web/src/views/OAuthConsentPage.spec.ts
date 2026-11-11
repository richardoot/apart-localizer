import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { supabase } from '@/lib/supabase'

const replace = vi.fn()
const route = { query: {} as Record<string, unknown> }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))
const leaveApp = vi.hoisted(() => vi.fn())
vi.mock('@/lib/redirect', () => ({ leaveApp }))

import OAuthConsentPage from './OAuthConsentPage.vue'

const oauth = supabase.auth.oauth as unknown as {
  getAuthorizationDetails: ReturnType<typeof vi.fn>
  approveAuthorization: ReturnType<typeof vi.fn>
  denyAuthorization: ReturnType<typeof vi.fn>
}

const DETAILS = {
  authorization_id: 'auth-1',
  redirect_uri: 'http://localhost:33418/callback',
  client: { id: 'c1', name: 'Claude Code' },
  user: { id: 'u1', email: 'demo@apart.local' },
  scope: 'email openid',
}

async function mountPage() {
  const wrapper = mount(OAuthConsentPage)
  await flushPromises()
  return wrapper
}

describe('OAuthConsentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = { authorization_id: 'auth-1' }
    oauth.getAuthorizationDetails.mockResolvedValue({
      data: DETAILS,
      error: null,
    })
  })

  it('refuses without authorization_id, and reads nothing', async () => {
    route.query = {}
    const wrapper = await mountPage()
    expect(wrapper.get('[role="alert"]').text()).toMatch(
      /demande est incomplète/
    )
    expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it('shows the client, the account, the return host and the scopes in sentences', async () => {
    const wrapper = await mountPage()
    expect(oauth.getAuthorizationDetails).toHaveBeenCalledWith('auth-1')
    expect(wrapper.get('[data-testid="consent-client"]').text()).toBe(
      'Claude Code'
    )
    expect(wrapper.text()).toContain('demo@apart.local')
    expect(wrapper.get('[data-testid="consent-redirect"]').text()).toBe(
      'localhost:33418'
    )
    expect(wrapper.get('[data-testid="scope-email"]').text()).toBe(
      'Connaître ton adresse e-mail'
    )
    expect(wrapper.find('[data-testid="scope-openid"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="consent-warning"]').text()).toMatch(
      /sans jamais\s+rien supprimer/
    )
  })

  it('leaves at once when consent was already given', async () => {
    oauth.getAuthorizationDetails.mockResolvedValueOnce({
      data: { redirect_url: 'http://localhost:33418/callback?code=x' },
      error: null,
    })
    await mountPage()
    expect(leaveApp).toHaveBeenCalledWith(
      'http://localhost:33418/callback?code=x'
    )
  })

  it('approves, then sends the person back to the client with the code', async () => {
    oauth.approveAuthorization.mockResolvedValueOnce({
      data: { redirect_url: 'http://localhost:33418/callback?code=abc' },
      error: null,
    })
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="consent-approve"]').trigger('click')
    await flushPromises()
    expect(oauth.approveAuthorization).toHaveBeenCalledWith('auth-1', {
      skipBrowserRedirect: true,
    })
    expect(leaveApp).toHaveBeenCalledWith(
      'http://localhost:33418/callback?code=abc'
    )
  })

  it('denies, and the client learns it', async () => {
    oauth.denyAuthorization.mockResolvedValueOnce({
      data: {
        redirect_url: 'http://localhost:33418/callback?error=access_denied',
      },
      error: null,
    })
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="consent-deny"]').trigger('click')
    await flushPromises()
    expect(oauth.denyAuthorization).toHaveBeenCalledWith('auth-1', {
      skipBrowserRedirect: true,
    })
    expect(leaveApp).toHaveBeenCalledWith(
      'http://localhost:33418/callback?error=access_denied'
    )
  })

  it('goes home when the decision comes back without an address', async () => {
    oauth.denyAuthorization.mockResolvedValueOnce({ data: {}, error: null })
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="consent-deny"]').trigger('click')
    await flushPromises()
    expect(leaveApp).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('shows a refusal from GoTrue and keeps the buttons usable', async () => {
    oauth.approveAuthorization.mockResolvedValueOnce({
      data: null,
      error: { message: 'authorization expired' },
    })
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="consent-approve"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('authorization expired')
    expect(
      wrapper.get('[data-testid="consent-approve"]').attributes('disabled')
    ).toBeUndefined()
    expect(leaveApp).not.toHaveBeenCalled()
  })

  it('shows why the request cannot be read', async () => {
    oauth.getAuthorizationDetails.mockResolvedValueOnce({
      data: null,
      error: { message: 'authorization not found' },
    })
    const wrapper = await mountPage()
    expect(wrapper.get('[role="alert"]').text()).toBe('authorization not found')
    expect(wrapper.find('[data-testid="consent-approve"]').exists()).toBe(false)
  })
})
