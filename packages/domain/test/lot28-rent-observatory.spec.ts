/**
 * Lot 28 : loyer observé par l'observatoire local des loyers (ADR 0038).
 * Table fictive : aucune valeur réelle de l'observatoire.
 */
import { describe, expect, it } from 'vitest'
import {
  RENT_OBSERVATORY_ATTRIBUTION,
  RentObservatoryLookupSchema,
  RentObservatoryTableSchema,
} from '@apart/contracts'
import type { RentObservatoryTable } from '@apart/contracts'
import {
  latestRentObservatoryTable,
  lookupRentObservatory,
  rentObservatoryLine,
  rentObservatoryPosition,
  rentObservatoryRooms,
  rentObservatoryZonesOfCommune,
} from '../src/index.js'
import type { RentObservatoryInput } from '../src/index.js'

const table = (
  over: Partial<RentObservatoryTable> = {}
): RentObservatoryTable =>
  RentObservatoryTableSchema.parse({
    territory: 'bordeaux',
    observatory: 'L3300',
    year: 2025,
    observedAt: '2025-01-01',
    housingType: 'apartment',
    zones: [
      {
        zone: 2,
        label: 'Zone 2',
        stats: [
          {
            rooms: null,
            medianPerM2: 14,
            q1PerM2: 12,
            q3PerM2: 16,
            observations: 900,
          },
          {
            rooms: 1,
            medianPerM2: 19,
            q1PerM2: 16,
            q3PerM2: 22,
            observations: 100,
          },
          {
            rooms: 2,
            medianPerM2: 15,
            q1PerM2: 13,
            q3PerM2: 17,
            observations: 400,
          },
          {
            rooms: 4,
            medianPerM2: 11,
            q1PerM2: 10,
            q3PerM2: 12,
            observations: 1,
          },
        ],
        recentTenants: {
          rooms: null,
          medianPerM2: 15.5,
          q1PerM2: 13,
          q3PerM2: 18,
          observations: 200,
        },
      },
      {
        zone: 3,
        label: 'Zone 3',
        stats: [
          {
            rooms: 2,
            medianPerM2: 13,
            q1PerM2: 12,
            q3PerM2: 14.5,
            observations: 300,
          },
        ],
      },
    ],
    irisZones: { '990010101': 2, '990010102': 3, '990010103': 4 },
    communeZones: { '99002': 3 },
    source: {
      url: 'https://exemple.test/Base_OP_2025_L3300.zip',
      file: 'Base_OP_2025_L3300.zip',
      sha256: 'abc',
      importedAt: '2026-11-11T10:00:00.000Z',
    },
    ...over,
  })

const input = (
  over: Partial<RentObservatoryInput> = {}
): RentObservatoryInput => ({
  tables: [table()],
  hasPoint: true,
  precision: 'exact',
  inseeCode: '99001',
  irisCodes: ['990010101'],
  rooms: 2,
  surface: 40,
  targetRent: 620,
  ...over,
})

describe('aides', () => {
  it('garde l’année d’enquête la plus récente', () => {
    expect(latestRentObservatoryTable([])).toBeNull()
    const older = table({ year: 2024, observedAt: '2024-01-01' })
    expect(latestRentObservatoryTable([table(), older])?.year).toBe(2025)
    expect(latestRentObservatoryTable([older, table()])?.year).toBe(2025)
  })

  it('range les pièces dans les tranches de l’observatoire', () => {
    expect(rentObservatoryRooms(null)).toBeNull()
    expect(rentObservatoryRooms(0)).toBeNull()
    expect(rentObservatoryRooms(Number.NaN)).toBeNull()
    expect(rentObservatoryRooms(1)).toBe(1)
    expect(rentObservatoryRooms(3)).toBe(3)
    expect(rentObservatoryRooms(6)).toBe(4)
  })

  it('liste les zones d’une commune partagée', () => {
    expect(rentObservatoryZonesOfCommune(table(), '99001')).toEqual([2, 3, 4])
    expect(rentObservatoryZonesOfCommune(table(), '99002')).toEqual([])
  })

  it('place un loyer au m² par rapport aux quartiles', () => {
    const stats = { q1PerM2: 12, q3PerM2: 16 }
    expect(rentObservatoryPosition(11.9, stats)).toBe('below_q1')
    expect(rentObservatoryPosition(12, stats)).toBe('within')
    expect(rentObservatoryPosition(16, stats)).toBe('within')
    expect(rentObservatoryPosition(16.1, stats)).toBe('above_q3')
  })
})

