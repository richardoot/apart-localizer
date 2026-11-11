/**
 * Lot 21 : les lignes de la page Annonces par étapes, les anciens liens, les
 * cartes du tri. L'état et l'ordre viennent de `domain` ; ici leur mise en
 * mots. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type { DecisionProposal, ListingDraft } from '@apart/contracts'
import { NO_CRITERIA_FIT } from '@apart/contracts'
import { fakeEvaluated, fakeOffer } from '@/test/fixtures'
import { fakeDraft } from '@/test/exploration-fixtures'
import {
  confirmLabel,
  draftFitText,
  draftMapItem,
  dismissedDraftRow,
  draftMatchesFilters,
  isDraftSortApplied,
  propertyFacts,
  sortDrafts,
  draftMeta,
  draftRow,
  draftTriageCard,
  legacyStageRedirect,
  listingRow,
  listingTriageCard,
  memberRating,
  orderedRows,
  outLabel,
  outReasonOfDraft,
  outReasonOfListing,
  primaryChoice,
  primaryLabel,
  progressText,
  questionsText,
  rowPillTone,
  shortDay,
  shortVisit,
  stageCta,
  tabOfAction,
} from './workflow'

const NOW = new Date('2026-11-09T12:00:00.000Z')
const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const members = [
  { id: RICHARD, displayName: 'Richard' },
  { id: CHLOE, displayName: 'Chloé' },
]
const context = { members, meId: RICHARD, now: NOW }

const n = (value: string) => value.replace(/[\u202f\u00a0]/g, ' ')

const decision = (over: Partial<DecisionProposal> = {}): DecisionProposal => ({
  id: '11111111-1111-4111-8111-111111111111',
  target: 'listing',
  listingId: '22222222-2222-4222-8222-222222222222',
  draftId: null,
  title: '[Exemple] T3',
  choice: 'to_visit',
  choiceLabel: 'À visiter',
  reason: null,
  state: 'open',
  resolution: null,
  appliedChoice: null,
  fromStatus: 'to_study',
  fromStage: 'a-etudier',
  author: { id: RICHARD, displayName: 'Richard' },
  channel: 'web',
  sessionId: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  closedAt: null,
  closedBy: null,
  responses: [],
  waitingFor: [{ id: CHLOE, displayName: 'Chloé' }],
  settleOptions: [],
  viewer: {
    isAuthor: true,
    hasResponded: false,
    canRespond: false,
    canWithdraw: true,
    canDecideNow: true,
    canSettle: false,
    nobodyLeft: false,
  },
  ...over,
})

const stage = (over = {}) => ({
  nextVisitAt: null,
  nextVisitNames: [],
  lastVisitAt: null,
  archivedAt: null,
  archivedBy: null,
  ...over,
})

describe('les lignes d’une annonce', () => {
  it('À étudier : prix, coût ; les trois jugements étiquetés ; à trier', () => {
    const row = listingRow(
      'a-etudier',
      fakeEvaluated({ price: 226_000, surface: 66, dpeClass: 'D' }),
      context
    )
    // Lot 25 : la rentabilité n'est plus une colonne « Verdict » sans étiquette.
    expect(row.stats.map(s => s.label)).toEqual(['Prix', 'Coût tout compris'])
    expect(row.judgements.map(j => j.label)).toEqual([
      'Rentabilité',
      'Location',
    ])
    expect(row.meta).toContain('66 m²')
    expect(row.meta).toContain('DPE D')
    expect(row.pill).toBe('À trier')
    expect(row.detail).toBe('Personne n’a encore trié')
    expect(row.action).toEqual({ kind: 'sort', label: 'Trier' })
  })

  it('une proposition prime : en attente, à confirmer, à trancher', () => {
    const waiting = listingRow(
      'a-etudier',
      fakeEvaluated({}, { decision: decision() }),
      context
    )
    expect(waiting.pill).toBe('En attente de Chloé')
    expect(waiting.detail).toBe('Tu proposes : À visiter')
    expect(waiting.action.kind).toBe('open')
    const toConfirm = listingRow(
      'a-etudier',
      fakeEvaluated(
        {},
        {
          decision: decision({
            viewer: { ...decision().viewer, isAuthor: false, canRespond: true },
            author: { id: CHLOE, displayName: 'Chloé' },
            waitingFor: [],
          }),
        }
      ),
      context
    )
    expect(toConfirm.pill).toBe('À confirmer')
    expect(toConfirm.detail).toBe('Chloé propose : À visiter')
    expect(toConfirm.action).toEqual({ kind: 'confirm', label: 'Confirmer' })
  })

  it('À visiter : la prochaine visite, ce qu’il reste à demander', () => {
    const row = listingRow(
      'a-visiter',
      fakeEvaluated(
        { status: 'to_visit' },
        {
          stage: stage({
            nextVisitAt: '2026-11-17T17:30:00.000Z',
            nextVisitNames: ['Richard', 'Chloé'],
          }),
          tasks: [],
        }
      ),
      context
    )
    expect(n(row.stats[0]?.value ?? '')).toBe('mar. 17 nov., 18 h 30')
    expect(row.stats[2]?.value).toBe('Rien')
    expect(row.pill).toBe('Visite prévue')
    expect(row.detail).toBe('Richard et Chloé')
    const none = listingRow(
      'a-visiter',
      fakeEvaluated({ status: 'to_visit' }, { stage: stage(), tasks: [] }),
      context
    )
    expect(none.pill).toBe('Sans date')
    expect(none.detail).toBe('Aucune visite prévue')
    expect(none.action.kind).toBe('plan')
    expect(none.stats[0]?.value).toBe('—')
  })

  it('Visitées : les avis de chacun, sans dévoiler une note masquée', () => {
    const summary = {
      blind: true,
      masked: true,
      revealed: false,
      viewerRated: false,
      members: [
        { memberId: RICHARD, displayName: 'Richard', state: 'missing' },
        { memberId: CHLOE, displayName: 'Chloé', state: 'masked' },
      ],
      rows: [],
      agreements: 0,
      disagreementKeys: [],
      maxGap: null,
      commonScore: null,
      status: 'pending',
      pendingMemberIds: [RICHARD],
      sentence: '',
    }
    const row = listingRow(
      'visitees',
      fakeEvaluated(
        { status: 'visited' },
        {
          opinionSummary: summary as never,
          stage: stage({ lastVisitAt: '2026-11-06T10:00:00.000Z' }),
        }
      ),
      context
    )
    expect(row.meta).toBe('Visitée le 6 nov.')
    expect(row.stats[0]).toEqual({
      label: 'Richard · Chloé',
      value: '— · a noté',
    })
    expect(row.pill).toBe('À toi de noter')
    expect(row.detail).toBe('L’avis de Chloé reste masqué')
    expect(row.stats[1]?.value).toBe('en attente')
  })

  it('Offres : notre offre, la réponse attendue', () => {
    const row = listingRow(
      'offres',
      fakeEvaluated(
        { status: 'offer_made', price: 219_000 },
        {
          offers: [
            fakeOffer({
              amount: 205_000,
              madeAt: '2026-11-04T10:00:00.000Z',
            }),
          ],
        }
      ),
      context
    )
    expect(n(row.stats[0]?.value ?? '')).toBe('205 000 €')
    expect(row.pill).toBe('Réponse attendue')
    expect(row.detail).toBe('Sans réponse depuis 5 j')
    expect(row.action).toEqual({ kind: 'follow', label: 'Suivre' })
    const none = listingRow(
      'offres',
      fakeEvaluated({ status: 'offer_made' }, { offers: [] }),
      context
    )
    expect(none.detail).toBe('Offre à enregistrer')
    expect(none.stats[0]?.value).toBe('—')
    const counter = listingRow(
      'offres',
      fakeEvaluated(
        { status: 'offer_made' },
        {
          offers: [
            fakeOffer({ response: 'counter_offer', counterAmount: 212_000 }),
          ],
        }
      ),
      context
    )
    expect(n(counter.detail)).toBe('Contre-proposition à 212 000 €')
  })

  it('Archives : quand, par qui, repêcher', () => {
    const row = listingRow(
      'archives',
      fakeEvaluated(
        { status: 'discarded', discardReason: 'quartier' },
        {
          stage: stage({
            archivedAt: '2026-11-03T10:00:00.000Z',
            archivedBy: 'Richard et Chloé',
          }),
        }
      ),
      context
    )
    expect(row.stats[1]?.value).toBe('3 nov.')
    expect(row.stats[2]?.value).toBe('Richard et Chloé')
    expect(row.pill).toBe('Écartée')
    expect(row.detail).toBe('Raison : quartier')
    expect(row.action).toEqual({ kind: 'rescue', label: 'Repêcher' })
    const sold = listingRow(
      'archives',
      fakeEvaluated({ status: 'sold_or_withdrawn' }),
      context
    )
    expect(sold.pill).toBe('Vendue')
    expect(sold.action.kind).toBe('open')
    const refused = listingRow(
      'archives',
      fakeEvaluated(
        { status: 'offer_refused' },
        { offers: [fakeOffer({ amount: 225_000 })] }
      ),
      context
    )
    expect(n(refused.detail)).toBe('Offre à 225 000 €')
  })

  it('les petits textes', () => {
    expect(n(shortVisit('2026-11-19T11:30:00.000Z'))).toBe(
      'jeu. 19 nov., 12 h 30'
    )
    expect(n(shortVisit('2026-11-21T09:00:00.000Z'))).toBe('sam. 21 nov., 10 h')
    expect(shortDay('2026-11-06T10:00:00.000Z')).toBe('6 nov.')
    expect(questionsText({ tasks: [] })).toBe('Rien')
    expect(
      questionsText({
        tasks: [
          {
            done: false,
            label: 'Demander le DTG',
            field: null,
          } as never,
        ],
      })
    ).toBe('1 question')
    expect(tabOfAction('plan')).toBe('a-faire')
    expect(tabOfAction('follow')).toBe('negocier')
    expect(tabOfAction('rate')).toBe('synthese')
    expect(tabOfAction('open')).toBeNull()
    expect(rowPillTone('to_settle')).toBe('ai')
    expect(rowPillTone('archived_refused')).toBe('bad')
    expect(rowPillTone('to_sort')).toBe('neutral')
  })

  it('une note visible, ou la moyenne sans note globale', () => {
    const summary = {
      members: [
        { memberId: RICHARD, state: 'rated', rating: 4, average: 3.8 },
        { memberId: CHLOE, state: 'rated', rating: null, average: 3 },
      ],
    } as never
    expect(memberRating(summary, RICHARD)).toBe('4/5')
    expect(memberRating(summary, CHLOE)).toBe('3,0')
    expect(memberRating(summary, 'autre')).toBe('—')
  })

  it('l’ordre de l’étape vient de `domain`', () => {
    const toSort = listingRow(
      'a-etudier',
      fakeEvaluated({ id: '33333333-3333-4333-8333-333333333333' }),
      context
    )
    const waiting = listingRow(
      'a-etudier',
      fakeEvaluated(
        { id: '44444444-4444-4444-8444-444444444444' },
        { decision: decision() }
      ),
      context
    )
    expect(orderedRows('a-etudier', [waiting, toSort])[0]?.id).toBe(toSort.id)
  })

  it('les raisons d’une annonce hors critères', () => {
    expect(
      outReasonOfListing(
        fakeEvaluated(
          {},
          {
            criteriaFit: {
              ...NO_CRITERIA_FIT,
              reasons: ['À 4,2 km du périmètre'],
            },
          }
        )
      )
    ).toBe('À 4,2 km du périmètre')
    expect(outReasonOfListing(fakeEvaluated())).toBe('Hors critères')
    expect(outLabel('draft', 2)).toBe('Voir 2 brouillons hors critères')
    expect(outLabel('listing', 1)).toBe('Voir 1 annonce hors critères')
    expect(confirmLabel(1)).toBe('Confirmer 1 proposition')
    expect(confirmLabel(2)).toBe('Confirmer 2 propositions')
  })
})

describe('les lignes d’un brouillon', () => {
  const draft = (over: Partial<ListingDraft> = {}) =>
    fakeDraft({ receivedAt: '2026-11-08T08:00:00.000Z', ...over })

  it('Claude ou une alerte, adéquation, à trier', () => {
    expect(draftMeta(draft(), NOW)).toBe('Claude · Leboncoin · hier')
    expect(draftMeta(draft({ origin: 'email', portal: null }), NOW)).toBe(
      'Alerte e-mail · hier'
    )
    const row = draftRow(draft(), { meId: RICHARD, now: NOW })
    // Lot 25 : l'adéquation est le jugement « Recherche », étiqueté.
    expect(row.stats.map(s => s.label)).toEqual(['Prix', 'Surface'])
    expect(row.judgements[0]?.label).toBe('Rentabilité')
    expect(row.pill).toBe('À trier')
    expect(row.detail).toBe('Personne n’a encore trié')
    expect(row.action.kind).toBe('sort')
  })

  it('l’adéquation en bref', () => {
    expect(draftFitText({ fit: null })).toBe('—')
    const fit = {
      ...NO_CRITERIA_FIT,
      activeCriteria: 1,
      level: 'margin' as const,
      reasons: ['Prix +4 % (maximum 240 000 €, marge 5 %)'],
    }
    expect(draftFitText({ fit })).toBe('À la marge : prix +4 %')
    expect(draftFitText({ fit: { ...fit, level: 'in' } })).toBe(
      'Dans les critères'
    )
    expect(draftFitText({ fit: { ...fit, reasons: [] } })).toBe('À la marge')
    expect(outReasonOfDraft({ fit })).toContain('Prix +4 %')
    expect(outReasonOfDraft({ fit: null })).toBe('Hors critères')
  })

  it('un brouillon en attente : voir sa carte', () => {
    const row = draftRow(draft({ decision: decision({ target: 'draft' }) }), {
      meId: RICHARD,
      now: NOW,
    })
    expect(row.pill).toBe('En attente de Chloé')
    expect(row.action).toEqual({ kind: 'open', label: 'Voir' })
  })

  it('un doublon probable se voit sur la ligne', () => {
    const row = draftRow(draft({ duplicates: [{ listingId: 'x' } as never] }), {
      meId: RICHARD,
      now: NOW,
    })
    expect(row.detail).toBe('Doublon probable à trancher')
  })

  it('les filtres propres aux brouillons : repère, critère, rayon, verdict', () => {
    const point = {
      type: 'Point' as const,
      coordinates: [-0.58, 44.84] as [number, number],
    }
    const located = draft({ located: { point, precision: 'exact' } })
    expect(draftMatchesFilters(located, { precision: ['exact'] })).toBe(true)
    expect(draftMatchesFilters(located, { precision: ['none'] })).toBe(false)
    expect(
      draftMatchesFilters(draft({ located: null }), { precision: ['none'] })
    ).toBe(true)
    expect(
      draftMatchesFilters(located, {
        near: { longitude: -0.58, latitude: 44.841, radiusMeters: 500 },
      })
    ).toBe(true)
    expect(
      draftMatchesFilters(located, {
        near: { longitude: -0.4, latitude: 44.9, radiusMeters: 500 },
      })
    ).toBe(false)
    const entry = (criteriaId: string, level: 'in' | 'out') =>
      ({ criteriaId, level }) as never
    const fit = {
      ...NO_CRITERIA_FIT,
      criteria: [entry('c1', 'in'), entry('c2', 'out')],
    }
    const fitted = draft({ fit })
    expect(draftMatchesFilters(fitted, { criteriaId: 'c1' })).toBe(true)
    expect(draftMatchesFilters(fitted, { criteriaId: 'c2' })).toBe(false)
    expect(draftMatchesFilters(fitted, { criteriaId: 'c3' })).toBe(false)
    // Sans loyer visé, le verdict est à confirmer : aucun ne convient.
    const noRent = draft({
      evaluation: { metrics: { verdict: 'target' } } as never,
    })
    expect(draftMatchesFilters(noRent, { verdict: ['target'] })).toBe(false)
  })

  it('un tri sur les brouillons : les valeurs inconnues à la fin', () => {
    const at = (id: string, price: number, surface: number | null) =>
      draft({
        id,
        listing: { ...draft().listing, price, surface },
      })
    const list = [at('a', 300, 10), at('b', 100, null), at('c', 200, 20)]
    const ids = (sorted: ListingDraft[]) => sorted.map(d => d.id).join('')
    expect(ids(sortDrafts(list, 'price', 'asc'))).toBe('bca')
    expect(ids(sortDrafts(list, 'surface', 'desc'))).toBe('cab')
    expect(ids(sortDrafts(list, 'pricePerM2', 'asc'))).toBe('cab')
    expect(ids(sortDrafts(list, 'score', 'desc'))).toBe('abc')
    expect(isDraftSortApplied('score')).toBe(false)
    expect(isDraftSortApplied('effort')).toBe(false)
    expect(isDraftSortApplied('price')).toBe(true)
  })

  it('un brouillon écarté, aux archives : quand, par qui, pourquoi, repêcher', () => {
    const row = dismissedDraftRow(
      draft({
        status: 'dismissed',
        decidedById: RICHARD,
        decidedAt: '2026-11-08T10:00:00.000Z',
        dismissReason: 'Trop cher',
      }),
      { members: [{ id: RICHARD, displayName: 'Richard' }] }
    )
    expect(row.pill).toBe('Écartée')
    expect(row.detail).toBe('Trop cher')
    expect(row.action).toEqual({ kind: 'rescue', label: 'Repêcher' })
    expect(row.archivedAt).toBe('2026-11-08T10:00:00.000Z')
    expect(row.stats.at(-1)).toEqual({ label: 'Par', value: 'Richard' })
  })

  it('les données du bien : seulement ce qui est connu', () => {
    const base = draft().listing
    const labels = (over: Partial<ListingDraft['listing']>) =>
      Object.fromEntries(
        propertyFacts({ ...base, ...over }).map(f => [f.label, f.value])
      )
    const facts = labels({
      floor: 2,
      floorLabel: null,
      floorsTotal: 5,
      elevator: false,
      dpeClass: 'C',
      dpeConsumption: 120,
      annualCharges: 1200,
      sellerName: '[Exemple] Agence',
      sellerReference: 'EX-1',
    })
    expect(facts['Étage']).toBe('2 sur 5')
    expect(facts.Ascenseur).toBe('Non')
    expect(facts.DPE).toBe('C (120 kWh/m²/an)')
    expect(facts.Vendeur).toBe('[Exemple] Agence, réf. EX-1')
    expect(facts['Charges annuelles']).toContain('1')
    const bare = labels({
      floor: 0,
      floorLabel: null,
      elevator: null,
      cellar: null,
      sellerName: null,
      sellerReference: null,
    })
    expect(bare['Étage']).toBe('Rez-de-chaussée')
    expect(bare).not.toHaveProperty('Ascenseur')
    expect(bare).not.toHaveProperty('Vendeur')
  })

  it('les filtres de la page s’appliquent aux brouillons', () => {
    const d = draft()
    expect(draftMatchesFilters(d, {})).toBe(true)
    expect(draftMatchesFilters(d, { search: 'balcon' })).toBe(true)
    expect(draftMatchesFilters(d, { search: 'loft' })).toBe(false)
    expect(draftMatchesFilters(d, { commune: ['bordeaux'] })).toBe(true)
    expect(draftMatchesFilters(d, { commune: ['Pessac'] })).toBe(false)
    expect(draftMatchesFilters(d, { dpe: ['C'] })).toBe(true)
    expect(draftMatchesFilters(d, { dpe: ['G'] })).toBe(false)
    expect(draftMatchesFilters(d, { priceMin: 300_000 })).toBe(false)
    expect(draftMatchesFilters(d, { priceMax: 100_000 })).toBe(false)
    expect(draftMatchesFilters(d, { surfaceMin: 100 })).toBe(false)
    expect(draftMatchesFilters(d, { surfaceMax: 10 })).toBe(false)
    expect(draftMatchesFilters(d, { roomsMin: 8 })).toBe(false)
    expect(draftMatchesFilters(d, { sellerType: ['private'] })).toBe(false)
    expect(draftMatchesFilters(d, { verdict: ['target'] })).toBe(false)
  })

  it('sur la carte, seulement avec un repère et des chiffres', () => {
    expect(draftMapItem(draft())).toBeNull()
    const located = draft({
      located: {
        point: { type: 'Point', coordinates: [-0.57, 44.84] },
        precision: null,
      },
      evaluation: fakeEvaluated().evaluation,
    })
    expect(draftMapItem(located)?.listing.id).toBe(located.id)
  })

  it('la carte du tri : pourquoi Claude l’a proposée, ce qui manque', () => {
    const evaluation = fakeEvaluated().evaluation
    const card = draftTriageCard(
      draft({
        evaluation,
        excerpt: 'Traversant, balcon de 8 m²',
        fit: {
          ...NO_CRITERIA_FIT,
          activeCriteria: 1,
          level: 'in',
          name: 'Bastide',
        },
      })
    )
    expect(card.whyTitle).toBe('Pourquoi Claude l’a proposée')
    expect(card.why[0]).toBe('Dans le critère « Bastide »')
    expect(card.why).toContain('Traversant, balcon de 8 m²')
    expect(card.judgements.find(j => j.key === 'search')?.value).toBe(
      'Dans les critères'
    )
    expect(card.dpe).toBe('DPE C')
    expect(card.figures.map(f => f.label)).toEqual([
      'Prix',
      'Coût tout compris',
      'Mensualité',
      'Prix cible',
    ])
    // Sans loyer visé : le verdict n'est pas inventé.
    expect(card.judgements[0]).toMatchObject({
      label: 'Rentabilité',
      value: 'À confirmer',
    })
    expect(card.figures[3]?.value).toBe('—')
    expect(card.figures[3]?.note).toBe('loyer visé inconnu')
  })

  it('une alerte sans chiffres', () => {
    const card = draftTriageCard(
      draft({
        origin: 'email',
        portal: null,
        evaluation: null,
        emailSubject: 'Alerte fictive',
        excerpt: null,
        fit: null,
        listing: { ...fakeDraft().listing, price: 0, dpeClass: null },
      })
    )
    expect(card.whyTitle).toBe('Ce que dit l’alerte')
    expect(card.why).toEqual(['« Alerte fictive »'])
    expect(card.figures).toEqual([{ label: 'Prix', value: 'prix ?', note: '' }])
    expect(card.dpe).toBe('DPE inconnu')
    expect(card.judgements.map(j => j.key)).toEqual(['profitability'])
  })
})

describe('la carte du tri d’une annonce', () => {
  it('ce qui plaît, ce qui manque, les chiffres', () => {
    const card = listingTriageCard(
      fakeEvaluated(
        { dpeClass: null },
        {
          criteriaFit: {
            ...NO_CRITERIA_FIT,
            activeCriteria: 1,
            level: 'margin',
          },
        }
      )
    )
    expect(card.whyTitle).toBe('Ce qui plaît')
    expect(card.judgements.map(j => `${j.label} : ${j.value}`)).toEqual([
      expect.stringMatching(/^Rentabilité : /),
      'Recherche : À la marge',
      expect.stringMatching(/^Location : /),
    ])
    expect(card.dpe).toBe('DPE inconnu')
    expect(card.figures).toHaveLength(4)
    expect(card.missing.length).toBeLessThanOrEqual(4)
  })
})

describe('le mode tri', () => {
  it('le bouton principal, le titre', () => {
    expect(primaryChoice('a-valider')).toBe('keep')
    expect(primaryChoice('a-etudier')).toBe('to_visit')
    expect(primaryLabel('a-valider')).toBe('À étudier')
    expect(primaryLabel('a-etudier')).toBe('À visiter')
    expect(progressText('a-valider', 2, 4)).toBe('À valider · 2 sur 4')
    expect(progressText(null, 5, 4)).toBe('4 sur 4')
  })

  it('les boutons d’appel à l’action', () => {
    expect(stageCta('a-valider', 4, 0, 0)).toBe('Trier les 4 annonces')
    expect(stageCta('a-etudier', 1, 0, 0)).toBe('Trier l’annonce')
    expect(stageCta('a-valider', 0, 0, 0)).toBeNull()
    expect(stageCta('a-visiter', 0, 1, 0)).toBe('Planifier la visite sans date')
    expect(stageCta('a-visiter', 0, 2, 0)).toBe(
      'Planifier les visites sans date'
    )
    expect(stageCta('a-visiter', 0, 0, 0)).toBeNull()
    expect(stageCta('visitees', 0, 0, 1)).toBe('Donner mon avis')
    expect(stageCta('visitees', 0, 0, 0)).toBeNull()
    expect(stageCta('offres', 0, 0, 0)).toBeNull()
  })
})

describe('les anciens liens', () => {
  it('?vue=a-valider, ?fit=, ?status= mènent à leur étape', () => {
    expect(legacyStageRedirect({})).toBeNull()
    expect(legacyStageRedirect({ dpe: 'C' })).toBeNull()
    expect(legacyStageRedirect({ vue: 'a-valider', dpe: 'C' })).toEqual({
      etape: 'a-valider',
      dpe: 'C',
    })
    expect(legacyStageRedirect({ fit: 'out' })).toEqual({
      etape: 'a-etudier',
      hors: '1',
    })
    expect(legacyStageRedirect({ fit: 'in,margin' })).toEqual({})
    expect(legacyStageRedirect({ status: 'to_visit,visited' })).toEqual({
      etape: 'a-visiter',
    })
    expect(legacyStageRedirect({ status: ['discarded'] })).toEqual({
      etape: 'archives',
    })
    expect(legacyStageRedirect({ status: 'inconnu' })).toEqual({})
    expect(legacyStageRedirect({ status: 'visited', etape: 'offres' })).toEqual(
      { etape: 'offres' }
    )
    expect(legacyStageRedirect({ vue: 'autre' })).toEqual({})
  })
})
