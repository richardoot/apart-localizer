import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { fakeDuplicate } from '@/test/fixtures'
import DuplicatesBanner from './DuplicatesBanner.vue'

/** Le lien rend son contenu : le stub global de RouterLink l'avale. */
const stubs = { RouterLink: { template: '<a><slot /></a>' } }

/** Une annonce qui ressemble, sans le même lien ni la même référence. */
const similar = fakeDuplicate({
  certain: false,
  score: 0.8,
  reasons: [
    {
      kind: 'same_commune_price_surface',
      score: 0.8,
      detail: 'Talence : 45 m² contre 45,2 m²',
    },
  ],
})

const buttonWith = (
  wrapper: ReturnType<typeof mount>,
  label: string
): ReturnType<ReturnType<typeof mount>['find']> | undefined =>
  wrapper.findAll('button').find(b => b.text().includes(label))

describe('DuplicatesBanner', () => {
  it('ne s’affiche pas sans doublon', () => {
    const wrapper = mount(DuplicatesBanner, { props: { duplicates: [] } })
    expect(wrapper.find('[data-testid="duplicates-banner"]').exists()).toBe(
      false
    )
  })

  it('liste les doublons avec motifs et propose d’ouvrir l’existante ou de créer quand même', async () => {
    const wrapper = mount(DuplicatesBanner, {
      props: { duplicates: [similar] },
      global: { stubs },
    })
    const text = wrapper.text()
    expect(text).toContain('ressemble à une annonce déjà suivie')
    expect(text).toContain('T2 fictif')
    expect(text).toContain('À visiter')
    expect(text).toContain('Même commune, surface et prix proches')
    expect(text).toContain('score 80 %')
    // Sans lien saisi, rien à ajouter à la fiche existante.
    expect(wrapper.find('[data-action="attach-link"]').exists()).toBe(false)
    await buttonWith(wrapper, "ouvrir l'existante")?.trigger('click')
    expect(wrapper.emitted('open')).toEqual([
      ['11111111-1111-4111-8111-111111111111'],
    ])
    await buttonWith(wrapper, 'Créer quand même')?.trigger('click')
    expect(wrapper.emitted('ignore')).toHaveLength(1)
  })

  it('lot 18 : même lien déjà suivi, jamais « créer quand même » ni d’ajout', () => {
    const wrapper = mount(DuplicatesBanner, {
      props: {
        duplicates: [fakeDuplicate()],
        linkUrl: 'https://exemple.invalid/annonce/1',
      },
      global: { stubs },
    })
    const text = wrapper.text()
    expect(text).toContain(
      'C’est une annonce déjà suivie, publiée sur un autre portail'
    )
    expect(text).toContain('Même annonce : Même lien')
    expect(wrapper.find('[data-testid="link-taken"]').text()).toContain(
      'une même URL ne peut pas être sur deux fiches'
    )
    expect(buttonWith(wrapper, 'Créer quand même')).toBeUndefined()
    expect(wrapper.find('[data-action="attach-link"]').exists()).toBe(false)
    expect(buttonWith(wrapper, 'Ouvrir l’annonce qui a ce lien')).toBeDefined()
  })

  it('lot 18 : même agence et même référence, « C’est la même : ajouter ce lien »', async () => {
    const sameReference = fakeDuplicate({
      title: '[Exemple] T3 68 m², balcon sud',
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
      reasons: [
        {
          kind: 'same_reference',
          score: 1,
          detail: 'Même agence et même référence (EX-2041)',
        },
      ],
    })
    const wrapper = mount(DuplicatesBanner, {
      props: {
        duplicates: [sameReference],
        linkUrl: 'https://www.seloger.com/annonces/0000000202.htm',
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Même agence, même référence')
    expect(wrapper.text()).toContain('réf. EX-2041')
    expect(wrapper.find('[data-certain="true"]').exists()).toBe(true)
    await wrapper.get('[data-action="attach-link"]').trigger('click')
    expect(wrapper.emitted('attach')).toEqual([
      ['11111111-1111-4111-8111-111111111111'],
    ])
    expect(
      buttonWith(wrapper, 'C’en est une autre : créer quand même')
    ).toBeDefined()
  })
})
