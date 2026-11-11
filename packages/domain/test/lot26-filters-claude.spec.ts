/**
 * Lot 26 : les filtres se voient (puces, compteurs des étapes sous filtres,
 * étape vide expliquée) et la page « Claude » dit ce que le journal sait du
 * connecteur. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type { WorkflowStageCount } from '@apart/contracts'
import {
  activeFilterChips,
  claudeDayText,
  claudeUsage,
  hiddenByFiltersText,
  stageCountText,
  stageCountsUnderFilters,
  withoutChip,
} from '../src/index.js'

const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ')
const labels = (chips: { label: string }[]) => chips.map(c => plain(c.label))

describe('Lot 26 : une puce par filtre actif', () => {
  it('aucun filtre, aucune puce ; le tri n’en est pas un', () => {
    expect(activeFilterChips({})).toEqual([])
  })

  it('chaque filtre se nomme, dans l’ordre du panneau', () => {
    const chips = activeFilterChips(
      {
        search: 'quais',
        commune: ['Bordeaux', 'Mérignac'],
        criteriaId: '11111111-1111-4111-8111-111111111111',
        verdict: ['target', 'to_dig'],
        dpe: ['A', 'B'],
        priceMin: 150_000,
        priceMax: 250_000,
        surfaceMin: 40,
        roomsMin: 2,
        precision: ['exact', 'district'],
        newForMe: true,
        staleDays: 7,
        near: { longitude: -0.57, latitude: 44.84, radiusMeters: 1000 },
        sellerType: ['agency', 'mandatary', 'private'],
        multiPortal: true,
        reference: 'EX-2041',
        opinions: 'to_discuss',
        status: ['to_visit'],
      },
      { criteriaName: () => 'Bordeaux centre' }
    )
    expect(labels(chips)).toEqual([
      '« quais »',
      'Commune : Bordeaux et Mérignac',
      'Critère : Bordeaux centre',
      'Rentabilité : Cible et À creuser',
      'DPE A, B',
      'Prix 150 000 € à 250 000 €',
      'Surface dès 40 m²',
      '2 pièces ou plus',
      'Repère : adresse exacte et au quartier',
      'Pas encore ouvertes',
      'À revérifier (plus de 7 jours)',
      'Autour d’un point · 1 km',
      'Vendeur : Agence ou mandataire et particulier',
      'Sur plusieurs portails',
      'Réf. EX-2041',
      'Avis : À rediscuter',
      'Statut : à visiter',
    ])
    expect(chips.find(c => c.key === 'price')?.clears).toEqual([
      'priceMin',
      'priceMax',
    ])
  })

  it('bornes seules, critère sans nom, vendeur à relever', () => {
    expect(
      labels(
        activeFilterChips({
          priceMax: 200_000,
          surfaceMax: 70,
          roomsMin: 1,
          criteriaId: '11111111-1111-4111-8111-111111111111',
          sellerType: ['unknown'],
        })
      )
    ).toEqual([
      'Un critère enregistré',
      'Prix jusqu’à 200 000 €',
      'Surface jusqu’à 70 m²',
      '1 pièce ou plus',
      'Vendeur : À relever',
    ])
  })

  it('retirer une puce efface ses champs, pas les autres', () => {
    const filters = { priceMin: 1, priceMax: 2, commune: ['Bègles'] }
    const price = activeFilterChips(filters).find(c => c.key === 'price')
    expect(withoutChip(filters, price!)).toEqual({ commune: ['Bègles'] })
  })
})

const stages: WorkflowStageCount[] = [
  { stage: 'a-valider', count: 3, outOfCriteria: 1, toSort: 3, sub: '' },
  { stage: 'a-etudier', count: 4, outOfCriteria: 0, toSort: 2, sub: '' },
  { stage: 'a-visiter', count: 2, outOfCriteria: 0, toSort: 0, sub: '' },
  { stage: 'visitees', count: 1, outOfCriteria: 0, toSort: 0, sub: '' },
  { stage: 'offres', count: 0, outOfCriteria: 0, toSort: 0, sub: '' },
  { stage: 'archives', count: 5, outOfCriteria: 0, toSort: 0, sub: '' },
]
const listing = (
  status: 'to_study' | 'to_visit' | 'discarded',
  level: 'in' | 'out' = 'in'
) => ({ status, fit: { level, kept: null }, decision: null })

describe('Lot 26 : les compteurs des étapes suivent les filtres', () => {
  it('sans filtre : les compteurs de l’aperçu, sans « sur »', () => {
    const counts = stageCountsUnderFilters({
      stages,
      filtered: false,
      listings: [],
      drafts: [],
    })
    expect(counts.map(c => [c.count, c.total, c.filtered])).toEqual(
      stages.map(s => [s.count, s.count, false])
    )
    expect(stageCountText(counts[1]!)).toEqual({
      short: '4',
      spoken: '4 annonces',
    })
  })

  it('lecture filtrée pas encore arrivée : l’aperçu', () => {
    const counts = stageCountsUnderFilters({
      stages,
      filtered: true,
      listings: null,
      drafts: [],
    })
    expect(counts.every(c => !c.filtered)).toBe(true)
  })

  it('sous filtres : ce qui passe, même règle que l’aperçu', () => {
    const counts = stageCountsUnderFilters({
      stages,
      filtered: true,
      listings: [
        listing('to_study'),
        listing('to_study', 'out'), // hors critères : repliée, pas comptée
        listing('discarded'),
      ],
      drafts: [
        { fit: { level: 'in', kept: null }, decision: null },
        { fit: { level: 'out', kept: null }, decision: null },
      ],
      dismissedDrafts: 2,
    })
    const byStage = Object.fromEntries(counts.map(c => [c.stage, c]))
    expect(byStage['a-valider']).toMatchObject({ count: 1, total: 3 })
    expect(byStage['a-etudier']).toMatchObject({ count: 1, total: 4 })
    expect(byStage['a-visiter']).toMatchObject({ count: 0, total: 2 })
    expect(byStage.archives).toMatchObject({ count: 3, total: 5 })
    expect(stageCountText(byStage['a-visiter']!)).toEqual({
      short: '0/2',
      spoken: '0 sur 2 annonces, avec les filtres',
    })
  })

  it('l’étape vide dit quels filtres cachent combien d’annonces', () => {
    const counts = stageCountsUnderFilters({
      stages,
      filtered: true,
      listings: [listing('to_study')],
      drafts: [],
    })
    const chips = activeFilterChips({ commune: ['Mérignac'], dpe: ['A'] })
    const byStage = Object.fromEntries(counts.map(c => [c.stage, c]))
    expect(hiddenByFiltersText(byStage['a-visiter']!, chips)).toBe(
      'Les filtres cachent les 2 annonces de l’étape À visiter : Commune : Mérignac et DPE A.'
    )
    expect(hiddenByFiltersText(byStage.visitees!, chips)).toBe(
      'Les filtres cachent la seule annonce de l’étape Visitées : Commune : Mérignac et DPE A.'
    )
    expect(hiddenByFiltersText(byStage['a-etudier']!, chips)).toBe(
      'Les filtres cachent 3 annonces de l’étape À étudier : Commune : Mérignac et DPE A.'
    )
    // Rien de caché, ou pas de filtre : rien à dire.
    expect(hiddenByFiltersText(byStage.offres!, chips)).toBeNull()
    expect(hiddenByFiltersText(byStage['a-visiter']!, [])).toBeNull()
  })
})

describe('Lot 26 : ce que le journal sait de Claude', () => {
  const now = new Date('2026-11-11T10:00:00Z')
  const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  it('les jours en mots, heure de Paris', () => {
    expect(claudeDayText('2026-11-11T07:00:00Z', now)).toBe('aujourd’hui')
    expect(claudeDayText('2026-11-10T07:00:00Z', now)).toBe('hier')
    expect(claudeDayText('2026-11-02T07:00:00Z', now)).toBe('le 2 novembre')
  })

  it('jamais : il le dit, sans prétendre savoir s’il est branché', () => {
    const usage = claudeUsage({ viewerId: ME, members: [] }, now)
    expect(usage).toMatchObject({
      state: 'never',
      lastWriteAt: null,
      writes: 0,
    })
    expect(usage.text).toContain('Une simple lecture ne laisse pas de trace')
  })

  it('un autre membre l’utilise, pas moi', () => {
    const usage = claudeUsage(
      {
        viewerId: ME,
        members: [
          {
            memberId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            displayName: 'Dominique',
            writes: 1,
            lastWriteAt: '2026-11-01T09:00:00Z',
          },
          {
            memberId: OTHER,
            displayName: 'Sacha',
            writes: 3,
            lastWriteAt: '2026-11-10T09:00:00Z',
          },
        ],
      },
      now
    )
    expect(usage.state).toBe('workspace')
    expect(usage.text).toBe(
      'Sacha l’utilise (dernière écriture hier). Branche-le avec ton propre compte pour qu’il agisse en ton nom.'
    )
    expect(usage.writes).toBe(4)
  })

  it('il a écrit pour moi, et pour un autre aussi', () => {
    const usage = claudeUsage(
      {
        viewerId: ME,
        members: [
          {
            memberId: ME,
            displayName: 'Camille',
            writes: 1,
            lastWriteAt: '2026-11-11T08:00:00Z',
          },
          {
            memberId: OTHER,
            displayName: 'Sacha',
            writes: 2,
            lastWriteAt: '2026-11-02T08:00:00Z',
          },
        ],
      },
      now
    )
    expect(usage).toMatchObject({
      state: 'me',
      writes: 3,
      lastWriteAt: '2026-11-11T08:00:00Z',
    })
    expect(usage.text).toBe(
      'Dernière écriture en ton nom aujourd’hui ; 1 écriture au journal. Sacha aussi.'
    )
    const alone = claudeUsage(
      {
        viewerId: ME,
        members: [
          {
            memberId: ME,
            displayName: 'Camille',
            writes: 3,
            lastWriteAt: '2026-11-11T08:00:00Z',
          },
        ],
      },
      now
    )
    expect(alone.text).toBe(
      'Dernière écriture en ton nom aujourd’hui ; 3 écritures au journal.'
    )
  })
})
