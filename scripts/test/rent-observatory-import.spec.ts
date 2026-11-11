/**
 * Lot 28 : lecture des résultats d'un observatoire local des loyers.
 * Fichiers fictifs (observatoire « L9900 ») : aucune valeur réelle.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lookupRentObservatory } from '@apart/domain'
import {
  buildRentObservatoryTable,
  frenchNumber,
  ollArchiveName,
  ollArchiveUrl,
  parseOllResults,
  parseOllZoneCode,
  parseOllZoning,
  readOllArchive,
  roomsOfOllLabel,
  sha256Of,
} from '../lib/rent-observatory.js'

const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')

const RESULTS = fixture('oll-resultats-fictifs.csv')
const ZONING = fixture('oll-zonage-fictif.csv')

/** Un zip minimal, fichiers « stockés » (sans compression). */
function zip(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

describe('aides de lecture', () => {
  it('compose l’adresse et le nom de l’archive d’une année', () => {
    expect(ollArchiveUrl(2025)).toBe(
      'https://www.observatoires-des-loyers.org/datagouv/2025/Base_OP_2025_L3300.zip'
    )
    expect(ollArchiveUrl(2030, 'L9900')).toContain('Base_OP_2030_L9900.zip')
    expect(ollArchiveName(2025)).toBe('Base_OP_2025_L3300.zip')
  })

  it('lit un nombre à la française', () => {
    expect(frenchNumber('13,4')).toBe(13.4)
    expect(frenchNumber('1 200')).toBe(1200)
    expect(frenchNumber('12 923')).toBe(12923)
    expect(frenchNumber('')).toBeNull()
    expect(frenchNumber(undefined)).toBeNull()
    expect(frenchNumber('n.d.')).toBeNull()
  })

  it('reconnaît les tranches de pièces des appartements', () => {
    expect(roomsOfOllLabel('Appart 1P')).toBe(1)
    expect(roomsOfOllLabel('Appart 3P')).toBe(3)
    expect(roomsOfOllLabel('Appart 4P+')).toBe(4)
    expect(roomsOfOllLabel('Appart 4P')).toBeNull()
    expect(roomsOfOllLabel('Maison 4P+')).toBeNull()
    expect(roomsOfOllLabel('Ensemble 2P')).toBeNull()
  })

  it('lit le code d’une zone de calcul', () => {
    expect(parseOllZoneCode('L3300.1.03')).toEqual({
      observatory: 'L3300',
      set: 1,
      zone: 3,
    })
    expect(parseOllZoneCode('')).toBeNull()
    expect(parseOllZoneCode('Zone 3')).toBeNull()
  })
})

describe('parseOllResults', () => {
  it('garde les appartements par zone : toutes tailles, pièces, arrivés récents', () => {
    const results = parseOllResults(RESULTS, 'L9900')
    expect(results.observatory).toBe('L9900')
    expect(results.year).toBe(2030)
    expect(results.lines).toBe(24)
    expect([...results.zones.keys()].sort()).toEqual([1, 2, 3])
    const zone1 = results.zones.get(1)
    expect(zone1?.stats).toEqual([
      {
        rooms: null,
        medianPerM2: 10.5,
        q1PerM2: 9.5,
        q3PerM2: 11.5,
        observations: 1000,
      },
      {
        rooms: 1,
        medianPerM2: 13,
        q1PerM2: 12,
        q3PerM2: 14,
        observations: 150,
      },
      {
        rooms: 2,
        medianPerM2: 11,
        q1PerM2: 10,
        q3PerM2: 12,
        observations: 400,
      },
      { rooms: 3, medianPerM2: 10, q1PerM2: 9, q3PerM2: 11, observations: 300 },
      // Nombre d'observations vide dans la source : 0.
      { rooms: 4, medianPerM2: 9, q1PerM2: 8, q3PerM2: 10, observations: 0 },
    ])
    // Les arrivés récents sont ceux des appartements, pas de l'ensemble.
    expect(zone1?.recentTenants).toEqual({
      rooms: null,
      medianPerM2: 11.5,
      q1PerM2: 10,
      q3PerM2: 12.5,
      observations: 250,
    })
    // Zone 2 : la ligne « 3 pièces » sans médiane n'est pas publiée.
    expect(results.zones.get(2)?.stats.map(s => s.rooms)).toEqual([null, 2])
    expect(results.zones.get(2)?.recentTenants).toBeNull()
    // 5 + 1 (zone 1), 2 (zone 2), 1 (zone 3).
    expect(results.kept).toBe(9)
  })

  it('refuse une base illisible, vide ou ambiguë', () => {
    expect(() => parseOllResults('a;b\n1;2\n')).toThrow('Zone_calcul')
    expect(() => parseOllResults('')).toThrow('Zone_calcul')
    expect(() => parseOllResults(RESULTS, 'L3300')).toThrow(
      'Aucun loyer d’appartement'.replace('’', "'")
    )
    const otherYear = RESULTS.replace(
      'B9900;2030;L9900;L9900.1.02;;Appartement',
      'B9900;2031;L9900;L9900.1.02;;Appartement'
    )
    expect(() => parseOllResults(otherYear, 'L9900')).toThrow(
      "Année d'enquête ambiguë dans la base : 2030, 2031."
    )
    const otherSet = RESULTS.replace(
      'L9900.1.03;;Appartement',
      'L9900.2.03;;Appartement'
    )
    expect(() => parseOllResults(otherSet, 'L9900')).toThrow(
      'Plusieurs découpages en zones'
    )
    const noYear = RESULTS.replaceAll(';2030;', ';;')
    expect(() => parseOllResults(noYear, 'L9900')).toThrow(': aucune.')
  })
})

describe('parseOllZoning', () => {
  it('range une commune entière par son code INSEE, une commune partagée par IRIS', () => {
    const zoning = parseOllZoning(ZONING)
    expect(zoning.communes).toBe(3)
    expect(zoning.communeZones).toEqual({ '99002': 2, '99003': 2 })
    expect(zoning.irisZones).toEqual({
      '990010101': 1,
      '990010102': 1,
      '990010201': 2,
    })
    expect(zoning.labels.get(1)).toBe('Zone 1')
    // Libellé vide dans la source : « Zone <numéro> ».
    expect(zoning.labels.get(2)).toBe('Zone 2')
  })

  it('refuse un zonage illisible ou une commune partagée sans IRIS', () => {
    expect(() => parseOllZoning('a;b\n1;2\n')).toThrow('colonne « ZONE »')
    expect(() =>
      parseOllZoning('INSEE;LIBCOM;IRIS;ZONE;LIB_ZONE\nabc;X;;01;Zone 1\n')
    ).toThrow('ligne illisible')
    expect(() =>
      parseOllZoning('INSEE;LIBCOM;IRIS;ZONE;LIB_ZONE\n99001;X;;;Zone 1\n')
    ).toThrow('ligne illisible')
    expect(() =>
      parseOllZoning(
        'INSEE;LIBCOM;IRIS;ZONE;LIB_ZONE\n99001;X;990010101;01;Zone 1\n99001;X;;02;Zone 2\n'
      )
    ).toThrow('partagée entre plusieurs zones')
  })
})

describe('archive et table', () => {
  const archive = zip({
    'Base_OP_2030_L9900.csv': Buffer.from(RESULTS, 'latin1'),
    'dossier/L9900Zonage2030.csv': Buffer.from(ZONING, 'latin1'),
    'L9900_agglo_2030.kml': Buffer.from('<kml/>'),
  })

  it('lit la base et le zonage dans l’archive, en Latin-1', () => {
    const { results, zoning } = readOllArchive(archive, 'L9900')
    expect(results).toBe(RESULTS)
    expect(zoning).toBe(ZONING)
    const accented = zip({
      'Base_OP_2030_L9900.csv': Buffer.from(
        'Zone_calcul;x\nAprès 2005;1\n',
        'latin1'
      ),
      'L9900Zonage2030.csv': Buffer.from(ZONING, 'latin1'),
    })
    expect(readOllArchive(accented, 'L9900').results).toContain('Après 2005')
    expect(() => readOllArchive(archive)).toThrow('base des résultats')
    expect(() =>
      readOllArchive(
        zip({ 'Base_OP_2030_L9900.csv': Buffer.from(RESULTS, 'latin1') }),
        'L9900'
      )
    ).toThrow('zonage')
  })

  it('assemble la table et écarte une zone absente du zonage', () => {
    const table = buildRentObservatoryTable({
      results: parseOllResults(RESULTS, 'L9900'),
      zoning: parseOllZoning(ZONING),
      source: {
        url: 'https://example.invalid/Base_OP_2030_L9900.zip',
        file: 'Base_OP_2030_L9900.zip',
        sha256: sha256Of(archive),
      },
      importedAt: '2030-11-11T10:00:00.000Z',
    })
    expect(table).toMatchObject({
      territory: 'bordeaux',
      observatory: 'L9900',
      year: 2030,
      observedAt: '2030-01-01',
      housingType: 'apartment',
      communeZones: { '99002': 2, '99003': 2 },
    })
    expect(table.zones.map(z => [z.zone, z.label])).toEqual([
      [1, 'Zone 1'],
      [2, 'Zone 2'],
    ])
    expect(table.source.sha256).toMatch(/^[0-9a-f]{64}$/)
    // De bout en bout : un 2 pièces de 40 m² dans un IRIS de la zone 1.
    const lookup = lookupRentObservatory({
      tables: [table],
      hasPoint: true,
      precision: 'exact',
      inseeCode: '99001',
      irisCodes: ['990010102'],
      rooms: 2,
      surface: 40,
      targetRent: 500,
    })
    expect(lookup).toMatchObject({
      status: 'ok',
      zone: { zone: 1, label: 'Zone 1' },
      medianPerM2: 11,
      monthlyMedian: 440,
      position: 'above_q3',
    })
  })

  it('refuse un zonage dont une zone n’a aucun loyer publié', () => {
    const zoning = parseOllZoning(`${ZONING}99004;AUTRE;;07;Zone 7\n`)
    expect(() =>
      buildRentObservatoryTable({
        results: parseOllResults(RESULTS, 'L9900'),
        zoning,
        source: { url: null, file: 'x.zip', sha256: 'abc' },
        importedAt: '2030-11-11T10:00:00.000Z',
      })
    ).toThrow('Zones du zonage sans loyer publié dans la base : 7')
  })
})
