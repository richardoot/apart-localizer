import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { fakeDuplicate } from '@/test/fixtures'
import DuplicatesBanner from './DuplicatesBanner.vue'

/** Le lien rend son contenu : le stub global de RouterLink l'avale. */
const stubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('DuplicatesBanner', () => {
  it('ne s’affiche pas sans doublon', () => {
    const wrapper = mount(DuplicatesBanner, { props: { duplicates: [] } })
    expect(wrapper.find('[data-testid="duplicates-banner"]').exists()).toBe(
      false
    )
  })

  it('liste les doublons avec motifs et propose d’ouvrir l’existante ou de créer quand même', async () => {
    const wrapper = mount(DuplicatesBanner, {
      props: { duplicates: [fakeDuplicate()] },
      global: { stubs },
    })
    const text = wrapper.text()
    expect(text).toContain('ressemble à une annonce déjà suivie')
    expect(text).toContain('T2 fictif')
    expect(text).toContain('À visiter')
    expect(text).toContain('Même lien')
    expect(text).toContain('Même commune, surface et prix proches')
    expect(text).toContain('score 100 %')
    await wrapper
      .findAll('button')
      .find(b => b.text().includes("ouvrir l'existante"))
      ?.trigger('click')
    expect(wrapper.emitted('open')).toEqual([
      ['11111111-1111-4111-8111-111111111111'],
    ])
    await wrapper
      .findAll('button')
      .find(b => b.text().includes('Créer quand même'))
      ?.trigger('click')
    expect(wrapper.emitted('ignore')).toHaveLength(1)
  })
})
