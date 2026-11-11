import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { fakeEvaluated } from '@/test/fixtures'
import ListingsTable from './ListingsTable.vue'

const cheap = fakeEvaluated(
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Moins cher',
    price: 120_000,
  },
  { isNewForMe: true }
)
const dear = fakeEvaluated({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Plus cher',
  price: 260_000,
  dpeClass: 'F',
})

describe('ListingsTable', () => {
  it('rend une ligne par annonce avec verdict, DPE, prix et badge « nouvelle »', () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap, dear] } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('Moins cher')
    expect(rows[0]?.text()).toContain('nouvelle')
    expect(rows[1]?.text()).not.toContain('nouvelle')
    expect(wrapper.findAll('[data-verdict]')).toHaveLength(2)
    expect(rows[1]?.text()).toContain('F')
    expect(wrapper.text()).toContain('€/m²')
  })

  it('lot 9 : « Coût tout compris », et chaque en-tête chiffré marqué de sa base de calcul', () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap, dear] } })
    const header = (start: string) =>
      wrapper.findAll('thead button').find(b => b.text().startsWith(start))
    expect(wrapper.text()).not.toContain('Coût total')
    expect(
      header('Coût tout compris')?.find('[data-basis]').attributes('data-basis')
    ).toBe('all_in')
    for (const [start, basis] of [
      ['Prix cible', 'price'],
      ['Décote', 'price'],
      ['€/m²', 'price'],
      ['Brut', 'all_in'],
      ['Net', 'all_in'],
      ['Effort/mois', 'all_in'],
    ] as const)
      expect(
        header(start)?.find('[data-basis]').attributes('data-basis'),
        start
      ).toBe(basis)
    // Lot 25 : les trois jugements, étiquetés et dans leur ordre.
    expect(header('Rentabilité')?.find('[data-basis]').exists()).toBe(false)
    const labels = wrapper.findAll('thead th').map(th => th.text())
    const at = (label: string) => labels.findIndex(t => t.startsWith(label))
    expect(at('Rentabilité')).toBeLessThan(at('Recherche'))
    expect(at('Recherche')).toBeLessThan(at('Location'))
  })

  it('trie au clic sur un en-tête : décroissant d’abord sur un nombre, puis croissant', async () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap, dear] } })
    const ids = (): string[] =>
      wrapper.findAll('tbody tr').map(r => r.attributes('data-id') ?? '')
    expect(ids()).toEqual([cheap.listing.id, dear.listing.id])
    const priceHeader = wrapper
      .findAll('thead button')
      .find(b => b.text().startsWith('Prix'))
    await priceHeader?.trigger('click')
    expect(ids()).toEqual([dear.listing.id, cheap.listing.id])
    expect(priceHeader?.attributes('data-sort')).toBe('desc')
    expect(priceHeader?.element.closest('th')?.getAttribute('aria-sort')).toBe(
      'descending'
    )
    await priceHeader?.trigger('click')
    expect(ids()).toEqual([cheap.listing.id, dear.listing.id])
    expect(priceHeader?.attributes('data-sort')).toBe('asc')
  })

  it('lot 26 : la ligne s’ouvre au clic (souris) ; au clavier, le lien du titre ; un en-tête triable non trié dit « none »', async () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap] } })
    const row = wrapper.get('tbody tr')
    expect(row.attributes('tabindex')).toBeUndefined()
    await row.trigger('click')
    // Une touche (nouvel onglet) laisse faire le navigateur.
    await row.trigger('click', { metaKey: true })
    expect(wrapper.emitted('open')).toEqual([[cheap.listing.id]])
    const price = wrapper
      .findAll('thead th')
      .find(th => th.text().startsWith('Prix'))
    expect(price?.attributes('aria-sort')).toBe('none')
    expect(
      wrapper.findAll('thead th')[0]?.attributes('aria-sort')
    ).toBeUndefined()
    const empty = mount(ListingsTable, { props: { items: [] } })
    expect(empty.text()).toContain('Aucune annonce ne correspond')
  })

  it('lot 26 : le titre est un vrai lien quand la page le donne', () => {
    const wrapper = mount(ListingsTable, {
      props: {
        items: [cheap],
        linkOf: (id: string) => `/annonces/${id}?etape=a-etudier`,
      },
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    })
    const link = wrapper.get('[data-testid="table-title"]')
    expect(link.attributes('href')).toBe(
      `/annonces/${cheap.listing.id}?etape=a-etudier`
    )
  })
})

describe('ListingsTable : prix cible, décote, classement et comparaison', () => {
  it('affiche le prix cible, la décote colorée et le rang par décote parmi les lignes', () => {
    const wrapper = mount(ListingsTable, { props: { items: [cheap, dear] } })
    const headers = wrapper.findAll('thead button').map(b => b.text())
    expect(headers.some(h => h.startsWith('Prix cible'))).toBe(true)
    expect(headers.some(h => h.startsWith('Décote'))).toBe(true)
    expect(headers.some(h => h.startsWith('Classement'))).toBe(true)
    const rows = wrapper.findAll('tbody tr')
    // Moins cher : déjà dans la cible au prix affiché (marge), rang 1 sur 2.
    expect(
      rows[0]?.find('[data-discount-class]').attributes('data-discount-class')
    ).toBe('in_target')
    expect(rows[0]?.text()).toContain('1/2')
    expect(
      rows[1]?.find('[data-discount-class]').attributes('data-discount-class')
    ).toBe('out_of_reach')
    expect(rows[1]?.text()).toContain('2/2')
  })

  it('lot 26 : coche pour comparer (la sélection est celle de la page), sans ouvrir la fiche', async () => {
    const wrapper = mount(ListingsTable, {
      props: { items: [cheap, dear], selected: [dear.listing.id] },
    })
    const boxes = wrapper.findAll('tbody input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[1]?.element as HTMLInputElement).checked).toBe(true)
    await boxes[0]?.setValue(true)
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('select')).toEqual([[cheap.listing.id, true]])
    // Pleine : les cases non cochées se désactivent.
    await wrapper.setProps({ selectionFull: true })
    expect(boxes[0]?.attributes('disabled')).toBeDefined()
    expect(boxes[1]?.attributes('disabled')).toBeUndefined()
  })
})