describe('lookupRentObservatory', () => {
  it('rend la médiane de la zone de l’IRIS, par nombre de pièces', () => {
    const lookup = lookupRentObservatory(input())
    expect(RentObservatoryLookupSchema.parse(lookup)).toEqual(lookup)
    expect(lookup).toMatchObject({
      status: 'ok',
      zone: { zone: 2, label: 'Zone 2' },
      approximate: false,
      rooms: 2,
      medianPerM2: 15,
      q1PerM2: 13,
      q3PerM2: 17,
      observations: 400,
      monthlyMedian: 600,
      monthlyQ1: 520,
      monthlyQ3: 680,
      targetRent: 620,
      position: 'within',
      year: 2025,
      observedAt: '2025-01-01',
      sourceUrl: 'https://exemple.test/Base_OP_2025_L3300.zip',
      attribution: RENT_OBSERVATORY_ATTRIBUTION,
      reasons: [],
    })
    expect(lookup.gapToMedian).toBeCloseTo(620 / 600 - 1, 10)
    expect(lookup.notes[0]).toContain('entre les quartiles')
    expect(lookup.notes.join(' ')).toContain('moins d’un an')
    expect(lookup.notes.join(' ')).toContain(
      'Loyers hors charges au 1er janvier 2025, tous locataires en place (400 logements enquêtés) : un indicateur, pas un plafond.'
    )
  })

  it('signale un loyer visé au-dessus du 3e quartile ou sous le 1er', () => {
    const above = lookupRentObservatory(input({ targetRent: 720 }))
    expect(above.status).toBe('ok')
    expect(above.position).toBe('above_q3')
    expect(above.notes[0]).toContain('au-dessus du 3e quartile (17,0 €/m²)')
    expect(above.notes[0]).toContain('20,0 % au-dessus')
    const below = lookupRentObservatory(input({ targetRent: 480 }))
    expect(below.position).toBe('below_q1')
    expect(below.notes[0]).toContain('20,0 % en dessous')
    expect(below.notes[0]).toContain('sous le 1er quartile (13,0 €/m²)')
  })

  it('prend la zone de la commune quand elle est entière dans une zone', () => {
    const lookup = lookupRentObservatory(
      input({
        inseeCode: '99002',
        irisCodes: [],
        hasPoint: false,
        precision: null,
      })
    )
    expect(lookup).toMatchObject({
      status: 'ok',
      zone: { zone: 3, label: 'Zone 3' },
      approximate: false,
      medianPerM2: 13,
      monthlyMedian: 520,
    })
    // Pas de locataires récents publiés dans cette zone : pas de note.
    expect(lookup.notes.join(' ')).not.toContain('moins d’un an')
  })

  it('garde la zone d’une commune entière même au centre de la commune', () => {
    const lookup = lookupRentObservatory(
      input({ inseeCode: '99002', irisCodes: [], precision: 'commune' })
    )
    expect(lookup.status).toBe('ok')
    expect(lookup.approximate).toBe(false)
    expect(lookup.reasons).toEqual([])
  })

  it('marque « ≈ » une adresse à la rue et « à vérifier » un repère au quartier', () => {
    const street = lookupRentObservatory(input({ precision: 'street' }))
    expect(street.status).toBe('ok')
    expect(street.approximate).toBe(true)
    expect(street.reasons[0]).toContain('Adresse à la rue')
    const district = lookupRentObservatory(input({ precision: 'district' }))
    expect(district.status).toBe('to_verify')
    expect(district.approximate).toBe(true)
    expect(district.medianPerM2).toBe(15)
    expect(district.reasons[0]).toContain(
      'Repère approché (quartier) : la commune est partagée entre les zones 2, 3, 4'
    )
    const commune = lookupRentObservatory(input({ precision: 'commune' }))
    expect(commune.reasons[0]).toContain('centre de la commune')
    // Sans commune connue : la zone du repère, sans liste des zones.
    const unknown = lookupRentObservatory(
      input({ precision: 'district', inseeCode: null })
    )
    expect(unknown.reasons[0]).toContain('la zone est celle du repère')
  })

  it('retombe sur toutes les tailles sans pièces ou sans ligne publiée', () => {
    const unknown = lookupRentObservatory(input({ rooms: null }))
    expect(unknown.rooms).toBeNull()
    expect(unknown.medianPerM2).toBe(14)
    expect(unknown.notes[0]).toContain('Nombre de pièces inconnu')
    const missing = lookupRentObservatory(input({ rooms: 3 }))
    expect(missing.rooms).toBeNull()
    expect(missing.notes[0]).toContain('Aucun loyer publié pour 3 pièces')
    const large = lookupRentObservatory(input({ rooms: 7 }))
    expect(large.rooms).toBe(4)
    expect(large.medianPerM2).toBe(11)
    expect(large.notes.join(' ')).toContain('(1 logement enquêté)')
  })

  it('ne calcule ni loyer mensuel sans surface ni écart sans loyer visé', () => {
    const noSurface = lookupRentObservatory(input({ surface: null }))
    expect(noSurface.monthlyMedian).toBeNull()
    expect(noSurface.monthlyQ1).toBeNull()
    expect(noSurface.monthlyQ3).toBeNull()
    expect(noSurface.position).toBeNull()
    expect(noSurface.notes[0]).toContain('Surface inconnue')
    const zeroSurface = lookupRentObservatory(input({ surface: 0 }))
    expect(zeroSurface.monthlyMedian).toBeNull()
    const noTarget = lookupRentObservatory(input({ targetRent: null }))
    expect(noTarget.targetRent).toBeNull()
    expect(noTarget.gapToMedian).toBeNull()
    expect(noTarget.position).toBeNull()
    expect(
      lookupRentObservatory(input({ targetRent: 0 })).targetRent
    ).toBeNull()
  })

  it('note que le meublé n’est pas distingué', () => {
    expect(
      lookupRentObservatory(input({ furnished: true })).notes.at(-1)
    ).toContain('ne distingue pas')
    expect(lookupRentObservatory(input()).notes.join(' ')).not.toContain(
      'ne distingue pas'
    )
  })

  it('est indisponible sans table importée', () => {
    const lookup = lookupRentObservatory(input({ tables: [] }))
    expect(lookup.status).toBe('unavailable')
    expect(lookup.year).toBeNull()
    expect(lookup.sourceUrl).toBeNull()
    expect(lookup.reasons[0]).toContain('import:rent-observatory')
  })

  it('demande l’adresse quand la zone ne peut pas être lue', () => {
    const noPoint = lookupRentObservatory(
      input({ hasPoint: false, irisCodes: [], precision: null })
    )
    expect(noPoint.status).toBe('to_verify')
    expect(noPoint.zone).toBeNull()
    expect(noPoint.year).toBe(2025)
    expect(noPoint.reasons[0]).toContain(
      'Annonce sans repère : la commune est partagée entre les zones 2, 3, 4'
    )
    const nothing = lookupRentObservatory(
      input({ hasPoint: false, irisCodes: [], inseeCode: null })
    )
    expect(nothing.status).toBe('to_verify')
    expect(nothing.reasons[0]).toContain('sans repère ni commune')
    const lostIris = lookupRentObservatory(input({ irisCodes: ['990019999'] }))
    expect(lostIris.status).toBe('to_verify')
    expect(lostIris.reasons[0]).toContain('Secteur du repère introuvable')
    const border = lookupRentObservatory(
      input({ irisCodes: ['990010101', '990010102'] })
    )
    expect(border.status).toBe('to_verify')
    expect(border.medianPerM2).toBeNull()
    expect(border.reasons[0]).toContain('en limite des zones 2 et 3')
    // Deux IRIS de la même zone : pas d'ambiguïté.
    const same = lookupRentObservatory(
      input({
        tables: [table({ irisZones: { '990010101': 2, '990010102': 2 } })],
        irisCodes: ['990010101', '990010102'],
      })
    )
    expect(same.status).toBe('ok')
  })

  it('est indisponible sans contours importés, sauf pour une commune entière', () => {
    const lookup = lookupRentObservatory(
      input({ irisCodes: [], contoursImported: false })
    )
    expect(lookup.status).toBe('unavailable')
    expect(lookup.year).toBe(2025)
    expect(lookup.reasons[0]).toBe(
      'Contours des quartiers non importés : zone de l’observatoire non disponible.'
    )
    const whole = lookupRentObservatory(
      input({ inseeCode: '99002', irisCodes: [], contoursImported: false })
    )
    expect(whole.status).toBe('ok')
    expect(whole.zone?.zone).toBe(3)
  })

  it('est sans objet hors du périmètre de l’observatoire', () => {
    const outsidePoint = lookupRentObservatory(
      input({ inseeCode: '75056', irisCodes: ['750560101'] })
    )
    expect(outsidePoint.status).toBe('not_applicable')
    expect(outsidePoint.reasons[0]).toContain('Repère hors du périmètre')
    const outsideCommune = lookupRentObservatory(
      input({ inseeCode: '75056', irisCodes: [], hasPoint: false })
    )
    expect(outsideCommune.status).toBe('not_applicable')
    expect(outsideCommune.reasons[0]).toContain('Commune hors du périmètre')
  })

  it('reste à vérifier pour une zone ou une ligne sans loyer publié', () => {
    const noZone = lookupRentObservatory(input({ irisCodes: ['990010103'] }))
    expect(noZone.status).toBe('to_verify')
    expect(noZone.reasons[0]).toBe(
      'Zone 4 sans loyer publié par l’observatoire.'
    )
    // Zone 3 : une seule ligne (2 pièces), rien pour « toutes tailles ».
    const noRow = lookupRentObservatory(
      input({ irisCodes: ['990010102'], rooms: 3 })
    )
    expect(noRow.status).toBe('to_verify')
    expect(noRow.zone).toEqual({ zone: 3, label: 'Zone 3' })
    expect(noRow.reasons[0]).toBe('Aucun loyer publié pour 3 pièces en zone 3.')
    const noRooms = lookupRentObservatory(
      input({ irisCodes: ['990010102'], rooms: null })
    )
    expect(noRooms.reasons[0]).toContain('toutes tailles')
    const large = lookupRentObservatory(
      input({ irisCodes: ['990010102'], rooms: 5 })
    )
    expect(large.reasons[0]).toContain('4 pièces et plus')
  })
})

