/**
 * Lot 19, une fiche en sept questions : « Ce qui plaît » et « À surveiller »
 * choisis dans les données (rien d'inventé, rien si rien), la liste « À
 * faire » qui fusionne tâches, questions à l'annonceur et visites, sa
 * pastille, les prochaines étapes, et les repères des onglets (écart au
 * marché, barre du coût, jauges du prix et du loyer). Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { AssumptionsSchema } from '@apart/contracts'
import type {
  ListingOpenDataContext,
  RentalChecksResult,
} from '@apart/contracts'
import {
  HIGHLIGHTS_MAX,
  applyScenario,
  compute,
  costShares,
  filterTodo,
  formatDistance,
  formatWholePercent,
  listingHighlights,
  marketGap,
  nextSteps,
  priceRangeGauge,
  rentGauge,
  rentalChecks,
  studyInputFromListing,
  targetPrice,
  todoItems,
  todoPendingCount,
  todoProgress,
  visitWhen,
} from '../src/index.js'
import type {
  HighlightsInput,
  TodoRequestLike,
  TodoTaskLike,
  TodoVisitLike,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS as A, financials } from './helpers.js'

const at = '2026-11-03T10:00:00.000Z'
/** Les espaces fines insécables de fr-FR, en espaces simples. */
const n = (text: string | undefined): string | undefined =>
  text?.replace(/[\u202f\u00a0]/g, ' ')

function openData(
  over: Partial<ListingOpenDataContext> = {}
): ListingOpenDataContext {
  return {
    market: null,
    dpe: null,
    rentControl: null,
    transit: null,
    surroundings: null,
    ...over,
  }
}

function rental(
  checks: RentalChecksResult['checks'],
  verdict: RentalChecksResult['verdict'] = 'compatible'
): RentalChecksResult {
  return {
    year: 2028,
    verdict,
    checks,
    rank: 0,
    unknownCount: checks.filter(c => c.level === 'unknown').length,
  }
}

function input(over: Partial<HighlightsInput> = {}): HighlightsInput {
  return {
    metrics: null,
    rental: null,
    targetPrice: null,
    dpeClass: null,
    openData: null,
    votedWorks: null,
    proceedings: null,
    ...over,
  }
}

