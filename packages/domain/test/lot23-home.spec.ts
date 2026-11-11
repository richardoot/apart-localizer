/**
 * Lot 23, le téléphone et l'accueil : « Ce qui t'attend » étendu (visites à
 * venir, messages à valider, relances dues, tâches en retard), toutes les
 * tâches ouvertes par annonce et par retard, la mise en route d'un espace
 * vide. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type { OpenTasksListing, Task } from '@apart/contracts'
import { STAGE_AGENDA_KEYS } from '@apart/contracts'
import {
  DEFAULT_ASSUMPTIONS_LABEL,
  agendaActionLabel,
  assumptionsSaved,
  gettingStarted,
  isOverdueTask,
  isTrackedStatus,
  openTaskAgeText,
  openTaskCounts,
  openTasksSummaryText,
  openTasksView,
  taskOpenDays,
  upcomingVisits,
  workflowOverview,
} from '../src/index.js'
import type {
  WorkflowAgencyFact,
  WorkflowListingFact,
  WorkflowTaskFact,
  WorkflowVisitFact,
} from '../src/index.js'

const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const members = [
  { id: RICHARD, displayName: 'Richard' },
  { id: CHLOE, displayName: 'Chloé' },
]
/** Mardi 10 novembre 2026, 9 h à Paris. */
const NOW = new Date('2026-11-10T08:00:00.000Z')
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString()

const listingFact = (
  over: Partial<WorkflowListingFact> = {}
): WorkflowListingFact => ({
  id: 'l1',
  status: 'to_study',
  fit: { level: 'in', kept: null },
  plannedVisits: 0,
  viewerRated: false,
  lastOffer: null,
  decision: null,
  ...over,
})

const overview = (input: {
  listings?: WorkflowListingFact[]
  plannedVisits?: WorkflowVisitFact[]
  tasks?: WorkflowTaskFact[]
  agency?: WorkflowAgencyFact[]
  overdueDays?: number
  now?: Date | null
}) =>
  workflowOverview({
    viewerId: RICHARD,
    decideTogether: true,
    activeMembers: members,
    listings: input.listings ?? [],
    drafts: [],
    proposals: [],
    ...(input.now === null ? {} : { now: input.now ?? NOW }),
    ...(input.plannedVisits ? { plannedVisits: input.plannedVisits } : {}),
    ...(input.tasks ? { tasks: input.tasks } : {}),
    ...(input.agency ? { agency: input.agency } : {}),
    ...(input.overdueDays ? { overdueDays: input.overdueDays } : {}),
  })

const line = (o: ReturnType<typeof overview>, key: string) =>
  o.agenda.find(item => item.key === key)

