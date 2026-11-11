/**
 * Lot 25 : au téléphone, le détail de « Nos avis » se lit en cartes, une par
 * critère (les notes de chacun, l'écart, ce que chacun en dit), le tableau
 * gardé à partir de `sm`. Avis fictifs.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { fakeOpinionSummary, mockupOpinions } from '@/test/fixtures'
import OpinionsDetail from './OpinionsDetail.vue'

const n = (text: string) => text.replace(/\s+/g, ' ').trim()

describe('Lot 25 : « Nos avis » empilé au téléphone', () => {
  const { summary } = fakeOpinionSummary(mockupOpinions(), {})

  it('une carte par critère, désaccords surlignés ; le tableau à partir de sm', () => {
    const wrapper = mount(OpinionsDetail, { props: { summary, tasks: [] } })
    const stack = wrapper.get('[data-testid="opinions-stack"]')
    expect(stack.classes()).toContain('sm:hidden')
    expect(stack.findAll('[data-stack-row]')).toHaveLength(summary.rows.length)
    const quiet = stack.get('[data-stack-row="quiet"]')
    expect(quiet.attributes('data-agreement')).toBe('disagree')
    expect(quiet.classes()).toContain('bg-warn-soft/60')
    expect(n(quiet.text())).toBe(
      'Calme2 pointsRichard4 · bienChloé2 · bofRichard : fenêtres fermées, ça va ; Chloé : bus devant la chambre'
    )
    expect(n(stack.get('[data-stack-row="street"]').text())).toContain('Chloé—')
    const table = wrapper.get('table')
    expect(table.element.parentElement?.className).toContain('hidden')
    expect(table.element.parentElement?.className).toContain('sm:block')
  })
})