describe('ce qui plaît, à surveiller', () => {
  it('rien si rien : aucune donnée, aucun point', () => {
    expect(listingHighlights(input())).toEqual({ good: [], watch: [] })
  })

  it('choisit les points dans les données, trois au plus, chacun vers son onglet', () => {
    const f = financials({
      price: 150_000,
      targetRent: 900,
      rentControlled: true,
      referenceRentPerM2: 22,
      dpeClass: 'C',
      renovationTotal: 12_000,
      annualCharges: 1200,
      propertyTax: 900,
    })
    const metrics = compute(f, A)
    expect(metrics.verdict).toBe('target')
    const result = listingHighlights(
      input({
        metrics,
        rental: rentalChecks(
          {
            dpeClass: 'C',
            year: null,
            marketRent: null,
            demand: null,
            coOwnershipAllowsRental: 'unknown',
            decencyCompliant: 'unknown',
            rentalPermitRequired: 'unknown',
          },
          metrics,
          A
        ),
        targetPrice: targetPrice(f, A),
        dpeClass: 'C',
        openData: openData({
          market: {
            medianPricePerM2: 3600,
            count: 12,
            radiusMeters: 500,
            computedAt: at,
          },
          transit: {
            nearestTram: {
              name: '[Exemple] Arrêt',
              mode: 'tram',
              lines: ['A'],
              distanceMeters: 450,
              point: { type: 'Point', coordinates: [-0.6, 44.84] },
            },
            computedAt: at,
          },
        }),
        votedWorks: 'Ravalement 2025, quote-part à demander',
        proceedings: 'Aucune procédure connue',
        askedFields: ['votedWorks'],
      })
    )
    expect(result.good).toHaveLength(HIGHLIGHTS_MAX)
    expect(result.good.map(h => [h.key, h.tab])).toEqual([
      ['target', 'budget'],
      ['below_market', 'negocier'],
      ['tram', 'quartier'],
    ])
    expect(result.good[0]?.text).toBe(
      `Dans la cible au prix affiché (rendement brut ${(
        metrics.grossYield * 100
      ).toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} %)`
    )
    // 150 000 / 45 = 3 333 €/m² pour une médiane de 3 600 : 7 % sous.
    expect(result.good[1]?.text).toBe(
      'Prix au m² 7 % sous les ventes du quartier (DVF)'
    )
    expect(result.good[2]?.text).toBe('Tram A à 450 m ([Exemple] Arrêt)')
    // Travaux, puis travaux votés (demandés : vers « À faire ») ; « Aucune
    // procédure » ne se surveille pas.
    expect(result.watch.map(h => [h.key, h.tab])).toEqual([
      ['works', 'bien'],
      ['voted_works', 'a-faire'],
    ])
    expect(n(result.watch[0]?.text)).toBe(
      'Travaux avant d’emménager : 12 000 € estimés'
    )
    expect(result.watch[1]?.text).toBe(
      'Travaux votés : Ravalement 2025, quote-part à demander'
    )
  })

  it('DPE sans interdiction, loyer sous le plafond, drive proche', () => {
    const f = financials({
      targetRent: 600,
      rentControlled: true,
      referenceRentPerM2: 15,
      price: 400_000,
      propertyTax: 800,
      annualCharges: 600,
    })
    const metrics = compute(f, A)
    const result = listingHighlights(
      input({
        metrics,
        targetPrice: targetPrice(f, A),
        dpeClass: 'B',
        rental: rental([
          {
            key: 'dpe_ban',
            level: 'ok',
            message: 'DPE B : aucune interdiction de location prévue.',
          },
        ]),
        openData: openData({
          surroundings: {
            supermarkets: {
              nearest: {
                drive: 'yes',
                distanceMeters: 900,
              },
            },
          } as unknown as ListingOpenDataContext['surroundings'],
        }),
        approximate: true,
      })
    )
    expect(result.good.map(h => h.key)).toEqual([
      'dpe',
      'rent_under_cap',
      'drive',
    ])
    expect(result.good[0]?.text).toBe(
      'DPE B : aucune interdiction de location prévue'
    )
    expect(result.good[1]?.text).toBe(
      'Loyer visé sous le plafond d’encadrement (600 € pour 675 €)'
    )
    expect(result.good[2]?.text).toBe('Supermarché avec drive à ≈ 900 m')
    // Hors cible au prix affiché : la décote nécessaire, et l'adresse approchée.
    expect(result.watch.map(h => h.key)).toEqual(['discount', 'approximate'])
    expect(result.watch[0]?.tab).toBe('negocier')
    expect(result.watch[0]?.text).toMatch(
      /^Décote de .* % nécessaire pour la cible \(prix cible .* €\)$/
    )
  })

  it('un drive à vérifier, un tram loin ou un DPE sans classe ne comptent pas', () => {
    const metrics = compute(financials({ price: 400_000 }), A)
    const result = listingHighlights(
      input({
        metrics: { ...metrics, verdict: 'to_dig' },
        dpeClass: null,
        rental: rental([
          { key: 'dpe_ban', level: 'ok', message: 'DPE inconnu.' },
        ]),
        openData: openData({
          transit: {
            nearestTram: {
              name: 'Loin',
              mode: 'tram',
              lines: [],
              distanceMeters: 1800,
              point: { type: 'Point', coordinates: [-0.6, 44.84] },
            },
            computedAt: at,
          },
          surroundings: {
            supermarkets: {
              nearest: { drive: 'to_verify', distanceMeters: 300 },
            },
          } as unknown as ListingOpenDataContext['surroundings'],
        }),
      })
    )
    expect(result.good).toEqual([])
  })

  it('à surveiller : blocages de location, DPE interdit plus tard, loyer au-dessus du plafond, valeurs manquantes', () => {
    const metrics = compute(
      financials({
        targetRent: 900,
        rentControlled: true,
        referenceRentPerM2: 15,
        propertyTax: null,
        annualCharges: null,
      }),
      A
    )
    const checks: RentalChecksResult['checks'] = [
      {
        key: 'dpe_ban',
        level: 'warn',
        message:
          'DPE E : louable en 2028, mais interdit à partir de 2034. Travaux à prévoir avant cette date.',
      },
      {
        key: 'co_ownership',
        level: 'bad',
        message: 'Le règlement de copropriété interdit la location visée.',
      },
      { key: 'decency', level: 'unknown', message: 'Décence à vérifier.' },
    ]
    const result = listingHighlights(
      input({
        metrics: { ...metrics, verdict: 'target' },
        rental: rental(checks, 'incompatible'),
        proceedings: '   ',
      })
    )
    expect(result.watch.map(h => [h.key, h.tab])).toEqual([
      ['rental_dpe_ban', 'bien'],
      ['rental_co_ownership', 'budget'],
      ['rent_over_cap', 'budget'],
    ])
    expect(result.watch[0]?.text).toBe(
      'DPE E : louable en 2028, mais interdit à partir de 2034. Travaux à prévoir avant cette date'
    )
    expect(n(result.watch[2]?.text)).toBe(
      'Loyer visé au-dessus du plafond d’encadrement (900 € pour 675 €) : le plafond est retenu'
    )

    const missingFinancials = financials({
      propertyTax: null,
      annualCharges: null,
    })
    const missing = listingHighlights(
      input({
        metrics: compute(missingFinancials, A),
        targetPrice: targetPrice(missingFinancials, A),
        proceedings:
          'Une procédure contre un copropriétaire défaillant, depuis 2024, montant non précisé par le syndic',
        askedFields: ['propertyTax'],
      })
    )
    expect(missing.watch.map(h => [h.key, h.tab])).toEqual([
      ['proceedings', 'bien'],
      ['discount', 'negocier'],
      ['property_tax', 'a-faire'],
    ])
    expect(missing.watch[0]?.text.endsWith('…')).toBe(true)
    expect(missing.watch[0]?.text.length).toBeLessThanOrEqual(
      'Procédures : '.length + 60
    )
    expect(missing.watch[2]?.text).toBe(
      'Taxe foncière manquante, demandée à l’annonceur : estimée à un mois de loyer'
    )

    const charges = listingHighlights(
      input({
        metrics: {
          ...compute(financials({ propertyTax: null, annualCharges: null }), A),
          verdict: 'target',
        },
        askedFields: ['annualCharges'],
        proceedings: 'Néant',
        votedWorks: 'Pas de travaux votés',
      })
    )
    expect(charges.watch.map(h => [h.key, h.tab])).toEqual([
      ['property_tax', 'bien'],
      ['charges', 'a-faire'],
    ])
    expect(charges.watch[1]?.text).toBe(
      'Charges de copropriété inconnues, demandées à l’annonceur'
    )
    const plain = listingHighlights(
      input({
        metrics: {
          ...compute(financials({ propertyTax: 500, annualCharges: null }), A),
          verdict: 'target',
        },
      })
    )
    expect(plain.watch).toEqual([
      { key: 'charges', text: 'Charges de copropriété inconnues', tab: 'bien' },
    ])
  })

  it('au-dessus du marché : vers Négocier', () => {
    const metrics = compute(financials({ price: 200_000 }), A)
    const result = listingHighlights(
      input({
        metrics: { ...metrics, verdict: 'target', annualCharges: 1200 },
        openData: openData({
          market: {
            medianPricePerM2: 4000,
            count: 8,
            radiusMeters: 500,
            computedAt: at,
          },
        }),
      })
    )
    expect(result.watch[0]).toEqual({
      key: 'above_market',
      text: 'Prix au m² 11 % au-dessus des ventes du quartier (DVF)',
      tab: 'negocier',
    })
  })

  it('formats : distances et pour cent entiers', () => {
    expect(formatDistance(449.6)).toBe('450 m')
    expect(formatDistance(1234)).toBe('1,2 km')
    expect(formatDistance(Number.NaN)).toBe('—')
    expect(formatWholePercent(-0.068)).toBe('7 %')
  })
})