describe('rentObservatoryLine', () => {
  it('dit la médiane, les quartiles, le loyer mensuel et la source', () => {
    const line = rentObservatoryLine(lookupRentObservatory(input()))
    expect(line).toContain(
      'Loyer observé, zone 2 de l’observatoire des loyers 2025, appartements 2 pièces : médiane 15,0 €/m² (quartiles 13,0 €/m² et 17,0 €/m²), soit 600 € par mois hors charges (de 520 € à 680 € entre les quartiles).'
    )
    expect(line).toContain('un indicateur, pas un plafond')
  })

  it('marque un repère approché et un résultat à vérifier', () => {
    const line = rentObservatoryLine(
      lookupRentObservatory(input({ precision: 'district', rooms: null }))
    )
    expect(line).toContain('Loyer observé (à vérifier), zone 2')
    expect(line).toContain('appartements toutes tailles')
    expect(line).toContain('soit ≈ 560 € par mois')
    expect(line).toContain('Repère approché')
  })

  it('se passe du loyer mensuel sans surface', () => {
    const line = rentObservatoryLine(
      lookupRentObservatory(input({ surface: null, rooms: 7 }))
    )
    expect(line).toContain('appartements 4 pièces et plus : médiane 11,0 €/m²')
    expect(line).not.toContain('soit')
  })

  it('donne la raison quand rien n’est lu', () => {
    expect(
      rentObservatoryLine(lookupRentObservatory(input({ tables: [] })))
    ).toContain('Loyer observé (observatoire des loyers) : Aucun résultat')
    const bare = lookupRentObservatory(input({ tables: [] }))
    expect(rentObservatoryLine({ ...bare, reasons: [] })).toContain(
      'non disponible.'
    )
    // Défensif : une médiane sans quartiles ni année reste lisible.
    const partial = {
      ...lookupRentObservatory(input()),
      q1PerM2: null,
      year: null,
    }
    expect(rentObservatoryLine(partial)).toContain('médiane 15,0 €/m², soit')
  })
})
