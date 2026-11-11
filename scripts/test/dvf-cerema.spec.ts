import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CEREMA_DVF_API,
  ceremaSourceLabel,
  ceremaUrl,
  communeGroups,
  readCeremaDvf,
  representativePoint,
  saleOfCeremaFeature,
} from '../lib/dvf-cerema.js'

/** Deux pages fictives de l'API « DVF+ open-data » (identifiants « fictif… », année 2030). */
const { pages } = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'dvfplus-fictif.json'),
    'utf8'
  )
) as { pages: { count: number; next: string | null; features: unknown[] }[] }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Une API factice : les deux pages pour le premier groupe de communes. */
function fakeApi() {
  return vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input))
    const page = Number(url.searchParams.get('page'))
    return Promise.resolve(json(pages[page - 1] ?? { count: 0, features: [] }))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('lot 29 : ventes d’avant 2021 par l’API DVF+ open-data du Cerema', () => {
  it('adresse d’une page et communes par groupes de dix', () => {
    expect(ceremaUrl(2015, ['33063', '33281'], 2)).toBe(
      `${CEREMA_DVF_API}?anneemut=2015&code_insee=33063,33281&codtypbien=121&page_size=500&page=2`
    )
    expect(ceremaUrl(2016, ['33063'], 1, 50)).toContain('page_size=50&page=1')
    const groups = communeGroups()
    expect(groups.map(g => g.length)).toEqual([10, 10, 8])
    expect(groups.flat()).toContain('33063')
    expect(communeGroups(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']])
    expect(ceremaSourceLabel(2015)).toBe('dvfplus-open-data-cerema:2015')
  })

  it('le repère d’une mutation : centre de sa plus grande parcelle', () => {
    const square = (x: number, y: number, d: number): number[][][] => [
      [
        [x, y],
        [x + d, y],
        [x + d, y + d],
        [x, y + d],
        [x, y],
      ],
    ]
    const polygon = representativePoint({
      type: 'Polygon',
      coordinates: square(1, 2, 2),
    })
    expect(polygon?.[0]).toBeCloseTo(2, 10)
    expect(polygon?.[1]).toBeCloseTo(3, 10)
    const multi = representativePoint({
      type: 'MultiPolygon',
      coordinates: [square(0, 0, 1), square(10, 10, 4), []],
    })
    expect(multi?.[0]).toBeCloseTo(12, 10)
    expect(multi?.[1]).toBeCloseTo(12, 10)
    // Anneau dégénéré (trois points alignés) : la moyenne de ses sommets.
    expect(
      representativePoint({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [4, 0],
          ],
        ],
      })
    ).toEqual([2, 0])
    expect(representativePoint(null)).toBeNull()
    expect(representativePoint('x')).toBeNull()
    expect(
      representativePoint({ type: 'Point', coordinates: [1, 2] })
    ).toBeNull()
    expect(
      representativePoint({ type: 'Polygon', coordinates: [[]] })
    ).toBeNull()
    expect(
      representativePoint({
        type: 'Polygon',
        coordinates: [
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
        ],
      })
    ).toBeNull()
  })

  it('une mutation d’un seul appartement devient une vente, sans adresse ni pièces', () => {
    const features = pages.flatMap(p => p.features)
    const first = saleOfCeremaFeature(features[0], 'test')
    expect(first).toEqual({
      sale: {
        externalId: 'dvfplus:fictif0001',
        mutationDate: '2030-03-15',
        mutationNature: 'Vente',
        price: 180000,
        surface: 45,
        propertyType: 'Appartement',
        rooms: null,
        address: null,
        postalCode: null,
        commune: 'Bordeaux',
        inseeCode: '33063',
        latitude: 44.8401,
        longitude: -0.5799,
        pricePerM2: 4000,
        source: 'test',
      },
    })
    const vefa = saleOfCeremaFeature(features[1], 'test')
    expect(vefa).toMatchObject({
      sale: {
        mutationNature: "Vente en l'état futur d'achèvement",
        commune: 'Mérignac',
        latitude: 44.8302,
        longitude: -0.6498,
        pricePerM2: 5000,
      },
    })
    expect(features.slice(2).map(f => saleOfCeremaFeature(f, 'test'))).toEqual([
      { skipped: 'nature « Echange »' },
      { skipped: 'non géolocalisée' },
      { skipped: 'prix au m² implausible' },
      { skipped: 'hors métropole ou sur plusieurs communes' },
      { skipped: 'surface absente ou < 9 m²' },
      { skipped: 'sans valeur foncière' },
      { skipped: 'autre qu’un seul appartement' },
    ])
    expect(saleOfCeremaFeature(null, 'test')).toEqual({
      skipped: 'autre qu’un seul appartement',
    })
    expect(
      saleOfCeremaFeature(
        {
          properties: {
            codtypbien: '121',
            libnatmut: 'Vente',
            l_codinsee: ['33063'],
            datemut: '15/03/2030',
          },
        },
        'test'
      )
    ).toEqual({ skipped: 'sans identifiant ou sans date' })
    expect(
      saleOfCeremaFeature(
        {
          properties: {
            codtypbien: '121',
            libnatmut: 'Vente',
            l_codinsee: '33063',
          },
        },
        'test'
      )
    ).toEqual({ skipped: 'hors métropole ou sur plusieurs communes' })
  })

  it('lit toutes les pages de chaque groupe de communes, une mutation une seule fois', async () => {
    const api = fakeApi()
    const seen: number[] = []
    const { sales, stats } = await readCeremaDvf(2030, {
      fetchImpl: api,
      inseeCodes: ['33063', '33281'],
      pauseMs: 1,
      onPage: info => seen.push(info.read),
    })
    expect(api).toHaveBeenCalledTimes(2)
    expect(String(api.mock.calls[0]?.[0])).toContain(
      'anneemut=2030&code_insee=33063,33281&codtypbien=121'
    )
    expect(seen).toEqual([5, 9])
    expect(sales.map(s => s.externalId)).toEqual([
      'dvfplus:fictif0001',
      'dvfplus:fictif0002',
    ])
    expect(sales[0]?.source).toBe('dvfplus-open-data-cerema:2030')
    expect(stats).toEqual({
      lines: 9,
      outsideMetropole: 0,
      mutations: 9,
      kept: 2,
      skipped: {
        'nature « Echange »': 1,
        'non géolocalisée': 1,
        'prix au m² implausible': 1,
        'hors métropole ou sur plusieurs communes': 1,
        'surface absente ou < 9 m²': 1,
        'sans valeur foncière': 1,
        'autre qu’un seul appartement': 1,
      },
      communes: 2,
      years: [2030],
    })
  })

  it('une mutation rendue par deux groupes n’est comptée qu’une fois ; une vente d’une autre année est écartée', async () => {
    const [page] = pages
    const one = { count: 1, next: null, features: [page?.features[0]] }
    const api = vi.fn(() =>
      Promise.resolve(json(one))
    ) as unknown as typeof fetch
    // Trois groupes (28 communes) rendent la même mutation.
    const { sales, stats } = await readCeremaDvf(2030, { fetchImpl: api })
    expect(api).toHaveBeenCalledTimes(3)
    expect(stats).toMatchObject({ lines: 3, mutations: 1, kept: 1 })
    expect(sales).toHaveLength(1)

    const other = await readCeremaDvf(2031, { fetchImpl: api })
    expect(other.sales).toEqual([])
    expect(other.stats.skipped).toEqual({ 'hors de l’année demandée': 1 })

    // Une mutation sans identifiant reste comptée (clé de repli).
    const anonymous = {
      count: 1,
      next: null,
      features: [{ properties: { codtypbien: '121' } }],
    }
    const without = await readCeremaDvf(2030, {
      fetchImpl: vi.fn(() =>
        Promise.resolve(json(anonymous))
      ) as unknown as typeof fetch,
      inseeCodes: ['33063'],
    })
    expect(without.stats).toMatchObject({ mutations: 1, kept: 0 })
  })

  it('relit une page après une erreur passagère ; une lecture tronquée ou refusée arrête l’import', async () => {
    const [page] = pages
    const one = { count: 1, next: null, features: [page?.features[0]] }
    let calls = 0
    const flaky = vi.fn(() => {
      calls++
      if (calls === 1) return Promise.resolve(json({}, 502))
      if (calls === 2) return Promise.reject(new Error('coupure'))
      return Promise.resolve(json(one))
    }) as unknown as typeof fetch
    const { sales } = await readCeremaDvf(2030, {
      fetchImpl: flaky,
      inseeCodes: ['33063'],
      retryMs: 0,
    })
    expect(sales).toHaveLength(1)
    expect(calls).toBe(3)

    const down = vi.fn(() =>
      Promise.resolve(json({}, 502))
    ) as unknown as typeof fetch
    await expect(
      readCeremaDvf(2030, {
        fetchImpl: down,
        inseeCodes: ['33063'],
        attempts: 2,
        retryMs: 1,
      })
    ).rejects.toThrow('Lecture impossible (502)')
    expect(down).toHaveBeenCalledTimes(2)

    const cut = vi.fn(() =>
      Promise.reject('réseau coupé')
    ) as unknown as typeof fetch
    await expect(
      readCeremaDvf(2030, {
        fetchImpl: cut,
        inseeCodes: ['33063'],
        attempts: 1,
      })
    ).rejects.toThrow('Lecture impossible (réseau coupé)')

    // Une erreur 4xx (trop de communes) n'est pas relue.
    const refused = vi.fn(() =>
      Promise.resolve(json({ detail: 'refus' }, 400))
    ) as unknown as typeof fetch
    await expect(
      readCeremaDvf(2030, { fetchImpl: refused, inseeCodes: ['33063'] })
    ).rejects.toThrow('Lecture impossible (400)')
    expect(refused).toHaveBeenCalledTimes(1)

    // L'API annonce neuf mutations, n'en rend que cinq : rien n'est rendu.
    const truncated = vi.fn(() =>
      Promise.resolve(json({ ...pages[0], next: null }))
    ) as unknown as typeof fetch
    await expect(
      readCeremaDvf(2030, { fetchImpl: truncated, inseeCodes: ['33063'] })
    ).rejects.toThrow('Lecture incomplète de 2030 (5 mutations lues sur 9')

    // Une réponse sans liste ni compte : aucune vente, aucune erreur.
    const empty = await readCeremaDvf(2030, {
      fetchImpl: vi.fn(() =>
        Promise.resolve(json({}))
      ) as unknown as typeof fetch,
      inseeCodes: ['33063'],
    })
    expect(empty.sales).toEqual([])
  })
})