describe('« Ce qui t’attend » sur l’accueil', () => {
  it('compte les visites à venir, la plus proche en précision', () => {
    const o = overview({
      listings: [
        listingFact({ id: 'a', status: 'to_visit', plannedVisits: 1 }),
        listingFact({ id: 'b', status: 'to_visit', plannedVisits: 1 }),
        listingFact({ id: 'z', status: 'discarded' }),
      ],
      plannedVisits: [
        { listingId: 'b', visitedAt: '2026-11-15T09:00:00.000Z' },
        { listingId: 'a', visitedAt: '2026-11-12T17:30:00.000Z' },
        // Une visite passée, pas marquée faite : pas « à venir ».
        { listingId: 'a', visitedAt: '2026-11-08T09:00:00.000Z' },
        // Une annonce écartée ne compte pas.
        { listingId: 'z', visitedAt: '2026-11-13T09:00:00.000Z' },
        // Une annonce inconnue non plus.
        { listingId: 'x', visitedAt: '2026-11-13T09:00:00.000Z' },
      ],
    })
    expect(line(o, 'upcoming_visits')).toEqual({
      key: 'upcoming_visits',
      count: 2,
      label: 'visites à venir',
      stage: 'a-visiter',
      detail: 'prochaine : jeudi 12 novembre, 18 h 30',
      listingId: null,
    })
  })

  it('une seule visite à venir ouvre son annonce ; ce matin compte encore (lot 24 : en « visite aujourd’hui »)', () => {
    const o = overview({
      listings: [
        listingFact({ id: 'a', status: 'to_visit', plannedVisits: 1 }),
      ],
      // 8 h à Paris, une heure avant « maintenant » : c'est aujourd'hui.
      plannedVisits: [
        { listingId: 'a', visitedAt: '2026-11-10T07:00:00.000Z' },
      ],
    })
    expect(line(o, 'upcoming_visits')).toBeUndefined()
    expect(line(o, 'visit_today')).toMatchObject({
      count: 1,
      label: 'visite aujourd’hui',
      detail: 'à 8 h',
      listingId: 'a',
    })
  })

  it('les messages à valider et les relances dues, avec l’annonce quand il n’y en a qu’une', () => {
    const o = overview({
      listings: [listingFact({ id: 'a' }), listingFact({ id: 'b' })],
      agency: [
        { listingId: 'a', kind: 'to_approve' },
        { listingId: 'b', kind: 'to_approve' },
        { listingId: 'a', kind: 'follow_up_due' },
      ],
    })
    expect(line(o, 'messages_to_approve')).toEqual({
      key: 'messages_to_approve',
      count: 2,
      label: 'messages à valider',
      stage: null,
      detail: 'avant que Claude les envoie aux agences',
      listingId: null,
    })
    expect(line(o, 'follow_ups_due')).toEqual({
      key: 'follow_ups_due',
      count: 1,
      label: 'relance due',
      stage: null,
      detail: 'une agence n’a pas répondu',
      listingId: 'a',
    })
    const one = overview({
      agency: [{ listingId: 'a', kind: 'to_approve' }],
    })
    expect(line(one, 'messages_to_approve')).toMatchObject({
      label: 'message à valider',
      detail: 'avant que Claude l’envoie à l’agence',
    })
    expect(
      line(
        overview({
          agency: [
            { listingId: 'a', kind: 'follow_up_due' },
            { listingId: 'b', kind: 'follow_up_due' },
          ],
        }),
        'follow_ups_due'
      )?.label
    ).toBe('relances dues')
  })

  it('les tâches en retard des annonces suivies seulement, et les chiffres de l’accueil', () => {
    const o = overview({
      listings: [
        listingFact({ id: 'a' }),
        listingFact({ id: 'b', status: 'visited' }),
        listingFact({ id: 'z', status: 'sold_or_withdrawn' }),
      ],
      tasks: [
        { listingId: 'a', done: false, createdAt: daysAgo(20) },
        { listingId: 'a', done: false, createdAt: daysAgo(15) },
        { listingId: 'a', done: true, createdAt: daysAgo(30) },
        { listingId: 'b', done: false, createdAt: daysAgo(2) },
        { listingId: 'z', done: false, createdAt: daysAgo(40) },
        { listingId: 'inconnue', done: false, createdAt: daysAgo(40) },
      ],
    })
    expect(line(o, 'overdue_tasks')).toEqual({
      key: 'overdue_tasks',
      count: 2,
      label: 'tâches en retard',
      stage: null,
      detail: 'ouvertes depuis plus de 14 jours',
      listingId: 'a',
    })
    expect(o.tasks).toEqual({ open: 3, overdue: 2, overdueDays: 14 })
  })

  it('le délai de retard se règle ; sans tâche, rien', () => {
    const o = overview({
      listings: [listingFact({ id: 'a' })],
      tasks: [{ listingId: 'a', done: false, createdAt: daysAgo(4) }],
      overdueDays: 3,
    })
    expect(line(o, 'overdue_tasks')).toMatchObject({
      count: 1,
      label: 'tâche en retard',
      detail: 'ouvertes depuis plus de 3 jours',
    })
    expect(overview({}).tasks).toEqual({ open: 0, overdue: 0, overdueDays: 14 })
  })

  it('sans « maintenant », l’horloge du moment', () => {
    const o = overview({
      now: null,
      listings: [listingFact({ id: 'a' })],
      tasks: [
        { listingId: 'a', done: false, createdAt: '2000-01-01T00:00:00.000Z' },
      ],
    })
    expect(o.tasks.overdue).toBe(1)
  })

  it('l’ordre : décisions, visites, avis, messages, relances, tâches', () => {
    const o = overview({
      listings: [
        listingFact({ id: 'a' }),
        listingFact({ id: 'b', status: 'to_visit', plannedVisits: 1 }),
        listingFact({ id: 'c', status: 'to_visit' }),
        listingFact({ id: 'd', status: 'visited' }),
      ],
      plannedVisits: [
        { listingId: 'b', visitedAt: '2026-11-11T09:00:00.000Z' },
      ],
      tasks: [{ listingId: 'a', done: false, createdAt: daysAgo(30) }],
      agency: [
        { listingId: 'a', kind: 'to_approve' },
        { listingId: 'a', kind: 'follow_up_due' },
      ],
    })
    expect(o.agenda.map(i => i.key)).toEqual([
      'to_sort',
      'upcoming_visits',
      'visits_to_plan',
      'opinions_to_give',
      'messages_to_approve',
      'follow_ups_due',
      'overdue_tasks',
    ])
    // Une ligne qui ne vise qu'une annonce l'ouvre directement.
    expect(line(o, 'visits_to_plan')?.listingId).toBe('c')
    expect(line(o, 'opinions_to_give')?.listingId).toBe('d')
    // La page Annonces garde les lignes de ses étapes.
    expect(
      o.agenda.filter(i => STAGE_AGENDA_KEYS.includes(i.key)).map(i => i.key)
    ).toEqual(['to_sort', 'visits_to_plan', 'opinions_to_give'])
  })

  it('avis à l’aveugle : aucune note, ni d’un autre membre, dans la réponse', () => {
    const o = overview({
      listings: [
        listingFact({ id: 'd', status: 'visited', viewerRated: false }),
      ],
    })
    const text = JSON.stringify(o)
    expect(text).not.toContain('score')
    expect(text).not.toContain('rating')
    expect(text).not.toContain('Chloé a noté')
  })

  it('chaque ligne a son verbe', () => {
    expect(
      [
        'to_sort',
        'to_confirm',
        'to_settle',
        'ready',
        'visit_today',
        'upcoming_visits',
        'visits_to_plan',
        'opinions_to_give',
        'messages_to_approve',
        'follow_ups_due',
        'overdue_tasks',
      ].map(key => agendaActionLabel(key as never))
    ).toEqual([
      'Trier',
      'Confirmer',
      'Trancher',
      'Finaliser',
      'Mode visite',
      'Préparer',
      'Planifier',
      'Donner mon avis',
      'Relire',
      'Relancer',
      'Voir les tâches',
    ])
  })

  it('upcomingVisits trie et ignore une date illisible', () => {
    const tracked = new Set(['a'])
    expect(
      upcomingVisits(
        [
          { listingId: 'a', visitedAt: 'pas une date' },
          { listingId: 'a', visitedAt: '2026-11-20T09:00:00.000Z' },
          { listingId: 'a', visitedAt: '2026-11-11T09:00:00.000Z' },
        ],
        tracked,
        NOW
      ).map(v => v.visitedAt)
    ).toEqual(['2026-11-11T09:00:00.000Z', '2026-11-20T09:00:00.000Z'])
  })
})

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  listingId: 'l1',
  label: 'Demander la taxe foncière',
  assigneeId: null,
  origin: 'default',
  field: null,
  details: null,
  done: false,
  doneAt: null,
  position: 0,
  createdAt: daysAgo(1),
  requestedAt: null,
  requestId: null,
  answeredAt: null,
  ...over,
})

