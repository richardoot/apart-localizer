import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
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
  it('l’IA porte sa confiance en pourcentage, colorée, avec l’extrait au survol', () => {
    const sure = mount(ProvenanceBadge, {
      props: {
        provenance: {
          source: 'ai',
          confidence: 0.95,
          evidence: '189 000 € FAI',
        },
      },
    })
    expect(sure.text()).toBe('IA 95 %')
    expect(sure.classes()).toContain('text-good')
    expect(sure.attributes('title')).toContain('« 189 000 € FAI »')
    expect(sure.attributes('data-source')).toBe('ai')
    const doubtful = mount(ProvenanceBadge, {
      props: { provenance: { source: 'ai', confidence: 0.3 } },
    })
    expect(doubtful.text()).toBe('IA 30 %')
    expect(doubtful.classes()).toContain('text-bad')
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
    ).toBe('vous')
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
})
