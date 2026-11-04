import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { glossaryEntry } from '@apart/contracts'
import DefinitionButton from './DefinitionButton.vue'

describe('DefinitionButton', () => {
  it('ouvre la définition en une phrase du glossaire, la ferme par Échap', async () => {
    const wrapper = mount(DefinitionButton, {
      props: { term: 'gross_yield' },
      attachTo: document.body,
    })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Définition : Rendement brut')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('title')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()
    expect(button.attributes('aria-expanded')).toBe('true')
    const content = document.body.querySelector(
      '[data-definition="gross_yield"]'
    )
    expect(content?.textContent).toContain(
      glossaryEntry('gross_yield')?.short ?? '∅'
    )
    content?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    await flushPromises()
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(
      document.body.querySelector('[data-definition="gross_yield"]')
    ).toBeNull()
    wrapper.unmount()
  })

  it('sans entrée du glossaire, rien ne s’affiche', () => {
    const wrapper = mount(DefinitionButton, { props: { term: 'inconnu' } })
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
