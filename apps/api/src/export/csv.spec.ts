import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ASSUMPTIONS,
  EvaluatedListingSchema,
  ListingInputSchema,
} from '@apart/contracts'
import { mergeAssumptions } from '@apart/domain'
import { evaluateListing } from '../listings/evaluate'
import {
  LISTING_CSV_COLUMNS,
  UTF8_BOM,
  csvCell,
  csvNumber,
  listingCsvRow,
  toCsv,
} from './csv'

describe('CSV pour un tableur français', () => {
  it('écrit les nombres avec une virgule, sans séparateur de milliers', () => {
    expect(csvNumber(189000)).toBe('189000')
    expect(csvNumber(4.0909)).toBe('4,09')
    expect(csvNumber(-361.924)).toBe('-361,92')
    expect(csvNumber(1234.5678, 0)).toBe('1235')
    expect(csvNumber(Number.NaN)).toBe('')
    expect(csvNumber(null)).toBe('')
  })

  it('échappe le séparateur, les guillemets, les sauts de ligne et les formules', () => {
    expect(csvCell('simple')).toBe('simple')
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""')
    expect(csvCell('ligne\nsuivante')).toBe('"ligne\nsuivante"')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+33 6')).toBe("'+33 6")
    expect(csvCell('-361,92')).toBe('-361,92')
    expect(csvCell(true)).toBe('oui')
    expect(csvCell(false)).toBe('non')
    expect(csvCell(12.5)).toBe('12,5')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('assemble un fichier avec BOM et fins de ligne CRLF', () => {
    const text = toCsv(['A', 'B'], [[1, 'x;y']])
    expect(text.startsWith(UTF8_BOM)).toBe(true)
    expect(text.slice(1)).toBe('A;B\r\n1;"x;y"\r\n')
  })

  it('une ligne par annonce avec les indicateurs calculés par domain', () => {
    const input = ListingInputSchema.parse({
      title: 'T2 fictif',
      price: 200_000,
      surface: 45,
      furnitureValue: 5000,
      dpeClass: 'D',
      location: { commune: 'Talence' },
      rentalPlan: { targetRent: 750 },
    })
    const listing = {
      ...input,
      id: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      renovation: null,
      rentalPlan: input.rentalPlan
        ? { ...input.rentalPlan, comparables: [] }
        : null,
      discardedAt: null,
      createdById: null,
      createdAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-03T11:00:00.000Z',
      views: [],
      openDataContext: null,
    }
    const item = EvaluatedListingSchema.parse({
      listing,
      evaluation: evaluateListing(
        listing as never,
        mergeAssumptions(DEFAULT_ASSUMPTIONS, null)
      ),
      isNewForMe: false,
      opinions: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          listingId: listing.id,
          memberId: '44444444-4444-4444-8444-444444444444',
          rating: 4,
          text: '',
          createdAt: listing.createdAt,
          updatedAt: listing.createdAt,
        },
      ],
    })
    const row = listingCsvRow(item, 2)
    expect(row).toHaveLength(LISTING_CSV_COLUMNS.length)
    const cell = (column: (typeof LISTING_CSV_COLUMNS)[number]) =>
      row[LISTING_CSV_COLUMNS.indexOf(column)]
    expect(cell('Titre')).toBe('T2 fictif')
    expect(cell('Statut')).toBe('À étudier')
    expect(cell('Prix (€)')).toBe('200000')
    expect(cell('Rendement brut (%)')).toBe(
      csvNumber(item.evaluation.metrics.grossYield * 100)
    )
    expect(cell('Note moyenne (/5)')).toBe('4')
    expect(cell('Visites')).toBe(2)
    expect(cell('Ajoutée le')).toBe('2026-11-03')
  })
})
