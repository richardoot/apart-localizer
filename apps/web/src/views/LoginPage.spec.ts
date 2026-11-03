import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import LoginPage from './LoginPage.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { redirect: '/listings' } }),
}))

describe('LoginPage', () => {
  it('offers Google sign-in and passes the redirect along', async () => {
    const wrapper = mount(LoginPage, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    const auth = useAuthStore()
    expect(wrapper.text()).toContain('Se connecter avec Google')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(auth.signInWithGoogle).toHaveBeenCalledWith('/listings')
  })

  it('shows the store error', () => {
    const wrapper = mount(LoginPage, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: { auth: { error: 'Refusé' } },
          }),
        ],
      },
    })
    expect(wrapper.get('[role="alert"]').text()).toBe('Refusé')
  })
})
