import { cliArgs } from '../lib/cli.js'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deflateRawSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvLine } from '../lib/csv.js'
import {
  csvLines,
  dvfUrl,
  readDvf,
  saleOfMutation,
  sourceLabel,
} from '../lib/dvf.js'
import { improves, needsGeocode, queryFor } from '../lib/geocode-missing.js'
import {
  crossCheckCsv,
  decreeDateOf,
  epochOfLabel,
  parseDecreeWorkbook,
  parseZoningGml,
  ringOfPosList,
  roomsOfLabel,
} from '../lib/rent-control.js'
import {
  buildStops,
  lineShortName,
  parseLines,
  parsePaths,
  pointSegmentMeters,
} from '../lib/transit.js'
import { readWorkbook, unzip } from '../lib/xlsx.js'

const fixtures = path.join(import.meta.dirname, 'fixtures')
const fixture = (name: string): string => path.join(fixtures, name)

/** Un zip minimal (en-têtes locaux et répertoire central) ; « deflate » pour les feuilles. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8')
    const deflate = name.includes('worksheets')
    const data = deflate ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
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

/** Un classeur fictif à la manière de la préfecture : zones et pièces fusionnées. */
function decreeWorkbook(
  over: { epochLabel?: string; upper?: number } = {}
): Buffer {
  const strings = [
    'Arrêté préfectoral du 01/07/2030',
    'ANNEXE 1 : loyers de référence ... pour les appartements',
    'Appartements vides',
    'Appartements meublés',
    'Secteur géographique',
    'Nombre de pièces',
    'Époque de construction',
    'Loyer de référence',
    'Loyer de référence majoré',
    'Loyer de référence minoré',
    'Majoration unitaire du loyer de référence',
    'Zone 1',
    over.epochLabel ?? '1 -Avant 1946',
    'Zone 2',
    '4 et plus',
    '4 - Après 1990',
  ]
  const s = (i: number) => `<c r="REF" t="s"><v>${i}</v></c>`
  const cell = (ref: string, xml: string) => xml.replace('REF', ref)
  const n = (ref: string, v: number) => `<c r="${ref}"><v>${v}</v></c>`
  const row = (r: number, cells: string[]) =>
    `<row r="${r}">${cells.join('')}</row>`
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
${row(1, [cell('A1', s(0))])}
${row(2, [cell('A2', s(1))])}
${row(3, [cell('D3', s(2)), cell('G3', s(3))])}
${row(4, [cell('A4', s(4)), cell('B4', s(5)), cell('C4', s(6)), cell('D4', s(7)), cell('E4', s(8)), cell('F4', s(9)), cell('G4', s(10)), cell('H4', s(7)), cell('I4', s(8)), cell('J4', s(9))])}
${row(5, [cell('A5', s(11)), n('B5', 1), cell('C5', s(12)), n('D5', 10), n('E5', over.upper ?? 12), n('F5', 7), n('G5', 1), n('H5', 11), n('I5', 13.2), n('J5', 7.7)])}
${row(6, [cell('A6', s(13)), cell('B6', s(14)), cell('C6', s(15)), n('D6', 9), n('E6', 10.8), n('F6', 6.3), n('G6', 1), n('H6', 10), n('I6', 12), n('J6', 7)])}
</sheetData><mergeCells count="1"><mergeCell ref="A5:A5"/></mergeCells></worksheet>`
  const shared = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings
    .map(t => `<si><t>${t.replace(/&/g, '&amp;')}</t></si>`)
    .join('')}</sst>`
  return zip({
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Appartements" sheetId="1" r:id="rId3"/><sheet name="Maisons" sheetId="2" r:id="rId4"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships><Relationship Id="rId3" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Target="worksheets/sheet2.xml"/></Relationships>`,
    'xl/sharedStrings.xml': shared,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/worksheets/sheet2.xml': `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Maisons</t></is></c><c r="B1" t="str"><v>x &amp; y</v></c></row></sheetData></worksheet>`,
  })
}

describe('ligne de commande', () => {
  it('le séparateur « -- » de pnpm est ignoré', () => {
    expect(
      cliArgs(['node', 'import-dvf.ts', '--', '--year', '2024', '--dry-run'])
    ).toEqual(['--year', '2024', '--dry-run'])
    expect(cliArgs(['node', 'x.ts'])).toEqual([])
  })
})

