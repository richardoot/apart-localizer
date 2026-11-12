/**
 * Lot 14 : adéquation des annonces aux critères (ADR 0024) sur un vrai
 * PostGIS, par le REST et le MCP. Quatre niveaux (dans, à confirmer, à la
 * marge, hors) ; l'adresse imprécise comparée par son contour, jamais par
 * son repère (l'exemple de Richard) ; marge de tolérance réglable ; onglets
 * de la liste et exception « gardée » ; recalcul à l'écriture d'une
 * annonce, d'un critère et des hypothèses ; journal, alertes, « ce qui a
 * changé » ; historique ; export. Données et lieux fictifs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { NEIGHBOURHOOD_TERRITORY } from '@apart/contracts'
import type { Polygon } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'
import { GeoService } from '../src/geo/geo.service'
import type { NeighbourhoodRow } from '../src/geo/geo.service'
import { DATA_TAG } from '../src/mcp/tool-results'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const square = (west: number, south: number, w: number, h = w): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [west + w, south],
      [west + w, south + h],
      [west, south + h],
      [west, south],
    ],
  ],
})

/** Un secteur fictif (0,01° de côté) ; son repère est en son centre (≈ -0,595 ; 44,855). */
const SECTOR: NeighbourhoodRow = {
  kind: 'quartier',
  code: 'S-FICTIF',
  name: 'Secteur fictif Ouest',
  parent: null,
  commune: 'Bordeaux',
  inseeCode: '33063',
  source: 'Secteurs fictifs',
  geometry: square(-0.6, 44.85, 0.01),
}
/** Un périmètre qui prend l'est du secteur : le repère est dehors, le contour le chevauche. */
const EAST = square(-0.5935, 44.84, 0.02, 0.03)
/** Un rectangle « Talence » (fictif) pour les marges. */
const BOX = square(-0.62, 44.79, 0.05, 0.025)

const point = (lng: number, lat: number) => ({
  type: 'Point',
  coordinates: [lng, lat],
})

function listing(
  title: string,
  at: [number, number],
  over: Record<string, unknown> = {}
) {
  return {
    title,
    price: 215_000,
    surface: 66,
    rooms: 3,
    dpeClass: 'C',
    location: {
      commune: 'Talence',
      point: point(at[0], at[1]),
      precision: 'exact',
    },
    rentalPlan: { targetRent: 900 },
    ...over,
  }
}

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