describe('repères : écart au marché, barre du coût, jauges', () => {
  it('écart du prix au m² à la médiane DVF', () => {
    expect(marketGap(3150, 3000)).toBeCloseTo(0.05, 9)
    expect(marketGap(3150, null)).toBeNull()
    expect(marketGap(3150, 0)).toBeNull()
    expect(marketGap(Number.NaN, 3000)).toBeNull()
    expect(marketGap(0, 3000)).toBeNull()
  })

  it('le coût tout compris réparti, parts nulles omises', () => {
    const m = compute(financials({ renovationTotal: 18_000 }), A)
    const shares = costShares(m)
    expect(shares.map(s => s.key)).toEqual([
      'price',
      'notary',
      'renovation',
      'furniture',
    ])
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 9)
    expect(
      costShares({ ...m, furnitureValue: 0, renovationTotal: 0 }).map(
        s => s.key
      )
    ).toEqual(['price', 'notary'])
    expect(costShares({ ...m, totalCost: 0 })).toEqual([])
  })

  it('la jauge de Négocier se resserre autour des prix', () => {
    const g = priceRangeGauge(214_000, 207_000, 206_000)
    expect(g).toEqual({
      min: 197_000,
      max: 217_000,
      listedShare: (214_000 - 197_000) / 20_000,
      targetShare: (207_000 - 197_000) / 20_000,
      offerShare: (206_000 - 197_000) / 20_000,
    })
    const alone = priceRangeGauge(200_000, null, null)
    expect(alone?.targetShare).toBeNull()
    expect(alone?.offerShare).toBeNull()
    expect(alone?.min).toBe(192_000)
    expect(priceRangeGauge(0, 100, 100)).toBeNull()
  })

  it('la jauge du loyer : visé, marché, plafond', () => {
    const g = rentGauge({
      targetRent: 890,
      marketLow: 870,
      marketHigh: 940,
      rentCap: 959,
    })
    // De 690 € (80 % de 870, à la dizaine) à 3 % au-dessus du plafond.
    const top = 959 * 1.03
    expect(g?.min).toBe(690)
    expect(g?.max).toBeCloseTo(top, 9)
    expect(g?.targetShare).toBeCloseTo((890 - 690) / (top - 690), 9)
    expect(g?.marketFromShare).toBeCloseTo((870 - 690) / (top - 690), 9)
    expect(g?.marketToShare).toBeCloseTo((940 - 690) / (top - 690), 9)
    expect(g?.capShare).toBeCloseTo((959 - 690) / (top - 690), 9)
    // Le loyer de marché seul : une fourchette d'un point.
    const single = rentGauge({
      targetRent: 700,
      marketLow: null,
      marketHigh: 650,
      rentCap: null,
    })
    expect(single?.marketFromShare).toBe(single?.marketToShare)
    expect(single?.capShare).toBeNull()
    const bare = rentGauge({
      targetRent: 700,
      marketLow: 0,
      marketHigh: null,
      rentCap: 0,
    })
    expect(bare?.min).toBe(560)
    expect(bare?.max).toBeCloseTo(721, 9)
    expect(bare?.targetShare).toBeCloseTo((700 - 560) / (721 - 560), 9)
    expect(bare).toMatchObject({
      marketFromShare: null,
      marketToShare: null,
      capShare: null,
    })
    expect(
      rentGauge({ targetRent: 0, marketLow: 1, marketHigh: 2, rentCap: 3 })
    ).toBeNull()
  })
})