describe('lecture CSV et xlsx', () => {
  it('CSV : guillemets, virgules dans un champ, guillemet doublé', () => {
    expect(parseCsvLine('a,"b, c","d ""e""",,f\r')).toEqual([
      'a',
      'b, c',
      'd "e"',
      '',
      'f',
    ])
    expect(parseCsvLine('x;y', ';')).toEqual(['x', 'y'])
    expect(parseCsv('\uFEFFa,b\n1,2\n\n3,')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '' },
    ])
  })

  it('xlsx : feuilles nommées, chaînes partagées, nombres, texte en ligne', () => {
    const sheets = readWorkbook(decreeWorkbook())
    expect(sheets.map(s => s.name)).toEqual(['Appartements', 'Maisons'])
    expect(sheets[0]?.cells.get('A1')).toBe('Arrêté préfectoral du 01/07/2030')
    expect(sheets[0]?.cells.get('E5')).toBe(12)
    expect(sheets[0]?.merges).toEqual(['A5:A5'])
    expect(sheets[1]?.cells.get('A1')).toBe('Maisons')
    expect(sheets[1]?.cells.get('B1')).toBe('x & y')
    expect(() => unzip(Buffer.from('pas un zip'))).toThrow('répertoire central')
  })
})

describe('encadrement : zonage, arrêté, contrôle croisé', () => {
  it('zonage GML : un secteur par IRIS, axes remis en [lng, lat], trous conservés', () => {
    const zones = parseZoningGml(
      readFileSync(fixture('zonage-fictif.gml'), 'utf8')
    )
    expect(zones.map(z => [z.zone, z.irisCode, z.label])).toEqual([
      [1, '330630001', 'Secteur fictif 1'],
      [2, '330630002', 'Secteur fictif 2'],
    ])
    const [outer, hole] = zones[0]?.geometry.coordinates[0] ?? []
    expect(outer?.[0]).toEqual([-0.59, 44.83])
    expect(hole).toHaveLength(4)
    expect(ringOfPosList('1 2 3 4', false)).toEqual([
      [1, 2],
      [3, 4],
      [1, 2],
    ])
    expect(() => ringOfPosList('1 2 3', true)).toThrow('illisible')
    expect(() => parseZoningGml('<wfs:FeatureCollection/>')).toThrow(
      'Aucun secteur'
    )
    expect(() =>
      parseZoningGml(
        readFileSync(fixture('zonage-fictif.gml'), 'utf8').replaceAll(
          'urn:ogc:def:crs:EPSG::4326',
          'EPSG:4326'
        )
      )
    ).toThrow('ordre des axes')
  })

  it('arrêté : zones et pièces fusionnées, colonnes repérées par leur libellé', () => {
    const table = parseDecreeWorkbook(decreeWorkbook())
    expect(table.decreeDate).toBe('2030-07-01')
    expect(table.rows).toEqual([
      {
        zone: 1,
        rooms: 1,
        epoch: 'before_1946',
        furnished: false,
        referenceRent: 10,
        upperRent: 12,
        lowerRent: 7,
      },
      {
        zone: 1,
        rooms: 1,
        epoch: 'before_1946',
        furnished: true,
        referenceRent: 11,
        upperRent: 13.2,
        lowerRent: 7.7,
      },
      {
        zone: 2,
        rooms: 4,
        epoch: 'after_1990',
        furnished: false,
        referenceRent: 9,
        upperRent: 10.8,
        lowerRent: 6.3,
      },
      {
        zone: 2,
        rooms: 4,
        epoch: 'after_1990',
        furnished: true,
        referenceRent: 10,
        upperRent: 12,
        lowerRent: 7,
      },
    ])
  })

  it('arrêté : un libellé inattendu ou une incohérence arrête tout', () => {
    expect(() =>
      parseDecreeWorkbook(decreeWorkbook({ epochLabel: '1 - 1950' }))
    ).toThrow('Époque')
    expect(() => parseDecreeWorkbook(decreeWorkbook({ upper: 9 }))).toThrow(
      'minoré < référence < majoré'
    )
    expect(epochOfLabel('3 - 1971-90')).toBe('1971_1990')
    expect(roomsOfLabel(2)).toBe(2)
    expect(() => roomsOfLabel('4')).toThrow('et plus')
    expect(() => roomsOfLabel('studio')).toThrow('inattendu')
    expect(decreeDateOf('Arrêté préfectoral du 06/07/2026')).toBe('2026-07-06')
    expect(() => decreeDateOf('sans date')).toThrow('introuvable')
  })

  it('contrôle croisé : mêmes valeurs, dates d’application lues dans le référentiel', () => {
    const table = parseDecreeWorkbook(decreeWorkbook())
    const csv = readFileSync(fixture('loyers-reference-fictif.csv'), 'utf8')
    const ok = crossCheckCsv(csv, table)
    expect(ok).toEqual({
      compared: 4,
      mismatches: [],
      missing: 0,
      validFrom: '2030-07-15',
      validUntil: '2031-07-14',
      sourceUrl: 'https://example.invalid/arrete-fictif.xlsx',
    })
    const wrong = crossCheckCsv(
      csv.replace('false,10,12,7', 'false,10,12.5,7'),
      table
    )
    expect(wrong.mismatches).toHaveLength(1)
    expect(wrong.mismatches[0]).toContain('majoré 12 (arrêté) contre 12.5')
    expect(
      crossCheckCsv(csv, { ...table, decreeDate: '2031-01-01' }).compared
    ).toBe(0)
  })
})

