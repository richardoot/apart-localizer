/**
 * Lot 30 (ADR 0043) : la question « même bien ? » posée dans l'application
 * quand Claude crée une annonce malgré un doublon probable, et la fiche
 * absorbée supprimée sept jours après la fusion. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import { MERGED_LISTING_RETENTION_DAYS } from '@apart/contracts'
import {
  describeActivity,
  duplicatePairOf,
  duplicateQuestionText,
  duplicatesToAsk,
  mergeLeftBehindLines,
  mergePurgeBefore,
  mergeUndoRefusal,
  mergeUndoText,
  mergeUndoUntil,
} from '../src/index.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MERGED_AT = '2026-11-12T09:00:00.000Z'

describe('Lot 30 : la question « même bien ? »', () => {
  it('ne pose la question que sur les doublons probables forts, jamais sur un doublon certain', () => {
    const asked = duplicatesToAsk([
      { listingId: 'fort', certain: false, score: 0.7 },
      { listingId: 'faible', certain: false, score: 0.63 },
      { listingId: 'certain', certain: true, score: 1 },
      { listingId: 'très fort', certain: false, score: 0.9 },
    ])
    expect(asked.map(c => c.listingId)).toEqual(['fort', 'très fort'])
    expect(duplicatesToAsk([])).toEqual([])
  })

  it('range une paire dans l’ordre des identifiants, quel que soit le sens', () => {
    expect(duplicatePairOf(A, B)).toEqual({ listingAId: A, listingBId: B })
    expect(duplicatePairOf(B, A)).toEqual({ listingAId: A, listingBId: B })
  })

  it('dit qui a créé la fiche malgré la ressemblance', () => {
    expect(duplicateQuestionText('[Exemple] T3 61 m²', 'mcp')).toBe(
      'Claude a enregistré cette annonce alors qu’elle ressemble beaucoup à « [Exemple] T3 61 m² ». Est-ce le même bien ?'
    )
    expect(duplicateQuestionText('[Exemple] T3 61 m²', 'web')).toBe(
      'Cette annonce ressemble beaucoup à « [Exemple] T3 61 m² ». Est-ce le même bien ?'
    )
  })

  it('raconte au journal le « Non » d’un membre', () => {
    const line = describeActivity({
      action: 'listing.duplicate_denied',
      before: null,
      after: { otherId: B, otherTitle: '[Exemple] T3 61 m²' },
    } as Parameters<typeof describeActivity>[0])
    expect(line.summary).toBe(
      'a confirmé que ce n’est pas le même bien que « [Exemple] T3 61 m² »'
    )
  })
})

describe('Lot 30 : la fiche absorbée supprimée après sept jours', () => {
  it('une fusion s’annule pendant sept jours', () => {
    expect(MERGED_LISTING_RETENTION_DAYS).toBe(7)
    expect(mergeUndoUntil(MERGED_AT)).toBe('2026-11-19T09:00:00.000Z')
    expect(mergeUndoUntil(new Date(MERGED_AT), 1)).toBe(
      '2026-11-13T09:00:00.000Z'
    )
  })

  it('refuse l’annulation à partir du septième jour', () => {
    expect(
      mergeUndoRefusal(MERGED_AT, new Date('2026-11-19T08:59:59.000Z'))
    ).toBeNull()
    expect(
      mergeUndoRefusal(MERGED_AT, new Date('2026-11-19T09:00:00.000Z'))
    ).toBe(
      'Cette fusion date de plus de 7 jours : elle ne s’annule plus, la fiche fusionnée est supprimée.'
    )
  })

  it('les fiches à supprimer sont celles fusionnées avant il y a sept jours', () => {
    expect(
      mergePurgeBefore(new Date('2026-11-19T09:00:00.000Z')).toISOString()
    ).toBe(MERGED_AT)
  })

  it('dit jusqu’à quand la fusion s’annule, au jour de Paris', () => {
    expect(mergeUndoText('2026-11-19T23:30:00.000Z')).toBe(
      'Annulable jusqu’au 20 novembre ; ensuite la fiche fusionnée est supprimée.'
    )
  })

  it('le prévient avant de fusionner', () => {
    expect(
      mergeLeftBehindLines({
        opinionsKept: 0,
        tasksKept: 0,
        sellersDropped: 0,
        hasAddress: false,
      })
    ).toEqual([
      'La fiche fusionnée est supprimée 7 jours après la fusion, avec son historique des prix et son journal ; d’ici là, la fusion s’annule.',
    ])
  })
})
