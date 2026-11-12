/**
 * Lot 2 : extraction par IA (client Anthropic factice), géocodage serveur
 * (Géoplateforme factice, cache en base), doublons, provenance par champ et
 * tâches des champs manquants, sur un vrai PostGIS. Aucun réseau, aucune clé.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import request from 'supertest'
import { DEFAULT_TASKS } from '@apart/contracts'
import type { ExtractionResult } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'
import {
  SAMPLE_LISTING_TEXT,
  emptyExtraction,
  fakeParsedMessage,
  sampleExtraction,
} from './fixtures/ai-extraction'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const URL = 'https://agence-fictive.invalid/annonce/AGF-12345'

/** Une réponse Géoplateforme : la rue du Forum à Talence, au niveau demandé. */
function geoAnswer(type: 'housenumber' | 'street' | 'municipality') {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        features: [
          {
            geometry: { type: 'Point', coordinates: [-0.5906, 44.8083] },
            properties: {
              label:
                type === 'municipality'
                  ? 'Talence'
                  : 'Rue du Forum 33400 Talence',
              score: 0.9,
              type,
              city: 'Talence',
              citycode: '33522',
              id: type === 'municipality' ? '33522' : '33522_1234',
            },
          },
        ],
      }),
  }
}

describe('Extraction IA, géocodage, doublons (e2e)', () => {
  let ctx: E2eContext

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    ctx.ai.messages.parse.mockReset()
    ctx.geocoding.fetchImpl = vi.fn(() => Promise.resolve(geoAnswer('street')))
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
  })

  async function extract(
    body: object,
    status = 200
  ): Promise<ExtractionResult> {
    const res = await request(ctx.server)
      .post('/listings/extract')
      .set(ctx.auth(richard))
      .send(body)
      .expect(status)
    return res.body as ExtractionResult
  }

  describe('POST /listings/extract', () => {
    it('rend une fiche pré-remplie, provenance et confiance par champ, géocodée, avec champs manquants et coût journalisé', async () => {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction())
      )
      const result = await extract({ text: SAMPLE_LISTING_TEXT, url: URL })
      expect(result.persisted).toBe(false)
      const l = result.listing
      expect(l.title).toBe('T2 Talence Forum, 3e étage avec balcon')
      expect(l.price).toBe(189_000)
      expect(l.surface).toBe(45.2)
      expect(l.url).toBe(URL)
      expect(l.source).toBe('agence')
      expect(l.sourceText).toBe(SAMPLE_LISTING_TEXT)
      expect(l.fieldSources.price).toMatchObject({
        source: 'ai',
        confidence: 0.95,
        evidence: '189 000 € FAI',
      })
      expect(l.fieldSources.url?.source).toBe('listing')
      // Géocodée par la Géoplateforme factice : point, précision rue, INSEE.
      expect(result.geocoded).toBe(true)
      expect(l.location.point).toEqual({
        type: 'Point',
        coordinates: [-0.5906, 44.8083],
      })
      expect(l.location.precision).toBe('street')
      expect(l.location.inseeCode).toBe('33522')
      expect(l.location.addressNormalized).toBe('Rue du Forum 33400 Talence')
      expect(l.fieldSources.point?.source).toBe('open_data')
      expect(l.fieldSources.addressRaw?.source).toBe('ai')
      expect(result.missingFields.map(m => m.field)).toEqual([
        'rentalPlan.targetRent',
      ])
      expect(result.duplicates).toEqual([])
      expect(result.warnings).toContain(
        'Charges indiquées par mois (110 €) : converties en annuel.'
      )
      expect(result.usage).toMatchObject({
        model: 'claude-opus-5-5',
        inputTokens: 3200,
        outputTokens: 1400,
        estimatedCostUsd: 0.0453,
      })
      const logs = await ctx.prisma.activityLog.findMany({
        where: { action: 'ai.extraction' },
      })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.listingId).toBeNull()
      expect(logs[0]?.after).toMatchObject({
        model: 'claude-opus-5-5',
        estimatedCostUsd: 0.0453,
        textChars: SAMPLE_LISTING_TEXT.length,
        imageCount: 0,
        geocoded: true,
      })
      // Le modèle a reçu le texte encadré et l'invite système mise en cache.
      const params = ctx.ai.messages.parse.mock.calls[0]?.[0] as {
        model: string
        system: Array<{ cache_control: unknown }>
        messages: Array<{ content: Array<{ type: string; text?: string }> }>
      }
      expect(params.model).toBe('claude-opus-5-5')
      expect(params.system[0]?.cache_control).toEqual({ type: 'ephemeral' })
      expect(params.messages[0]?.content[0]?.text).toContain('<annonce_source')
    })

    it('signale un doublon probable déjà dans l’espace (même lien, même adresse)', async () => {
      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({
          title: 'Déjà vue',
          price: 185_000,
          surface: 45,
          url: 'https://www.agence-fictive.invalid/annonce/AGF-12345/?utm_source=mail',
          location: { addressRaw: 'rue du Forum', commune: 'Talence' },
        })
        .expect(201)
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction())
      )
      const result = await extract({ text: SAMPLE_LISTING_TEXT, url: URL })
      expect(result.duplicates).toHaveLength(1)
      expect(result.duplicates[0]).toMatchObject({
        title: 'Déjà vue',
        status: 'to_study',
        score: 1,
      })
      // ADR 0041 : « rue du Forum » sans numéro n'est pas une adresse, et
      // deux repères à la rue ne sont pas voisins.
      expect(result.duplicates[0]?.reasons.map(r => r.kind)).toEqual([
        'same_url',
        'same_commune_price_surface',
      ])
    })

    it('une lecture vide donne une fiche de repli et tous les champs manquants', async () => {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(emptyExtraction())
      )
      const result = await extract({ text: 'Appartement à vendre' })
      expect(result.listing.title).toBe('Appartement')
      expect(result.listing.price).toBe(0)
      expect(result.geocoded).toBe(false)
      expect(result.missingFields).toHaveLength(8)
      expect(result.warnings).toContain(
        "Prix non trouvé dans l'annonce : à saisir."
      )
      expect(ctx.geocoding.fetchImpl).not.toHaveBeenCalled()
    })

    it('accepte des captures et les passe au modèle en blocs image', async () => {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction(), { model: 'claude-haiku-5-5' })
      )
      const png = Buffer.from('capture-fictive').toString('base64')
      const result = await extract({
        images: [
          { mediaType: 'image/png', data: png },
          { mediaType: 'image/jpeg', data: png },
        ],
        quality: 'fast',
      })
      expect(result.usage.model).toBe('claude-haiku-5-5')
      const params = ctx.ai.messages.parse.mock.calls[0]?.[0] as {
        model: string
        messages: Array<{ content: Array<{ type: string }> }>
      }
      expect(params.model).toBe('claude-haiku-5-5')
      expect(params.messages[0]?.content.map(b => b.type)).toEqual([
        'image',
        'image',
        'text',
      ])
    })

    it('refuse une demande vide, un base64 invalide ou trop de captures', async () => {
      const empty = await request(ctx.server)
        .post('/listings/extract')
        .set(ctx.auth(richard))
        .send({})
        .expect(400)
      expect(JSON.stringify(empty.body)).toContain('texte')
      await request(ctx.server)
        .post('/listings/extract')
        .set(ctx.auth(richard))
        .send({
          images: [
            { mediaType: 'image/png', data: 'data:image/png;base64,QQ==' },
          ],
        })
        .expect(400)
      const png = Buffer.from('x').toString('base64')
      const tooMany = await request(ctx.server)
        .post('/listings/extract')
        .set(ctx.auth(richard))
        .send({
          images: Array.from({ length: 5 }, () => ({
            mediaType: 'image/png',
            data: png,
          })),
        })
        .expect(400)
      expect(tooMany.body.message).toContain('AI_MAX_IMAGES')
      expect(ctx.ai.messages.parse).not.toHaveBeenCalled()
    })

    it('un refus du modèle (après repli) répond 422, une réponse tronquée 502', async () => {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(null, {
          stopReason: 'refusal',
          refusalCategory: 'cyber',
        })
      )
      const refused = await request(ctx.server)
        .post('/listings/extract')
        .set(ctx.auth(richard))
        .send({ text: 'x' })
        .expect(422)
      expect(refused.body.message).toContain('refusé')
      expect(ctx.ai.messages.parse).toHaveBeenCalledTimes(2)
      ctx.ai.messages.parse.mockReset()
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction(), { stopReason: 'max_tokens' })
      )
      await request(ctx.server)
        .post('/listings/extract')
        .set(ctx.auth(richard))
        .send({ text: 'x' })
        .expect(502)
      await request(ctx.server)
        .post('/listings/extract')
        .send({ text: 'x' })
        .expect(401)
    })
  })

  describe('POST /listings depuis une fiche extraite', () => {
    async function extractedListing(): Promise<ExtractionResult['listing']> {
      ctx.ai.messages.parse.mockResolvedValue(
        fakeParsedMessage(sampleExtraction())
      )
      return (await extract({ text: SAMPLE_LISTING_TEXT, url: URL })).listing
    }

    it('conserve la provenance IA, passe en « user » les champs corrigés, pose les tâches des champs manquants sans doublonner la checklist', async () => {
      const listing = await extractedListing()
      // Richard corrige le prix et ajoute le loyer visé : plus de provenance IA sur le prix.
      const { price: _price, ...fieldSources } = listing.fieldSources
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          ...listing,
          price: 185_000,
          propertyTax: null,
          fieldSources,
        })
        .expect(201)
      const saved = res.body.listing
      expect(saved.price).toBe(185_000)
      expect(saved.fieldSources.price.source).toBe('user')
      expect(saved.fieldSources.surface).toMatchObject({
        source: 'ai',
        confidence: 0.95,
        evidence: '45,2 m² loi Carrez',
      })
      expect(saved.fieldSources.point.source).toBe('open_data')
      expect(saved.location.point).toEqual({
        type: 'Point',
        coordinates: [-0.5906, 44.8083],
      })
      expect(saved.sourceText ?? null).toBeNull()
      expect(res.body.duplicates).toEqual([])
      // Taxe foncière manquante : déjà dans la checklist par défaut, pas de doublon ;
      // loyer visé manquant : une tâche « missing_field ».
      expect(
        res.body.createdTasks.map((t: { label: string }) => t.label)
      ).toEqual(['Fixer le loyer visé (phase 2) à partir du marché locatif'])
      const tasks = await ctx.prisma.task.findMany({
        where: { listingId: saved.id },
        orderBy: { position: 'asc' },
      })
      expect(tasks).toHaveLength(DEFAULT_TASKS.length + 1)
      expect(tasks.at(-1)?.origin).toBe('missing_field')
      expect(tasks.at(-1)?.position).toBe(DEFAULT_TASKS.length)
      const log = await ctx.prisma.activityLog.findFirst({
        where: { listingId: saved.id, action: 'listing.created' },
      })
      expect(log?.after).toMatchObject({
        provenance: 'user',
        ignoreDuplicates: false,
        duplicates: [],
        missingFieldTasks: [
          'Fixer le loyer visé (phase 2) à partir du marché locatif',
        ],
      })
      // Le texte source est conservé en base, pas exposé dans la fiche.
      const row = await ctx.prisma.listing.findUnique({
        where: { id: saved.id },
      })
      expect(row?.sourceText).toBe(SAMPLE_LISTING_TEXT)
    })

    it('signale les doublons, refuse la même annonce (lien, agence et référence) et journalise « créer quand même »', async () => {
      const listing = await extractedListing()
      const first = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send(listing)
        .expect(201)
      expect(first.body.duplicates).toEqual([])
      // Lot 18 : un lien n'est que sur une fiche, même « créer quand même ».
      const sameLink = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ ...listing, title: 'Revue par Chloé', ignoreDuplicates: true })
        .expect(409)
      expect(sameLink.body.message).toContain(
        `Ce lien est déjà celui de l’annonce « ${listing.title} »`
      )
      // Même agence et même référence : la même annonce, proposée en lien.
      const sameReference = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({ ...listing, url: null, title: 'Revue par Chloé' })
        .expect(409)
      expect(sameReference.body.message).toContain(
        'Même agence et même référence'
      )
      expect(sameReference.body.message).toContain('add_listing_link')
      const second = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({
          ...listing,
          url: null,
          title: 'Revue par Chloé',
          ignoreDuplicates: true,
        })
        .expect(201)
      expect(second.body.duplicates).toHaveLength(1)
      expect(second.body.duplicates[0]).toMatchObject({
        listingId: first.body.listing.id,
        title: listing.title,
        score: 1,
        certain: true,
        sellerReference: 'AGF-12345',
      })
      expect(
        second.body.duplicates[0].reasons.map((r: { kind: string }) => r.kind)
      ).toContain('same_reference')
      const log = await ctx.prisma.activityLog.findFirst({
        where: { listingId: second.body.listing.id, action: 'listing.created' },
      })
      expect(log?.after).toMatchObject({
        ignoreDuplicates: true,
        duplicates: [first.body.listing.id],
      })
      const count = await ctx.prisma.listing.count()
      expect(count).toBe(2)
    })

    it('une saisie manuelle ne reçoit pas de tâche de champ manquant', async () => {
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({ title: 'Saisie à la main', price: 150_000 })
        .expect(201)
      expect(res.body.createdTasks).toEqual([])
      const tasks = await ctx.prisma.task.count({
        where: { listingId: res.body.listing.id },
      })
      expect(tasks).toBe(DEFAULT_TASKS.length)
    })
  })

  describe('géocodage serveur', () => {
    it('géocode à la création sans point, met en cache en base, et ne rappelle pas la Géoplateforme pour la même adresse', async () => {
      ctx.geocoding.fetchImpl = vi.fn(() =>
        Promise.resolve(geoAnswer('housenumber'))
      )
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: 'Géocodée',
          price: 150_000,
          location: { addressRaw: '12 rue du Forum', commune: 'Talence' },
        })
        .expect(201)
      expect(res.body.listing.location.point).toEqual({
        type: 'Point',
        coordinates: [-0.5906, 44.8083],
      })
      expect(res.body.listing.location.precision).toBe('exact')
      expect(res.body.listing.location.banId).toBe('33522_1234')
      expect(res.body.listing.location.inseeCode).toBe('33522')
      expect(res.body.listing.fieldSources.point.source).toBe('open_data')
      expect(res.body.listing.fieldSources.addressRaw.source).toBe('user')
      const [row] = await ctx.db.query<{ wkt: string }>(
        `SELECT ST_AsText("geom"::geometry) AS wkt FROM "app"."listings" WHERE "id" = $1`,
        [res.body.listing.id]
      )
      expect(row?.wkt).toBe('POINT(-0.5906 44.8083)')
      const cache = await ctx.prisma.referenceData.findMany({
        where: { kind: 'geocode' },
      })
      expect(cache.map(c => c.key)).toEqual([
        'address:12 rue du forum, talence',
      ])
      expect(ctx.geocoding.fetchImpl).toHaveBeenCalledTimes(1)

      await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(chloe))
        .send({
          title: 'Même adresse',
          price: 160_000,
          location: { addressRaw: '12 RUE du Forum', commune: 'Talence' },
          // ADR 0041 : la même adresse est un doublon probable qui bloque.
          ignoreDuplicates: true,
        })
        .expect(201)
      expect(ctx.geocoding.fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('retombe sur le centroïde de la commune, et sans résultat laisse l’annonce sans point', async () => {
      ctx.geocoding.fetchImpl = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ features: [] }),
        })
        .mockResolvedValueOnce(geoAnswer('municipality'))
      const res = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: 'Commune seule',
          price: 150_000,
          location: { addressRaw: 'quelque part', commune: 'Talence' },
        })
        .expect(201)
      expect(res.body.listing.location.precision).toBe('commune')
      expect(res.body.listing.location.addressNormalized).toBeNull()
      expect(res.body.listing.location.inseeCode).toBe('33522')

      ctx.geocoding.fetchImpl = vi.fn(() => Promise.reject(new Error('panne')))
      const noPoint = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: 'Sans point',
          price: 150_000,
          location: { commune: 'Pessac' },
        })
        .expect(201)
      expect(noPoint.body.listing.location.point).toBeNull()
    })

    it('un point fourni n’est jamais écrasé (l’adresse ne donne que l’INSEE et, près du point, le BAN) ; un changement d’adresse relance le géocodage, pas une autre modification', async () => {
      const spy = vi.fn(() => Promise.resolve(geoAnswer('housenumber')))
      ctx.geocoding.fetchImpl = spy
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: 'Point donné',
          price: 150_000,
          location: {
            addressRaw: '1 rue Ailleurs',
            commune: 'Talence',
            point: { type: 'Point', coordinates: [-0.6, 44.81] },
            precision: 'exact',
          },
        })
        .expect(201)
      // ADR 0040 : l'adresse est géocodée, le point reste ; le géocodeur
      // répond à ~800 m du point, donc ni BAN ni adresse normalisée.
      expect(spy).toHaveBeenCalledTimes(1)
      expect(created.body.listing.location.point.coordinates).toEqual([
        -0.6, 44.81,
      ])
      expect(created.body.listing.location.placement.method).toBe('manual')
      expect(created.body.listing.location.banId).toBeNull()
      const id = created.body.listing.id as string

      await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({ price: 149_000 })
        .expect(200)
      expect(spy).toHaveBeenCalledTimes(1)

      const moved = await request(ctx.server)
        .patch(`/listings/${id}`)
        .set(ctx.auth(richard))
        .send({
          location: {
            addressRaw: '12 rue du Forum',
            commune: 'Talence',
            point: null,
            precision: null,
          },
        })
        .expect(200)
      expect(spy).toHaveBeenCalledTimes(2)
      expect(moved.body.listing.location.point).toEqual({
        type: 'Point',
        coordinates: [-0.5906, 44.8083],
      })
      expect(moved.body.listing.location.precision).toBe('exact')
      expect(moved.body.listing.fieldSources.point.source).toBe('open_data')
      expect(moved.body.listing.fieldSources.addressRaw.source).toBe('user')
    })
  })

  describe('POST /listings/duplicates', () => {
    it('cherche par lien, adresse, trio commune + prix + surface, ou annonce enregistrée', async () => {
      const created = await request(ctx.server)
        .post('/listings')
        .set(ctx.auth(richard))
        .send({
          title: 'Référence',
          price: 200_000,
          surface: 50,
          url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/12345?x=1',
          location: {
            addressRaw: '5 avenue de la Libération',
            commune: 'Talence',
          },
        })
        .expect(201)
      const id = created.body.listing.id as string

      const byUrl = await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({
          url: 'https://leboncoin.fr/ad/ventes_immobilieres/12345?x=1&utm_source=a',
        })
        .expect(200)
      expect(byUrl.body).toHaveLength(1)
      expect(byUrl.body[0].reasons[0].kind).toBe('same_url')

      const byAddress = await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({ address: '5 av. Libération, 33400 Talence' })
        .expect(200)
      expect(byAddress.body[0]?.reasons[0].kind).toBe('same_address')

      const byTrio = await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({ commune: 'talence', price: 195_000, surface: 51 })
        .expect(200)
      expect(byTrio.body[0]?.reasons[0].kind).toBe('same_commune_price_surface')

      const none = await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({ commune: 'Pessac', price: 195_000, surface: 51 })
        .expect(200)
      expect(none.body).toEqual([])

      const self = await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({ listingId: id })
        .expect(200)
      expect(self.body).toEqual([])

      await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({ commune: 'Talence' })
        .expect(400)
      await request(ctx.server)
        .post('/listings/duplicates')
        .set(ctx.auth(richard))
        .send({ listingId: '99999999-9999-4999-8999-999999999999' })
        .expect(404)
    })
  })
})

describe('Sans clé Anthropic (e2e)', () => {
  let ctx: E2eContext

  beforeAll(async () => {
    ctx = await createE2eApp([richard], { ai: false })
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('l’extraction répond 503 « IA non configurée », le reste fonctionne', async () => {
    const res = await request(ctx.server)
      .post('/listings/extract')
      .set(ctx.auth(richard))
      .send({ text: 'T2 Talence 189 000 €' })
      .expect(503)
    expect(res.body.message).toContain('IA non configurée')
    expect(res.body.message).toContain('ANTHROPIC_API_KEY')
    await request(ctx.server).get('/health').expect(200)
    const created = await request(ctx.server)
      .post('/listings')
      .set(ctx.auth(richard))
      .send({ title: 'Sans IA', price: 100_000 })
      .expect(201)
    expect(created.body.duplicates).toEqual([])
  })
})
