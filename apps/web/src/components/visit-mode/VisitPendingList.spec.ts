/**
 * Lot 25 (reste du lot 24) : « Pas de connexion au serveur » se dit une fois
 * pour la liste des changements en attente, pas sous chaque ligne ; un refus
 * ou un conflit garde son message à sa ligne.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { OFFLINE_MESSAGE } from '@/lib/errors'
import type { OutboxEntry, OutboxSummary } from '@/lib/outbox'
import VisitPendingList from './VisitPendingList.vue'

const entry = (id: string, over: Partial<OutboxEntry> = {}): OutboxEntry =>
  ({
    id,
    op: { kind: 'task', taskId: id, done: true, label: `Tâche ${id}` },
    state: 'waiting',
    error: OFFLINE_MESSAGE,
    conflict: false,
    ...over,
  }) as unknown as OutboxEntry

const summary = {
  text: '3 changements en attente du réseau',
  clear: false,
} as unknown as OutboxSummary

describe('Lot 25 : la liste des changements en attente', () => {
  it('dit une seule fois qu’il n’y a pas de connexion, garde les refus à leur ligne', () => {
    const wrapper = mount(VisitPendingList, {
      props: {
        entries: [
          entry('a'),
          entry('b'),
          entry('c', { state: 'blocked', error: 'Tâche introuvable.' }),
        ],
        others: 0,
        summary,
        persistent: true,
      },
    })
    expect(wrapper.findAll('[data-testid="visit-offline"]')).toHaveLength(1)
    expect(wrapper.text().split(OFFLINE_MESSAGE)).toHaveLength(2)
    const own = wrapper.findAll('[data-testid="entry-error"]')
    expect(own.map(e => e.text())).toEqual(['Tâche introuvable.'])
  })

  it('rien à dire sans erreur de réseau', () => {
    const wrapper = mount(VisitPendingList, {
      props: {
        entries: [entry('a', { error: null })],
        others: 0,
        summary,
        persistent: true,
      },
    })
    expect(wrapper.find('[data-testid="visit-offline"]').exists()).toBe(false)
  })
})