const listing = (over: Partial<OpenTasksListing> = {}): OpenTasksListing => ({
  id: 'l1',
  title: '[Exemple] T2 Chartrons',
  status: 'to_study',
  stage: 'a-etudier',
  commune: 'Bordeaux',
  ...over,
})

describe('toutes les tâches ouvertes', () => {
  it('l’âge d’une tâche et son retard', () => {
    expect(taskOpenDays(daysAgo(0), NOW)).toBe(0)
    expect(taskOpenDays(daysAgo(18.5), NOW)).toBe(18)
    // Une date dans le futur ou illisible : 0, jamais négatif.
    expect(taskOpenDays(daysAgo(-2), NOW)).toBe(0)
    expect(taskOpenDays('jamais', NOW)).toBe(0)
    expect(isOverdueTask({ done: false, createdAt: daysAgo(15) }, NOW)).toBe(
      true
    )
    expect(isOverdueTask({ done: false, createdAt: daysAgo(14) }, NOW)).toBe(
      false
    )
    expect(isOverdueTask({ done: true, createdAt: daysAgo(40) }, NOW)).toBe(
      false
    )
    expect(isOverdueTask({ done: false, createdAt: 'jamais' }, NOW)).toBe(false)
    expect(isOverdueTask({ done: false, createdAt: daysAgo(4) }, NOW, 3)).toBe(
      true
    )
  })

  it('les annonces suivies seulement', () => {
    expect(isTrackedStatus('to_study')).toBe(true)
    expect(isTrackedStatus('offer_accepted')).toBe(true)
    expect(isTrackedStatus('discarded')).toBe(false)
    expect(isTrackedStatus('offer_refused')).toBe(false)
    expect(
      openTaskCounts(
        [
          {
            status: 'to_visit',
            tasks: [task(), task({ createdAt: daysAgo(20) })],
          },
          { status: 'discarded', tasks: [task()] },
        ],
        NOW
      )
    ).toEqual({ open: 2, overdue: 1, overdueDays: 14 })
  })

  it('par annonce : le retard d’abord, la plus ancienne en tête, puis l’ordre de la fiche', () => {
    const view = openTasksView(
      [
        {
          listing: listing({ id: 'l1', title: 'B' }),
          tasks: [
            task({ id: 'a', position: 0, createdAt: daysAgo(2) }),
            task({ id: 'b', position: 1, createdAt: daysAgo(16) }),
            task({ id: 'c', position: 2, createdAt: daysAgo(30) }),
            task({ id: 'd', position: 3, done: true, createdAt: daysAgo(40) }),
            task({ id: 'e', position: 4, createdAt: daysAgo(1) }),
            task({ id: 'f', position: 5, createdAt: daysAgo(30) }),
          ],
        },
        {
          listing: listing({ id: 'l2', title: 'A' }),
          tasks: [task({ id: 'g', listingId: 'l2' })],
        },
        {
          listing: listing({ id: 'l3', title: 'C' }),
          tasks: [task({ id: 'h' }), task({ id: 'i', position: 1 })],
        },
        {
          listing: listing({ id: 'l4', title: 'Écartée', status: 'discarded' }),
          tasks: [task({ id: 'j', createdAt: daysAgo(40) })],
        },
        {
          listing: listing({ id: 'l5', title: 'Tout fait' }),
          tasks: [task({ id: 'k', done: true })],
        },
      ],
      NOW
    )
    expect(view.open).toBe(8)
    expect(view.overdue).toBe(3)
    expect(view.overdueDays).toBe(14)
    expect(view.groups.map(g => g.listing.id)).toEqual(['l1', 'l3', 'l2'])
    const first = view.groups[0]
    expect(first?.overdue).toBe(3)
    expect(first?.tasks.map(t => t.id)).toEqual(['c', 'f', 'b', 'a', 'e'])
    expect(first?.tasks[0]).toMatchObject({ overdue: true, openDays: 30 })
    expect(first?.tasks[3]).toMatchObject({ overdue: false, openDays: 2 })
  })

  it('à égalité, par titre', () => {
    const view = openTasksView(
      [
        { listing: listing({ id: 'l1', title: 'Talence' }), tasks: [task()] },
        { listing: listing({ id: 'l2', title: 'Bègles' }), tasks: [task()] },
      ],
      NOW,
      14
    )
    expect(view.groups.map(g => g.listing.title)).toEqual(['Bègles', 'Talence'])
  })

  it('les phrases', () => {
    expect(openTaskAgeText(0)).toBe('ouverte aujourd’hui')
    expect(openTaskAgeText(1)).toBe('ouverte hier')
    expect(openTaskAgeText(18)).toBe('ouverte depuis 18 jours')
    expect(openTasksSummaryText({ open: 0, overdue: 0 })).toBe(
      'Aucune tâche ouverte'
    )
    expect(openTasksSummaryText({ open: 1, overdue: 0 })).toBe(
      '1 tâche ouverte'
    )
    expect(openTasksSummaryText({ open: 71, overdue: 25 })).toBe(
      '71 tâches ouvertes, dont 25 en retard'
    )
  })
})

