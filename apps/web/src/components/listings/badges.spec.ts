import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FitBadge from './FitBadge.vue'
import FitSummary from './FitSummary.vue'
import DpeBadge from './DpeBadge.vue'
import NewBadge from './NewBadge.vue'
import ProvenanceBadge from './ProvenanceBadge.vue'
import RentalPill from './RentalPill.vue'
import StatusBadge from './StatusBadge.vue'
import VerdictPill from './VerdictPill.vue'

describe('badges', () => {
  it('le verdict porte son libellé et sa couleur', () => {
    const target = mount(VerdictPill, { props: { verdict: 'target' } })
    expect(target.text()).toBe('Cible')
    expect(target.classes()).toContain('text-good')
    const off = mount(VerdictPill, { props: { verdict: 'off_target' } })
    expect(off.text()).toBe('Hors cible')
    expect(off.classes()).toContain('text-bad')
    expect(mount(VerdictPill, { props: { verdict: 'to_dig' } }).text()).toBe(
      'À creuser'
    )
  })

  it('« nouvelle » n’apparaît que si le membre n’a pas ouvert l’annonce', () => {
    expect(mount(NewBadge, { props: { isNew: true } }).text()).toBe('nouvelle')
    expect(mount(NewBadge, { props: { isNew: false } }).text()).toBe('')
  })

  it('le DPE est coloré par classe, « ? » si inconnu', () => {
    const d = mount(DpeBadge, { props: { dpe: 'D' } })
    expect(d.text()).toBe('D')
    expect(d.classes()).toContain('bg-dpe-d')
    expect(mount(DpeBadge, { props: { dpe: null } }).text()).toBe('?')
  })

  it('statut et louabilité en français', () => {
    expect(mount(StatusBadge, { props: { status: 'to_visit' } }).text()).toBe(
      'À visiter'
    )
    expect(
      mount(StatusBadge, { props: { status: 'discarded' } }).classes()
    ).toContain('line-through')
    expect(
      mount(RentalPill, { props: { verdict: 'conditional' } }).text()
    ).toBe('Sous conditions')
  })
})

describe('ProvenanceBadge', () => {
  it('l’IA porte sa confiance en pourcentage, colorée ; lot 24 : l’extrait se lit au toucher', async () => {
    const sure = mount(ProvenanceBadge, {
      attachTo: document.body,
      props: {
        provenance: {
          source: 'ai',
          confidence: 0.95,
          evidence: '189 000 € FAI',
        },
      },
    })
    const badge = sure.get('[data-testid="provenance-badge"]')
    expect(badge.element.tagName).toBe('BUTTON')
    expect(badge.text()).toBe('IA 95 %')
    expect(badge.classes()).toContain('text-good')
    expect(badge.attributes('title')).toContain('« 189 000 € FAI »')
    expect(badge.attributes('data-source')).toBe('ai')
    await badge.trigger('click')
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="provenance-detail"]')
        ?.textContent
    ).toContain('Extrait : « 189 000 € FAI »')
    sure.unmount()
    const doubtful = mount(ProvenanceBadge, {
      props: { provenance: { source: 'ai', confidence: 0.3 } },
    })
    expect(doubtful.text()).toBe('IA 30 %')
    expect(doubtful.get('button').classes()).toContain('text-bad')
  })

  it('annonce, vous, open data, estimé ; rien sans provenance', () => {
    expect(
      mount(ProvenanceBadge, {
        props: { provenance: { source: 'listing' } },
      }).text()
    ).toBe('annonce')
    expect(
      mount(ProvenanceBadge, {
        props: { provenance: { source: 'user' } },
      }).text()
    ).toBe('saisi')
    expect(
      mount(ProvenanceBadge, {
        props: { provenance: { source: 'open_data' } },
      }).text()
    ).toBe('open data')
    expect(
      mount(ProvenanceBadge, {
        props: { provenance: { source: 'estimated' } },
      }).text()
    ).toBe('estimé')
    expect(mount(ProvenanceBadge, { props: { provenance: null } }).text()).toBe(
      ''
    )
  })

  it('lot 14 : pastilles d’adéquation, lisibles sans la couleur', () => {
    const levels = ['in', 'to_confirm', 'margin', 'out'] as const
    const badges = levels.map(level =>
      mount(FitBadge, { props: { level } }).find('[data-testid="fit-badge"]')
    )
    expect(badges.map(b => b.text())).toEqual([
      'Dans les critères',
      'À confirmer',
      'À la marge',
      'Hors critères',
    ])
    // Dans : une coche ; à confirmer : un bord pointillé.
    expect(badges[0]?.find('svg').exists()).toBe(true)
    expect(badges[1]?.classes()).toContain('border-dashed')
    expect(badges[2]?.attributes('title')).toContain('marge')
    expect(
      mount(FitBadge, { props: { level: 'margin', count: 2 } }).text()
    ).toBe('À la marge · 2')
  })

  it('lot 14 : résumé d’adéquation, raison, gardée, depuis ; rien sans critère', () => {
    const fit = {
      level: 'out' as const,
      activeCriteria: 1,
      criteriaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: 'Talence',
      reasons: ['Prix +19 % (maximum 220 000 €, marge 5 %)'],
      locationPending: false,
      since: '2026-11-02T09:00:00.000Z',
      origin: {
        cause: 'listing' as const,
        trigger: 'price_up',
        criteriaName: null,
      },
      kept: 'offer' as const,
      criteria: [],
    }
    const wrapper = mount(FitSummary, { props: { fit, since: true } })
    expect(wrapper.find('[data-testid="fit-reason"]').text()).toContain(
      'Prix +19 %'
    )
    expect(wrapper.find('[data-testid="fit-kept"]').text()).toBe(
      'Gardée dans la liste : offre en cours'
    )
    expect(wrapper.find('[data-testid="fit-since"]').text()).toContain(
      'Prix remonté le 2 novembre'
    )
    expect(
      mount(FitSummary, { props: { fit, hideKept: true } })
        .find('[data-testid="fit-kept"]')
        .exists()
    ).toBe(false)
    const inside = mount(FitSummary, {
      props: { fit: { ...fit, level: 'in', reasons: [], kept: null } },
    })
    expect(inside.find('[data-testid="fit-reason"]').text()).toBe('Talence')
    expect(inside.find('[data-testid="fit-since"]').exists()).toBe(false)
    expect(
      mount(FitSummary, { props: { fit: { ...fit, activeCriteria: 0 } } })
        .find('[data-testid="fit-summary"]')
        .exists()
    ).toBe(false)
  })
})