const TASK = (over: Partial<TodoTaskLike> & { id: string }): TodoTaskLike => ({
  label: 'Tâche',
  field: null,
  done: false,
  doneAt: null,
  position: 0,
  requestId: null,
  requestedAt: null,
  answeredAt: null,
  ...over,
})

const REQUEST = (
  over: Partial<TodoRequestLike> & { id: string }
): TodoRequestLike => ({
  status: 'draft',
  taskIds: [],
  createdAt: at,
  sentAt: null,
  answeredAt: null,
  followUpDue: false,
  ...over,
})

describe('À faire : une seule liste', () => {
  const tasks: TodoTaskLike[] = [
    TASK({
      id: 't-devis',
      label: 'Demander un devis pour la salle de bain à un artisan',
      position: 3,
    }),
    TASK({
      id: 't-raval',
      label: 'Demander la quote-part du ravalement',
      position: 1,
    }),
    TASK({
      id: 't-taxe',
      label: 'Demander le montant de la taxe foncière',
      field: 'propertyTax',
      position: 2,
    }),
    TASK({
      id: 't-banque',
      label: 'Simuler le prêt avec la banque',
      position: 4,
      done: true,
      doneAt: '2026-11-02T09:00:00.000Z',
    }),
    TASK({
      id: 't-diag',
      label: 'Demander les diagnostics complets',
      position: 5,
      done: true,
      doneAt: '2026-11-01T09:00:00.000Z',
      answeredAt: '2026-11-01T09:00:00.000Z',
      requestId: 'r-diag',
    }),
    TASK({ id: 't-banal', label: 'Vérifier la cave', position: 6 }),
  ]
  const requests: TodoRequestLike[] = [
    REQUEST({
      id: 'r-raval',
      status: 'draft',
      taskIds: ['t-raval'],
      subject: '[Exemple] Quote-part du ravalement',
    }),
    REQUEST({
      id: 'r-taxe',
      status: 'sent',
      taskIds: ['t-taxe'],
      sentAt: '2026-10-27T09:00:00.000Z',
      followUpDue: true,
      recipientName: '[Exemple] Agence',
      subject: '[Exemple] Taxe foncière',
    }),
    REQUEST({
      id: 'r-diag',
      status: 'answered',
      taskIds: ['t-diag'],
      sentAt: '2026-10-25T09:00:00.000Z',
      answeredAt: '2026-11-01T09:00:00.000Z',
    }),
  ]
  const visits: TodoVisitLike[] = [
    { id: 'v-done', visitedAt: '2026-10-20T08:00:00.000Z', status: 'done' },
    { id: 'v-next', visitedAt: '2026-11-09T09:00:00.000Z', status: 'planned' },
  ]

  it('fusionne visites, questions à l’annonceur et tâches ; le fait en bas', () => {
    const items = todoItems({ tasks, requests, visits })
    expect(items.map(i => [i.key, i.group, i.state])).toEqual([
      ['visit:v-next', 'visit', 'planned'],
      ['task:t-raval', 'agency', 'draft'],
      ['task:t-taxe', 'agency', 'follow_up_due'],
      ['task:t-devis', 'agency', 'open'],
      ['task:t-banal', 'us', 'open'],
      ['task:t-banque', 'us', 'done'],
      ['task:t-diag', 'agency', 'answered'],
      ['visit:v-done', 'visit', 'visited'],
    ])
    const byKey = new Map(items.map(i => [i.key, i]))
    expect(byKey.get('visit:v-next')).toMatchObject({
      title: 'Visite lundi 9 novembre, 10 h',
      stateLabel: 'Planifiée',
      done: false,
      at: '2026-11-09T09:00:00.000Z',
    })
    expect(byKey.get('task:t-raval')).toMatchObject({
      stateLabel: 'Message à valider',
      requestId: 'r-raval',
    })
    expect(byKey.get('task:t-taxe')?.stateLabel).toBe(
      'Demandée le 27 oct. à l’agence · relance due'
    )
    expect(byKey.get('task:t-diag')?.stateLabel).toBe('Réponse du 1 nov.')
    expect(byKey.get('task:t-banal')?.stateLabel).toBeNull()
    expect(byKey.get('visit:v-done')?.stateLabel).toBe('Faite')
  })

  it('filtres, avancement, pastille', () => {
    const items = todoItems({ tasks, requests, visits })
    expect(filterTodo(items, 'all')).toHaveLength(8)
    expect(filterTodo(items, 'agency').map(i => i.id)).toEqual([
      't-raval',
      't-taxe',
      't-devis',
      't-diag',
    ])
    expect(filterTodo(items, 'us').map(i => i.id)).toEqual([
      't-banal',
      't-banque',
    ])
    expect(filterTodo(items, 'visit')).toHaveLength(2)
    expect(todoProgress(items)).toEqual({ done: 3, total: 8 })
    // 4 tâches ouvertes + 1 message à valider + 1 relance due.
    expect(todoPendingCount({ tasks, requests })).toBe(6)
    expect(todoPendingCount({ tasks: [], requests: [] })).toBe(0)
  })

  it('une demande validée, envoyée sans relance due, close sans réponse', () => {
    const items = todoItems({
      tasks: [
        TASK({ id: 'a', label: 'Demander l’étage', position: 0 }),
        TASK({ id: 'b', label: 'Demander le DPE', position: 1 }),
        TASK({ id: 'c', label: 'Demander les PV', position: 2 }),
        TASK({ id: 'd', label: 'Demander le syndic', position: 3, done: true }),
      ],
      requests: [
        REQUEST({ id: 'ra', status: 'approved', taskIds: ['a'] }),
        REQUEST({
          id: 'rb',
          status: 'sent',
          taskIds: ['b'],
          sentAt: '2026-11-02T09:00:00.000Z',
        }),
        REQUEST({
          id: 'rc',
          status: 'no_answer',
          taskIds: ['c'],
          sentAt: '2026-10-01T09:00:00.000Z',
        }),
      ],
      visits: [],
    })
    expect(items.map(i => i.state)).toEqual([
      'approved',
      'requested',
      'unanswered',
      'done',
    ])
    expect(items[1]?.stateLabel).toBe('Demandée le 2 nov. à l’agence')
    expect(items[2]?.stateLabel).toBe('Sans réponse (demandée le 1 oct.)')
    expect(items[3]?.stateLabel).toBeNull()
  })

  it('prochaines étapes : la visite, les messages, les relances, puis les tâches ; trois au plus', () => {
    const now = new Date('2026-11-06T10:00:00.000Z')
    expect(nextSteps({ tasks, requests, visits, now })).toEqual([
      { kind: 'visit', id: 'v-next', text: 'Visite lundi 9 novembre, 10 h' },
      {
        kind: 'draft',
        id: 'r-raval',
        text: 'Message à valider : [Exemple] Quote-part du ravalement',
      },
      {
        kind: 'follow_up',
        id: 'r-taxe',
        text: 'Relance due : [Exemple] Taxe foncière',
      },
    ])
    // Les questions du message disent mieux ce qu'il demande que son objet.
    expect(
      nextSteps({
        tasks: [],
        requests: [
          REQUEST({
            id: 'r-q',
            subject: 'Objet',
            questions: [
              { label: 'Demander la quote-part du ravalement' },
              { label: 'Demander le DPE' },
            ],
          }),
          REQUEST({
            id: 'r-one',
            status: 'sent',
            followUpDue: true,
            questions: [{ label: 'Demander le montant de la taxe foncière' }],
          }),
        ],
        visits: [],
        now,
      })
    ).toEqual([
      {
        kind: 'draft',
        id: 'r-q',
        text: 'Message à valider : la quote-part du ravalement (+ 1)',
      },
      {
        kind: 'follow_up',
        id: 'r-one',
        text: 'Relance due : le montant de la taxe foncière',
      },
    ])
    const later = new Date('2026-11-20T10:00:00.000Z')
    expect(
      nextSteps(
        {
          tasks,
          requests: requests.map(r => ({ ...r, subject: null })),
          visits,
          now: later,
        },
        5
      )
    ).toEqual([
      { kind: 'draft', id: 'r-raval', text: 'Message à valider' },
      { kind: 'follow_up', id: 'r-taxe', text: 'Relance due' },
      {
        kind: 'task',
        id: 't-devis',
        text: 'Demander un devis pour la salle de bain à un artisan',
      },
      { kind: 'task', id: 't-banal', text: 'Vérifier la cave' },
    ])
    expect(nextSteps({ tasks: [], requests: [], visits: [], now })).toEqual([])
  })

  it('une visite à une heure et demie', () => {
    expect(visitWhen('2026-11-07T17:30:00.000Z')).toBe(
      'samedi 7 novembre, 18 h 30'
    )
  })
})

describe('lot 19 : le type de location vient des hypothèses, un scénario peut le changer', () => {
  it('scénario : `leaseType` du scénario, puis celui de ses hypothèses, puis celui de l’espace', () => {
    const base = AssumptionsSchema.parse({ ...A, leaseType: 'unfurnished' })
    const study = studyInputFromListing({ price: 200_000, surface: 45 }, base)
    expect(study.leaseType).toBe('unfurnished')
    expect(
      applyScenario(study, base, { leaseType: 'shared' }).input.leaseType
    ).toBe('shared')
    const viaAssumptions = applyScenario(study, base, {
      assumptions: { leaseType: 'furnished' },
    })
    expect(viaAssumptions.input.leaseType).toBe('furnished')
    expect(viaAssumptions.assumptions.leaseType).toBe('furnished')
    expect(applyScenario(study, base, {}).input.leaseType).toBe('unfurnished')
    // Une version d'hypothèses antérieure au lot 19 se lit « vide ».
    const { leaseType: _l, ...old } = base
    expect(AssumptionsSchema.parse(old).leaseType).toBe('unfurnished')
  })
})
