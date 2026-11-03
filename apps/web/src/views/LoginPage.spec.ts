import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import LoginPage from './LoginPage.vue'
import { useAuthStore } from '@/stores/auth'

const replace = vi.fn()
const route = { query: { redirect: '/listings' } as Record<string, unknown> }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

function mountPage(initialState?: Record<string, unknown>) {
  return mount(LoginPage, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          ...(initialState ? { initialState } : {}),
        }),
      ],
    },
  })
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    replace.mockReset()
    route.query = { redirect: '/listings' }
  })

  it('offers Google sign-in and passes the redirect along', async () => {
    const wrapper = mountPage()
    const auth = useAuthStore()
    expect(wrapper.text()).toContain('Se connecter avec Google')
    await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
    await flushPromises()
    expect(auth.signInWithGoogle).toHaveBeenCalledWith('/listings')
  })

  it('shows the store error', () => {
    const wrapper = mountPage({ auth: { error: 'Refusé' } })
    expect(wrapper.get('[role="alert"]').text()).toBe('Refusé')
  })

  it('hides the password form unless VITE_AUTH_PASSWORD=1 (production default)', () => {
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="password-form"]').exists()).toBe(false)
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  })

  it('signs in with e-mail and password, then goes where the visitor was going', async () => {
    vi.stubEnv('VITE_AUTH_PASSWORD', '1')
    route.query = { redirect: '/oauth/consent?authorization_id=abc' }
    const wrapper = mountPage()
    const auth = useAuthStore()
    await wrapper.get('input[type="email"]').setValue(' demo@apart.local ')
    await wrapper.get('input[type="password"]').setValue('mot-de-passe')
    await wrapper.get('[data-testid="password-form"]').trigger('submit')
    await flushPromises()
    expect(auth.signInWithPassword).toHaveBeenCalledWith(
      'demo@apart.local',
      'mot-de-passe'
    )
    expect(replace).toHaveBeenCalledWith('/oauth/consent?authorization_id=abc')
  })

  it('creates a local account and never redirects to another origin', async () => {
    vi.stubEnv('VITE_AUTH_PASSWORD', '1')
    route.query = { redirect: 'https://evil.invalid' }
    const wrapper = mountPage()
    const auth = useAuthStore()
    await wrapper.get('input[type="email"]').setValue('moi@apart.local')
    await wrapper.get('input[type="password"]').setValue('mot-de-passe')
    await wrapper.get('[data-testid="password-sign-up"]').trigger('click')
    await flushPromises()
    expect(auth.signUpWithPassword).toHaveBeenCalledWith(
      'moi@apart.local',
      'mot-de-passe'
    )
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('stays on the page when the password is refused', async () => {
    vi.stubEnv('VITE_AUTH_PASSWORD', '1')
    const wrapper = mountPage()
    const auth = useAuthStore()
    vi.mocked(auth.signInWithPassword).mockRejectedValueOnce(new Error('non'))
    await wrapper.get('input[type="email"]').setValue('demo@apart.local')
    await wrapper.get('input[type="password"]').setValue('faux-mdp')
    await wrapper.get('[data-testid="password-form"]').trigger('submit')
    await flushPromises()
    expect(replace).not.toHaveBeenCalled()
  })
})
