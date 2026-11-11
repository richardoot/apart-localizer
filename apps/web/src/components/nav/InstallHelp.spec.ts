import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InstallHelp from './InstallHelp.vue'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const iphone = {
  userAgent: IPHONE,
  maxTouchPoints: 5,
  displayModeStandalone: false,
}

describe('InstallHelp (lot 26)', () => {
  it('dans Safari sur iPhone : les étapes et la condition des notifications', () => {
    const wrapper = mount(InstallHelp, { props: { env: iphone } })
    const help = wrapper.get('[data-testid="install-help"]')
    expect(help.text()).toContain('Installer l’application sur l’iPhone')
    expect(help.text()).toContain('Ouvre ce site dans Safari.')
    expect(help.text()).toContain('« Sur l’écran d’accueil »')
    expect(help.findAll('li')).toHaveLength(4)
    expect(wrapper.get('[data-testid="install-help-push"]').text()).toContain(
      'ne marchent que depuis l’application ajoutée'
    )
  })

  it('sur la page des notifications : pourquoi le push ne s’active pas', () => {
    const wrapper = mount(InstallHelp, {
      props: { env: iphone, context: 'notifications' },
    })
    expect(wrapper.text()).toContain('pas dans Safari')
    expect(wrapper.find('[data-testid="install-help-push"]').exists()).toBe(
      false
    )
  })

  it('installée : une ligne dans « Plus », rien ailleurs', () => {
    const env = { ...iphone, standalone: true }
    expect(
      mount(InstallHelp, { props: { env } })
        .get('[data-testid="install-done"]')
        .text()
    ).toContain('Installée sur l’écran d’accueil.')
    expect(
      mount(InstallHelp, { props: { env, context: 'notifications' } }).html()
    ).not.toContain('install')
  })

  it('un ordinateur ou un Android dans le navigateur : rien', () => {
    expect(
      mount(InstallHelp).find('[data-testid="install-help"]').exists()
    ).toBe(false)
    expect(
      mount(InstallHelp).find('[data-testid="install-done"]').exists()
    ).toBe(false)
  })
})