/** Le géocodeur : la commune au centre ; une adresse au numéro dans le périmètre est. */
function geocoder() {
  return (url: string) =>
    url.includes('type=municipality')
      ? json({
          features: [
            {
              geometry: { type: 'Point', coordinates: [-0.59, 44.85] },
              properties: {
                label: 'Bordeaux',
                score: 0.9,
                type: 'municipality',
                city: 'Bordeaux',
                citycode: '33063',
              },
            },
          ],
        })
      : json({
          features:
            decodeURIComponent(url).toLowerCase().includes('rue fictive') ||
            url.toLowerCase().includes('rue+fictive')
              ? [
                  {
                    geometry: { type: 'Point', coordinates: [-0.592, 44.856] },
                    properties: {
                      label: '1 Rue Fictive 33000 Bordeaux',
                      score: 0.95,
                      type: 'housenumber',
                      city: 'Bordeaux',
                      citycode: '33063',
                      id: '33063_9999_00001',
                    },
                  },
                ]
              : [],
        })
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

describe('Adéquation aux critères (e2e, lot 14)', () => {
  let ctx: E2eContext
  let nextId = 1

  const api = () => request(ctx.server)

  async function rpc(
    identity: E2eIdentity,
    name: string,
    args: unknown
  ): Promise<ToolResult> {
    const res = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(identity))
      .send({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      })
    expect(res.status).toBe(200)
    return res.body.result as ToolResult
  }

  function fenced<T>(result: ToolResult): T {
    const text = result.content[0]?.text ?? ''
    const match = text.match(
      new RegExp(`<${DATA_TAG}>\\n([\\s\\S]*)\\n</${DATA_TAG}>`)
    )
    return JSON.parse(match?.[1] ?? '{}') as T
  }

  // Les annonces fictives se ressemblent exprès (ADR 0041 : un doublon probable bloque).
  async function create(body: object, as: E2eIdentity = richard) {
    return (
      await api()
        .post('/listings')
        .set(ctx.auth(as))
        .send({ ignoreDuplicates: true, ...body })
        .expect(201)
    ).body
  }

  async function criteria(body: object) {
    return (
      await api()
        .post('/search-criteria')
        .set(ctx.auth(richard))
        .send(body)
        .expect(201)
    ).body
  }

  async function list(query = '') {
    return (
      await api().get(`/listings${query}`).set(ctx.auth(richard)).expect(200)
    ).body
  }

  const ids = (page: { items: Array<{ listing: { id: string } }> }) =>
    new Set(page.items.map(i => i.listing.id))

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    await ctx.prisma.workspace.create({
      data: {
        name: 'Richard et Chloé',
        members: {
          create: [
            {
              handle: 'richard',
              displayName: 'Richard',
              email: richard.email,
              role: 'owner',
            },
            { handle: 'chloe', displayName: 'Chloé', email: chloe.email },
          ],
        },
      },
    })
    await ctx.app
      .get(GeoService)
      .replaceNeighbourhoods(NEIGHBOURHOOD_TERRITORY, [SECTOR])
    ctx.geocoding.fetchImpl = geocoder()
  })

  it('sans critère actif : toutes les annonces sont « dans les critères », rien ne disparaît', async () => {
    await create(listing('T3 fictif A', [-0.6, 44.8]))
    await create(listing('T3 fictif B', [-0.5, 44.9], { price: 900_000 }))
    const page = await list()
    expect(page.total).toBe(2)
    expect(page.fit).toEqual({
      activeCriteria: [],
      counts: { in: 2, to_confirm: 0, margin: 0, out: 0 },
      kept: 0,
      criteriaId: null,
    })
    expect(page.items[0].criteriaFit).toMatchObject({
      level: 'in',
      activeCriteria: 0,
    })
    // Même un filtre « hors critères » ne cache rien sans critère actif.
    expect((await list('?fit=out')).total).toBe(2)
  })

  it('l’exemple de Richard : au quartier, à cheval sur le périmètre, « à confirmer » jusqu’à l’adresse', async () => {
    const east = await criteria({
      name: 'Est fictif',
      filters: { priceMax: 220_000 },
      perimeter: { type: 'polygon', polygon: EAST },
    })
    const created = await create({
      title: 'T4 fictif au quartier',
      price: 218_000,
      surface: 80,
      rooms: 4,
      location: { commune: 'Bordeaux', district: 'Secteur fictif Ouest' },
    })
    expect(created.listing.location.precision).toBe('district')
    // Le repère (centre du secteur) est hors du périmètre ; le contour le
    // chevauche : l'annonce reste, à confirmer.
    expect(created.listing.location.point.coordinates[0]).toBeLessThan(-0.5935)
    expect(created.criteriaFit).toMatchObject({
      level: 'to_confirm',
      locationPending: true,
      reasons: ['quartier à cheval sur le périmètre : adresse à préciser'],
    })
    expect(created.criteriaChanges.entered).toEqual([
      expect.objectContaining({
        criteriaId: east.id,
        level: 'to_confirm',
        approximate: true,
      }),
    ])
    const perimeterCheck = created.criteriaFit.criteria[0].checks.find(
      (c: { key: string }) => c.key === 'perimeter'
    )
    expect(perimeterCheck.detail).toMatch(/pour \d+ % dans le périmètre/)
    // L'entrée alerte Chloé (c'est l'annonce qui a bougé).
    const alerts = await ctx.prisma.notification.count({
      where: { type: 'criteria_matched', listingId: created.listing.id },
    })
    expect(alerts).toBe(1)

    // L'adresse précisée tranche : dans les critères.
    const precise = await api()
      .patch(`/listings/${created.listing.id}`)
      .set(ctx.auth(richard))
      .send({
        location: {
          addressRaw: '1 rue Fictive',
          commune: 'Bordeaux',
          district: 'Secteur fictif Ouest',
        },
      })
      .expect(200)
    expect(precise.body.listing.location.precision).toBe('exact')
    expect(precise.body.criteriaFit.level).toBe('in')
    expect(precise.body.criteriaChanges.changed).toEqual([
      {
        criteriaId: east.id,
        name: 'Est fictif',
        before: 'to_confirm',
        after: 'in',
        reasons: [],
      },
    ])
    const changed = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { listingId: created.listing.id, action: 'criteria.fit_changed' },
    })
    expect(changed.after).toMatchObject({
      cause: 'listing',
      trigger: 'location',
    })

    const history = await api()
      .get(`/listings/${created.listing.id}/criteria-fit/history`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(history.body.items.map((i: { what: string }) => i.what)).toEqual([
      '« Est fictif » : à confirmer → dans les critères',
      'Entrée dans « Est fictif », à confirmer',
      'Enregistrée',
    ])
    await api()
      .get(
        '/listings/00000000-0000-4000-8000-000000000000/criteria-fit/history'
      )
      .set(ctx.auth(richard))
      .expect(404)
  })

  it('marges, onglets, exception « gardée », marge désactivée, entrées et sorties', async () => {
    const box = await criteria({
      name: 'Talence fictif',
      filters: { priceMax: 220_000, surfaceMin: 60 },
      perimeter: { type: 'polygon', polygon: BOX },
    })
    expect(box.tolerance).toMatchObject({
      perimeterMeters: 300,
      priceMaxShare: 0.05,
    })
    const a = await create(listing('A dedans', [-0.6, 44.8]))
    const b = await create(
      listing('B prix +3,6 %', [-0.6, 44.805], { price: 228_000 })
    )
    // 180 m à l'est du rectangle.
    const c = await create(
      listing('C à 180 m', [-0.56772, 44.8], { price: 214_000 })
    )
    const d = await create(
      listing('D trop cher, offre faite', [-0.59, 44.8], {
        price: 262_000,
        status: 'offer_made',
      })
    )
    const e = await create(listing('E loin', [-0.5, 44.8], { price: 168_000 }))
    const f = await create(
      listing('F surface inconnue', [-0.61, 44.8], { surface: null })
    )
    expect(a.criteriaFit.level).toBe('in')
    expect(b.criteriaFit).toMatchObject({
      level: 'margin',
      reasons: [expect.stringContaining('Prix +3,6 % (maximum 220')],
    })
    expect(c.criteriaFit.reasons).toEqual([
      expect.stringMatching(/^1[78]\d m hors du périmètre \(marge 300 m\)$/),
    ])
    expect(d.criteriaFit).toMatchObject({ level: 'out', kept: 'offer' })
    expect(e.criteriaFit.reasons[0]).toMatch(
      /^à [\d,]+ km du périmètre \(marge 300 m\)$/
    )
    expect(f.criteriaFit).toMatchObject({
      level: 'to_confirm',
      reasons: ['surface inconnue (minimum 60 m²)'],
      locationPending: false,
    })
    // Une première comparaison hors critères n'est pas une sortie : pas de journal.
    expect(
      await ctx.prisma.activityLog.count({
        where: { listingId: e.listing.id, action: { startsWith: 'criteria.' } },
      })
    ).toBe(0)

    const main = await list()
    expect(ids(main)).toEqual(new Set([a, b, c, d, f].map(x => x.listing.id)))
    expect(main.fit).toMatchObject({
      counts: { in: 1, to_confirm: 1, margin: 2, out: 2 },
      kept: 1,
      activeCriteria: [{ id: box.id, name: 'Talence fictif' }],
    })
    expect(ids(await list('?fit=out'))).toEqual(
      new Set([d.listing.id, e.listing.id])
    )
    expect(ids(await list('?fit=margin'))).toEqual(
      new Set([b.listing.id, c.listing.id])
    )
    // Le critère choisi : ses niveaux, la même exception.
    expect(ids(await list(`?criteriaId=${box.id}`))).toEqual(ids(main))

    // Une visite prévue garde aussi une annonce hors critères dans la liste.
    await api()
      .post(`/listings/${e.listing.id}/visits`)
      .set(ctx.auth(richard))
      .send({ visitedAt: '2030-01-10T17:00:00.000Z', status: 'planned' })
      .expect(201)
    const withVisit = await list()
    expect(withVisit.fit.kept).toBe(2)
    expect(
      withVisit.items.find(
        (i: { listing: { id: string } }) => i.listing.id === e.listing.id
      ).criteriaFit.kept
    ).toBe('visit')

    // Marge désactivée : B et C passent hors critères ; journal sans alerte,
    // date de modification des annonces intacte.
    const before = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: b.listing.id },
    })
    const notificationsBefore = await ctx.prisma.notification.count()
    const strict = await api()
      .patch(`/search-criteria/${box.id}`)
      .set(ctx.auth(richard))
      .send({ tolerance: { priceMaxShare: 0, perimeterMeters: 0 } })
      .expect(200)
    expect(strict.body.tolerance).toMatchObject({
      priceMaxShare: 0,
      perimeterMeters: 0,
      surfaceMinShare: 0.05,
    })
    expect(strict.body.fitChanges).toMatchObject({ left: 2, entered: 0 })
    expect(strict.body.fitCounts).toMatchObject({ margin: 0, out: 4 })
    const after = await ctx.prisma.listing.findUniqueOrThrow({
      where: { id: b.listing.id },
    })
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
    expect(after.criteriaFitLevel).toBe('out')
    const exit = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { listingId: b.listing.id, action: 'criteria.unmatched' },
    })
    expect(exit.after).toMatchObject({
      cause: 'criteria',
      criteriaName: 'Talence fictif',
    })
    expect(await ctx.prisma.notification.count()).toBe(notificationsBefore)
    const out = await list('?fit=out')
    expect(
      out.items.find(
        (i: { listing: { id: string } }) => i.listing.id === b.listing.id
      ).criteriaFit.origin
    ).toEqual({
      cause: 'criteria',
      trigger: null,
      criteriaName: 'Talence fictif',
    })

    // Chloé : les sorties dues au critère ne sont pas des nouveautés ; une
    // baisse de prix qui fait rentrer B l'est, et l'alerte.
    const alertsBefore = await ctx.prisma.notification.count({
      where: { type: 'criteria_matched', listingId: b.listing.id },
    })
    const prices = await api()
      .post(`/listings/${b.listing.id}/price-events`)
      .set(ctx.auth(richard))
      .send({ newPrice: 219_000, source: 'listing' })
      .expect(200)
    expect(prices.body.criteriaChanges.entered).toEqual([
      expect.objectContaining({ criteriaId: box.id, level: 'in' }),
    ])
    expect(
      await ctx.prisma.notification.count({
        where: { type: 'criteria_matched', listingId: b.listing.id },
      })
    ).toBe(alertsBefore + 1)
    // Une hausse fait sortir A : visible dans « ce qui a changé », sans alerte.
    const aAlerts = await ctx.prisma.notification.count({
      where: { listingId: a.listing.id },
    })
    await api()
      .post(`/listings/${a.listing.id}/price-events`)
      .set(ctx.auth(richard))
      .send({ newPrice: 300_000, source: 'listing' })
      .expect(200)
    const whatsNew = await api()
      .get('/whats-new')
      .set(ctx.auth(chloe))
      .expect(200)
    const kinds = whatsNew.body.items
      .filter((i: { listingId: string }) =>
        [a.listing.id, b.listing.id, c.listing.id].includes(i.listingId)
      )
      .map(
        (i: { kind: string; listingId: string }) =>
          `${i.kind}:${i.listingId === a.listing.id ? 'a' : i.listingId === b.listing.id ? 'b' : 'c'}`
      )
    expect(kinds).toContain('criteria_exit:a')
    expect(kinds).toContain('criteria_match:b')
    expect(kinds).not.toContain('criteria_exit:c')
    expect(
      await ctx.prisma.notification.count({
        where: { listingId: a.listing.id },
      })
    ).toBe(aAlerts)
  })

  it('le verdict : un changement d’hypothèses recalcule l’adéquation (sans alerte)', async () => {
    const created = await create(
      listing('T2 fictif rentable', [-0.6, 44.8], {
        price: 120_000,
        surface: 45,
        rooms: 2,
        rentalPlan: { targetRent: 1100 },
      })
    )
    expect(created.evaluation.metrics.verdict).toBe('target')
    const target = await criteria({
      name: 'Seulement la cible',
      filters: { verdicts: ['target'] },
    })
    expect(target.fitCounts).toMatchObject({ in: 1 })
    const result = await rpc(richard, 'set_assumptions', {
      values: { grossYieldThreshold: 0.3 },
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain(
      'Adéquation sur 1 annonce(s) : 0 entrée(s), 1 sortie(s)'
    )
    const read = await api()
      .get(`/listings/${created.listing.id}`)
      .set(ctx.auth(richard))
      .expect(200)
    expect(read.body.criteriaFit).toMatchObject({
      level: 'out',
      reasons: ['verdict hors cible (retenus : cible)'],
      origin: { cause: 'assumptions' },
    })
    expect(
      await ctx.prisma.notification.count({
        where: { type: 'criteria_matched' },
      })
    ).toBe(0)
  })

  it('MCP : filtre fit, adéquation dans les textes, compteurs et marge des critères, aperçu par niveau', async () => {
    const created = fenced<{
      criteria: { id: string; tolerance: { perimeterMeters: number } }
    }>(
      await rpc(richard, 'create_search_criteria', {
        name: 'Talence MCP',
        filters: { priceMax: 220_000 },
        perimeter: { type: 'polygon', polygon: BOX },
        tolerance: { perimeterMeters: 500 },
      })
    )
    expect(created.criteria.tolerance.perimeterMeters).toBe(500)
    await create(listing('Dedans', [-0.6, 44.8]))
    await create(listing('À la marge', [-0.6, 44.805], { price: 228_000 }))
    await create(listing('Hors', [-0.5, 44.8]))
    const main = await rpc(richard, 'list_listings', {})
    expect(main.content[0]?.text).toContain(
      'Adéquation (1 critère(s) actif(s)) : 1 dans les critères, 0 à confirmer, 1 à la marge, 1 hors critères.'
    )
    expect(main.content[0]?.text).toContain(
      'adéquation : À la marge (Prix +3,6 %'
    )
    expect(fenced<{ total: number }>(main).total).toBe(2)
    const outside = fenced<{ items: Array<{ listing: { title: string } }> }>(
      await rpc(richard, 'list_listings', { fit: ['out'] })
    )
    expect(outside.items.map(i => i.listing.title)).toEqual(['Hors'])
    const one = outside.items[0] as unknown as { listing: { id: string } }
    const detail = await rpc(richard, 'get_listing', {
      listingId: one.listing.id,
    })
    expect(detail.content[0]?.text).toContain(
      'Adéquation : Hors critères — « Talence MCP » : À '
    )
    expect(detail.content[0]?.text).toContain(
      '  - « Talence MCP » : Hors critères — À '
    )
    const listed = await rpc(richard, 'list_search_criteria', {})
    expect(listed.content[0]?.text).toContain(
      '2 annonce(s) (1 dans les critères, 0 à confirmer, 1 à la marge), 1 hors critères'
    )
    expect(listed.content[0]?.text).toContain(
      'Marges appliquées : périmètre 500 m, prix +5 %.'
    )
    const updated = await rpc(richard, 'update_search_criteria', {
      criteriaId: created.criteria.id,
      tolerance: { priceMaxShare: 0 },
    })
    expect(updated.content[0]?.text).toContain(
      '1 sortie(s) vers « hors critères »'
    )
    // L'aperçu REST par niveau, avant d'enregistrer.
    const preview = await api()
      .post('/search-criteria/preview')
      .set(ctx.auth(richard))
      .send({
        filters: { priceMax: 220_000 },
        perimeter: { type: 'polygon', polygon: BOX },
      })
      .expect(200)
    expect(preview.body.fitCounts).toEqual({
      in: 1,
      to_confirm: 0,
      margin: 1,
      out: 1,
    })
    expect(preview.body.examples[0]).toMatchObject({
      level: 'margin',
      title: 'À la marge',
    })
    expect(preview.body.listingCount).toBe(2)
  })

  it('export : l’adéquation en fin de ligne du CSV et dans le JSON', async () => {
    await criteria({
      name: 'Talence fictif',
      filters: { priceMax: 220_000 },
      perimeter: { type: 'polygon', polygon: BOX },
    })
    await create(listing('À la marge', [-0.6, 44.805], { price: 228_000 }))
    await create(listing('Hors', [-0.5, 44.8]))
    const csv = await api()
      .get('/export?format=csv')
      .set(ctx.auth(richard))
      .expect(200)
    const lines = csv.text.slice(1).trim().split('\r\n')
    const header = lines[0]?.split(';') ?? []
    // Après les colonnes du lot 15, en fin de ligne (puis celles des lots 18
    // et 20).
    expect(header.slice(-14)).toEqual([
      'Identifiant',
      'Vérifiée le',
      'Vue en ligne le',
      'Dernière vérification',
      'Adéquation',
      'Raisons de l’adéquation',
      'Vendeur',
      'Agence',
      'Référence',
      'Liens',
      'Note commune (/5)',
      'Désaccords',
      'Notes par critère',
      'Décision en attente',
    ])
    expect(lines).toHaveLength(3)
    expect(
      lines.some(l =>
        l.includes(';À la marge;« Talence fictif » : Prix +3,6 %')
      )
    ).toBe(true)
    expect(lines.some(l => l.includes(';Hors critères;'))).toBe(true)
    const doc = await api()
      .get('/export?format=json')
      .set(ctx.auth(richard))
      .expect(200)
    const body = JSON.parse(doc.text)
    expect(body.version).toBe(1)
    expect(
      body.listings
        .map((l: { criteriaFit: { level: string } }) => l.criteriaFit.level)
        .sort()
    ).toEqual(['margin', 'out'])
    expect(body.searchCriteria[0].tolerance.perimeterMeters).toBe(300)
  })
})