describe('arrêts TBM', () => {
  const lines = parseLines(
    JSON.parse(readFileSync(fixture('tbm-lignes-fictives.json'), 'utf8'))
  )
  const paths = parsePaths(
    JSON.parse(readFileSync(fixture('tbm-chemins-fictifs.geojson'), 'utf8')),
    lines
  )

  it('lignes actives en nom court ; chemins rattachés à une ligne active', () => {
    expect([...lines.entries()]).toEqual([
      ['59', 'A'],
      ['1', 'Lianes 1'],
      ['61', 'C'],
    ])
    expect(lineShortName('Tram b')).toBe('B')
    expect(
      paths.map(p => [p.line, p.mode, p.lines.length, p.principal])
    ).toEqual([
      ['A', 'tram', 1, true],
      ['Lianes 1', 'bus', 1, true],
      ['C', 'tram', 1, false],
    ])
    // Export JSON sans tracé : terminus seulement.
    const bare = parsePaths(
      [
        {
          vehicule: 'TRAM',
          rs_sv_ligne_a: '59',
          rg_sv_arret_p_nd: '1',
          rg_sv_arret_p_na: 3,
        },
      ],
      lines
    )
    expect(bare[0]?.lines).toEqual([])
    expect(bare[0]?.bbox).toBeNull()
    expect(bare[0]?.principal).toBe(false)
  })

  it('arrêts actifs de la métropole, lignes par terminus et par proximité du tracé', () => {
    const { stops, stats } = buildStops(
      JSON.parse(readFileSync(fixture('tbm-arrets-fictifs.geojson'), 'utf8')),
      paths
    )
    expect(stats).toEqual({
      read: 8,
      inactive: 2,
      outsideMetropole: 1,
      kept: 5,
      withLine: 5,
    })
    const byName = Object.fromEntries(stops.map(s => [s.name, s.lines]))
    // « Milieu » est terminus d'un chemin non principal de C (parcours
    // technique) : seul A, qui l'y dessert par un chemin principal, compte.
    // « Loin du tracé », sans chemin principal, garde C.
    expect(byName).toEqual({
      'Terminus Ouest': ['A'],
      Milieu: ['A'],
      'Terminus Est': ['A'],
      'Loin du tracé': ['C'],
      'Bus du milieu': ['Lianes 1'],
    })
    expect(stops.find(s => s.name === 'Milieu')?.mode).toBe('tram')
  })

  it('distance point-segment en mètres', () => {
    expect(pointSegmentMeters([0, 45], [0, 45], [0, 45])).toBe(0)
    expect(
      pointSegmentMeters([0, 45.001], [-0.01, 45], [0.01, 45])
    ).toBeCloseTo(110.5, 0)
    expect(pointSegmentMeters([0.02, 45], [-0.01, 45], [0.01, 45])).toBeCloseTo(
      787,
      -1
    )
  })
})