describe('la mise en route', () => {
  const facts = {
    assumptionsSaved: false,
    criteriaCount: 0,
    listingCount: 0,
    draftCount: 0,
    claudeSeen: false,
  }

  it('un espace vide : la liste entière, rien de fait, dans l’ordre', () => {
    const g = gettingStarted(facts)
    expect(g.mode).toBe('full')
    expect(g.doneCount).toBe(0)
    expect(g.steps.map(s => s.key)).toEqual([
      'assumptions',
      'criteria',
      'listing',
      'claude',
    ])
    expect(g.steps.every(s => !s.done)).toBe(true)
    expect(g.steps[3]?.text).toContain('à sa première écriture')
  })

  it('des annonces à valider seulement : la liste en bref, qui le dit', () => {
    const g = gettingStarted({ ...facts, draftCount: 2 })
    expect(g.mode).toBe('compact')
    expect(g.steps[2]?.done).toBe(false)
    expect(g.steps[2]?.text).toBe(
      '2 annonces attendent à l’étape À valider : garde celles qui te plaisent.'
    )
    expect(
      gettingStarted({ ...facts, draftCount: 1 }).steps[2]?.text
    ).toContain('1 annonce attend')
  })

  it('ce qui est fait se dit ; tout fait : plus rien', () => {
    const some = gettingStarted({
      ...facts,
      assumptionsSaved: true,
      criteriaCount: 2,
      listingCount: 1,
    })
    expect(some.mode).toBe('compact')
    expect(some.doneCount).toBe(3)
    expect(some.steps.map(s => s.text).slice(0, 3)).toEqual([
      'Enregistrées : chaque annonce se calcule avec elles.',
      '2 critères actifs.',
      '1 annonce suivie.',
    ])
    const all = gettingStarted({
      assumptionsSaved: true,
      criteriaCount: 1,
      listingCount: 3,
      draftCount: 0,
      claudeSeen: true,
    })
    expect(all.mode).toBe('none')
    expect(all.doneCount).toBe(4)
    expect(all.steps[1]?.text).toBe('1 critère actif.')
    expect(all.steps[2]?.text).toBe('3 annonces suivies.')
    expect(all.steps[3]?.text).toBe('Claude a déjà écrit dans l’espace.')
  })

  it('les hypothèses enregistrées : plus d’une version, ou une autre que celle d’office', () => {
    expect(assumptionsSaved([])).toBe(false)
    expect(assumptionsSaved([{ label: DEFAULT_ASSUMPTIONS_LABEL }])).toBe(false)
    expect(assumptionsSaved([{ label: 'Reprise de l’artefact' }])).toBe(true)
    expect(assumptionsSaved([{ label: null }])).toBe(true)
    expect(
      assumptionsSaved([
        { label: DEFAULT_ASSUMPTIONS_LABEL },
        { label: DEFAULT_ASSUMPTIONS_LABEL },
      ])
    ).toBe(true)
  })
})
