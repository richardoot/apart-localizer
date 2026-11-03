import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DpeBadge from './DpeBadge.vue'
import NewBadge from './NewBadge.vue'
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