describe('DVF', () => {
  it('une mutation d’un seul appartement devient une vente ; les autres sont écartées avec leur raison', async () => {
    const { sales, stats } = await readDvf(
      csvLines(fixture('dvf-fictif.csv')),
      'test'
    )
    expect(stats.lines).toBe(12)
    expect(stats.outsideMetropole).toBe(1)
    expect(stats.years).toEqual([2030])
    expect(stats.skipped).toEqual({
      'avec une maison ou un local (prix global)': 1,
      'plusieurs appartements (prix global)': 1,
      'nature « Echange »': 1,
      'non géolocalisée': 1,
      'prix au m² implausible': 1,
      'sans appartement': 1,
    })
    expect(sales.map(s => s.externalId)).toEqual(['T-1', 'T-7'])
    expect(sales[0]).toEqual({
      externalId: 'T-1',
      mutationDate: '2030-01-10',
      mutationNature: 'Vente',
      price: 180000,
      surface: 45,
      propertyType: 'Appartement',
      rooms: 2,
      address: '12 B RUE FICTIVE',
      postalCode: '33000',
      commune: 'Bordeaux',
      inseeCode: '33063',
      latitude: 44.84,
      longitude: -0.58,
      pricePerM2: 4000,
      source: 'test',
    })
    expect(sales[1]?.mutationNature).toBe("Vente en l'état futur d'achèvement")
  })

  it('lecture en flux d’un fichier compressé ; un fichier qui n’est pas du DVF est refusé', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dvf-'))
    const gz = path.join(dir, '33-2030.csv.gz')
    writeFileSync(gz, gzipSync(readFileSync(fixture('dvf-fictif.csv'))))
    const { sales } = await readDvf(csvLines(gz), 'gz')
    expect(sales).toHaveLength(2)
    const bad = path.join(dir, 'autre.csv')
    writeFileSync(bad, 'a,b\n1,2\n')
    await expect(readDvf(csvLines(bad), 'x')).rejects.toThrow('id_mutation')
    expect(dvfUrl(2024)).toBe(
      'https://files.data.gouv.fr/geo-dvf/latest/csv/2024/departements/33.csv.gz'
    )
  })

  it('une URL est lue par fetch (injecté), une réponse en erreur lance', async () => {
    const body = new Blob([readFileSync(fixture('dvf-fictif.csv'))]).stream()
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(body, { status: 200 })
      )) as unknown as typeof fetch
    const { sales } = await readDvf(
      csvLines('https://example.invalid/dvf.csv', fakeFetch),
      'url'
    )
    expect(sales).toHaveLength(2)
    const failing = (() =>
      Promise.resolve(
        new Response(null, { status: 404 })
      )) as unknown as typeof fetch
    await expect(
      readDvf(csvLines('https://example.invalid/x.csv', failing), 'url')
    ).rejects.toThrow('404')
    expect('skipped' in saleOfMutation([], 'x')).toBe(true)
    expect(
      sourceLabel(
        'https://files.data.gouv.fr/geo-dvf/latest/csv/2024/departements/33.csv.gz'
      )
    ).toBe('dvf-geo-etalab:2024/33.csv.gz')
    expect(sourceLabel('/chemin/vers/33-2024.csv.gz')).toBe(
      'dvf-geo-etalab:33-2024.csv.gz'
    )
  })
})

describe('géocodage des annonces manquantes', () => {
  const base = {
    id: '1',
    title: 'T2',
    addressRaw: '1 rue Fictive',
    commune: 'Talence',
    precision: null,
    hasPoint: false,
  } as const
  const result = (precision: 'exact' | 'commune') => ({
    point: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
    precision,
    label: 'x',
    city: 'Talence',
    citycode: '33522',
    banId: null,
    score: 0.9,
  })

  it('sans point, ou au centroïde avec une adresse', () => {
    expect(needsGeocode(base)).toBe(true)
    expect(needsGeocode({ ...base, addressRaw: null })).toBe(true)
    expect(needsGeocode({ ...base, addressRaw: null, commune: null })).toBe(
      false
    )
    expect(
      needsGeocode({ ...base, hasPoint: true, precision: 'commune' })
    ).toBe(true)
    expect(
      needsGeocode({
        ...base,
        hasPoint: true,
        precision: 'commune',
        addressRaw: '',
      })
    ).toBe(false)
    expect(needsGeocode({ ...base, hasPoint: true, precision: 'exact' })).toBe(
      false
    )
  })

  it('requête et amélioration', () => {
    expect(queryFor(base)).toEqual({
      query: '1 rue Fictive, Talence',
      kind: 'address',
    })
    expect(queryFor({ ...base, addressRaw: null })).toEqual({
      query: 'Talence',
      kind: 'municipality',
    })
    expect(queryFor({ ...base, addressRaw: null, commune: null })).toBeNull()
    expect(improves(base, result('commune'))).toBe(true)
    expect(improves(base, null)).toBe(false)
    expect(
      improves(
        { ...base, hasPoint: true, precision: 'commune' },
        result('exact')
      )
    ).toBe(true)
    expect(
      improves(
        { ...base, hasPoint: true, precision: 'commune' },
        result('commune')
      )
    ).toBe(false)
  })
})
