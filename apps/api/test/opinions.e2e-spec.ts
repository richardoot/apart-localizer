/**
 * Lot 20 : nos avis, critère par critère, sur un vrai PostGIS par le REST.
 * Notes par critère fusionnées (seules les clés données changent, null
 * efface), bornes et clés refusées, garde-fou optimiste ; avis à l'aveugle
 * appliqué côté serveur partout où un avis peut sortir (fiche, liste,
 * avis, comparaison, journal, « ce qui a changé », export JSON et CSV) ;
 * « Voir quand même » et la mention « après avoir vu » ; « après visite » ;
 * réglages des critères réservés aux propriétaires (dix au plus, masqué,
 * renommé, retiré) ; journal, notifications, filtres et tris de la liste ;
 * tâche de contre-visite. Données fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ExportDocumentSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

const LISTING = {
  title: '[Exemple] T3 68 m², balcon sud',
  price: 214_000,
  surface: 68,
  rooms: 3,
  dpeClass: 'C',
  location: { commune: 'Bordeaux', district: 'Caudéran' },
  rentalPlan: { targetRent: 900 },
}

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? ''

describe('Lot 20 : nos avis critère par critère (e2e, REST)', () => {
  let ctx: E2eContext
  let id: string
  let richardId: string
  let chloeId: string
  const api = () => request(ctx.server)
  const get = (who: E2eIdentity, path: string) =>
    api().get(path).set(ctx.auth(who))
  const put = (who: E2eIdentity, path: string, body: unknown) =>
    api()
      .put(path)
      .set(ctx.auth(who))
      .send(body as object)
  const post = (who: E2eIdentity, path: string, body?: unknown) =>
    api()
      .post(path)
      .set(ctx.auth(who))
      .send((body ?? {}) as object)
  const patch = (who: E2eIdentity, path: string, body: unknown) =>
    api()
      .patch(path)
      .set(ctx.auth(who))
      .send(body as object)
  const mine = (who: E2eIdentity, body: unknown, listingId = id) =>
    put(who, `/listings/${listingId}/opinions/me`, body)

  beforeAll(async () => {
    ctx = await createE2eApp([richard, chloe])
  })

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await ctx.db.truncateAll()
    const workspace = await ctx.prisma.workspace.create({
      data: {
        name: '[Exemple] Bordeaux',
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
      include: { members: true },
    })
    richardId = workspace.members.find(m => m.handle === 'richard')?.id ?? ''
    chloeId = workspace.members.find(m => m.handle === 'chloe')?.id ?? ''
    const res = await post(richard, '/listings', LISTING).expect(201)
    id = res.body.listing.id
  })

  it('notes par critère : fusion, effacement, mot gardé, bornes et clés refusées, garde-fou', async () => {
    const first = await mine(richard, {
      rating: 4,
      text: 'Lumineux, balcon agréable',
      scores: {
        luminosity: { score: 5 },
        quiet: { score: 4, word: 'fenêtres fermées, ça va' },
        condition: { score: 3 },
      },
      expectedUpdatedAt: null,
    }).expect(200)
    expect(first.body.scores.map((s: { key: string }) => s.key).sort()).toEqual(
      ['condition', 'luminosity', 'quiet']
    )
    expect(first.body.ratedAt).not.toBeNull()

    // Seules les clés données changent ; le mot du calme reste ; null efface.
    const second = await mine(richard, {
      rating: 4,
      text: 'Lumineux, balcon agréable',
      scores: { quiet: { score: 3 }, condition: null, feel: { score: 4 } },
      expectedUpdatedAt: first.body.updatedAt,
    }).expect(200)
    const byKey = Object.fromEntries(
      second.body.scores.map(
        (s: { key: string; score: number; word: string }) => [s.key, s]
      )
    )
    expect(Object.keys(byKey).sort()).toEqual(['feel', 'luminosity', 'quiet'])
    expect(byKey.quiet).toMatchObject({
      score: 3,
      word: 'fenêtres fermées, ça va',
    })
    expect(second.body.ratedAt).toBe(first.body.ratedAt)
    // Un mot effacé par null ; une note effacée garde un mot seul.
    const third = await mine(richard, {
      rating: 4,
      text: 'Lumineux, balcon agréable',
      scores: {
        quiet: { score: null, word: 'à revoir le soir' },
        luminosity: { score: 5, word: null },
      },
    }).expect(200)
    expect(
      third.body.scores.find((s: { key: string }) => s.key === 'quiet')
    ).toMatchObject({ score: null, word: 'à revoir le soir' })

    // Garde-fou : une lecture périmée est refusée.
    await mine(richard, {
      rating: 5,
      expectedUpdatedAt: first.body.updatedAt,
    }).expect(409)
    await mine(chloe, {
      rating: 3,
      expectedUpdatedAt: first.body.updatedAt,
    }).expect(409)
    // Bornes et clés : 0, 6, une clé mal formée, inconnue, une propriété en trop.
    await mine(richard, { rating: 4, scores: { quiet: { score: 0 } } }).expect(
      400
    )
    await mine(richard, { rating: 4, scores: { quiet: { score: 6 } } }).expect(
      400
    )
    await mine(richard, { rating: 4, scores: { Quiet: { score: 3 } } }).expect(
      400
    )
    const unknown = await mine(richard, {
      rating: 4,
      scores: { kitchen: { score: 3 } },
    }).expect(400)
    expect(unknown.body.message).toContain('Critère inconnu')
    await mine(richard, {
      rating: 4,
      scores: { quiet: { score: 3, extra: 1 } },
    }).expect(400)
    // La base refuse aussi une note hors bornes.
    await expect(
      ctx.db.query(
        `UPDATE app.opinion_scores SET score = 0 WHERE criterion_key = 'feel'`
      )
    ).rejects.toThrow(/opinion_scores_score_range/)

    // Une écriture qui ne change rien n'entre pas au journal.
    const before = await ctx.prisma.activityLog.count({
      where: { action: { startsWith: 'opinion.' } },
    })
    await mine(richard, {
      rating: 4,
      text: 'Lumineux, balcon agréable',
      scores: {},
    }).expect(200)
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: { startsWith: 'opinion.' } },
      })
    ).toBe(before)
  })

  it('à l’aveugle, côté serveur : un membre qui n’a pas noté ne reçoit pas les notes de l’autre', async () => {
    await mine(chloe, {
      rating: 3,
      text: 'Belle lumière mais trop de bruit côté chambre',
      scores: {
        luminosity: { score: 4, word: 'chambre 2 un peu sombre' },
        quiet: { score: 2, word: 'bus devant la chambre' },
      },
    }).expect(200)
    const secret = /bus devant|trop de bruit|chambre 2/

    const detail = await get(richard, `/listings/${id}`).expect(200)
    expect(detail.body.opinions).toEqual([])
    const masked = detail.body.opinionSummary.members.find(
      (m: { memberId: string }) => m.memberId === chloeId
    )
    expect(masked).toMatchObject({
      state: 'masked',
      rating: null,
      average: null,
      ratedCount: 2,
    })
    expect(detail.body.opinionSummary.status).toBe('pending')
    expect(detail.body.opinionSummary.masked).toBe(true)
    expect(JSON.stringify(detail.body)).not.toMatch(secret)

    const list = await get(richard, '/listings').expect(200)
    expect(JSON.stringify(list.body)).not.toMatch(secret)
    expect(
      (await get(richard, `/listings/${id}/opinions`).expect(200)).body
    ).toEqual([])
    const other = await post(richard, '/listings', {
      ...LISTING,
      title: '[Exemple] T2 Saint-Augustin',
    }).expect(201)
    const compare = await post(richard, '/listings/compare', {
      listingIds: [id, other.body.listing.id],
    }).expect(200)
    expect(JSON.stringify(compare.body)).not.toMatch(secret)

    // Le journal et « ce qui a changé » : qui, combien, pas les notes.
    const journal = await get(richard, `/listings/${id}/activity`).expect(200)
    const entry = journal.body.items.find(
      (e: { action: string }) => e.action === 'opinion.created'
    )
    expect(entry.summary).toBe(
      'a donné son avis : 2 critères notés (masqué tant que tu n’as pas noté).'
    )
    expect(entry.changes).toEqual([])
    expect(JSON.stringify(journal.body)).not.toMatch(/3\/5|bof|bus/)
    const whatsNew = await get(
      richard,
      '/whats-new?since=2020-01-01T00:00:00.000Z'
    ).expect(200)
    expect(JSON.stringify(whatsNew.body)).not.toMatch(/3\/5|bus devant/)

    // L'export : la même règle pour celui qui exporte.
    const json = await get(richard, '/export?format=json').expect(200)
    const doc = ExportDocumentSchema.parse(JSON.parse(json.text))
    expect(doc.listings.find(l => l.listing.id === id)?.opinions).toEqual([])
    expect(json.text).not.toMatch(secret)
    expect(doc.opinionCriteria).toHaveLength(8)
    expect(doc.opinionSettings).toEqual({ blind: true })
    const csv = await get(richard, '/export?format=csv').expect(200)
    expect(csv.text).not.toMatch(/Chloé 2|bus devant/)
    expect(csv.text).toContain(';en attente;')

    // Chloé, elle, lit son avis.
    const own = await get(chloe, `/listings/${id}`).expect(200)
    expect(own.body.opinions).toHaveLength(1)
    expect(own.body.opinions[0].scores).toHaveLength(2)

    // Richard note : il voit tout, désaccord compris.
    await mine(richard, {
      rating: 4,
      scores: { luminosity: { score: 5 }, quiet: { score: 4 } },
    }).expect(200)
    const seen = await get(richard, `/listings/${id}`).expect(200)
    expect(seen.body.opinions).toHaveLength(2)
    expect(seen.body.opinionSummary).toMatchObject({
      status: 'ready',
      disagreementKeys: ['quiet'],
      masked: false,
    })
    expect(seen.body.opinionSummary.commonScore).toBeCloseTo(3.75, 5)
    expect(seen.body.opinionSummary.sentence).toBe(
      'D’accord sur 1 critère. Désaccord sur le calme (Richard 4, Chloé 2).'
    )
    // Son journal est désormais lisible en entier.
    const after = await get(richard, `/listings/${id}/activity?kind=opinion`)
    const created = after.body.items.find(
      (e: { action: string; actor: { id: string } }) =>
        e.action === 'opinion.created' && e.actor.id === chloeId
    )
    expect(created.summary).toBe('a donné son avis : 3/5, 2 critères.')
    const richards = after.body.items.find(
      (e: { action: string; actor: { id: string } }) =>
        e.action === 'opinion.created' && e.actor.id === richardId
    )
    expect(richards.summary).toBe(
      'a donné son avis : 4/5, 2 critères. Un désaccord avec Chloé : calme.'
    )
  })

  it('« Voir quand même » : enregistré, puis « après avoir vu celui de Chloé »', async () => {
    await mine(chloe, { rating: 3, scores: { quiet: { score: 2 } } }).expect(
      200
    )
    const reveal = await post(
      richard,
      `/listings/${id}/opinions/reveal`
    ).expect(200)
    expect(reveal.body).toMatchObject({ listingId: id, memberIds: [chloeId] })
    const detail = await get(richard, `/listings/${id}`).expect(200)
    expect(detail.body.opinions).toHaveLength(1)
    expect(detail.body.opinionSummary.revealed).toBe(true)
    // Deux fois : la même trace, une seule ligne au journal.
    await post(richard, `/listings/${id}/opinions/reveal`).expect(200)
    expect(
      await ctx.prisma.activityLog.count({
        where: { action: 'opinion.revealed' },
      })
    ).toBe(1)

    const rated = await mine(richard, {
      rating: 4,
      scores: { quiet: { score: 4 } },
    }).expect(200)
    expect(rated.body.seenBefore).toEqual([chloeId])
    const summary = (await get(chloe, `/listings/${id}`).expect(200)).body
      .opinionSummary
    expect(
      summary.members.find(
        (m: { memberId: string }) => m.memberId === richardId
      ).seenBefore
    ).toEqual(['Chloé'])
    const journal = await get(chloe, `/listings/${id}/activity`).expect(200)
    const summaries = journal.body.items.map(
      (e: { summary: string }) => e.summary
    )
    expect(summaries).toContain('a affiché l’avis de Chloé avant de noter')
    expect(summaries).toContain(
      'a donné son avis après avoir vu celui de Chloé : 4/5, 1 critère. Un désaccord avec Chloé : calme.'
    )
    // Déjà noté : plus rien à révéler.
    await post(richard, `/listings/${id}/opinions/reveal`).expect(409)
  })

  it('« après visite » : la visite faite avec le membre avant son avis', async () => {
    await post(richard, `/listings/${id}/visits`, {
      visitedAt: '2026-11-01T10:00:00.000Z',
      status: 'done',
      participantIds: [richardId],
    }).expect(201)
    const rated = await mine(richard, {
      rating: 4,
      scores: { quiet: { score: 4 } },
    }).expect(200)
    expect(rated.body.afterVisit?.visitedAt).toBe('2026-11-01T10:00:00.000Z')
    const chloes = await mine(chloe, {
      rating: 3,
      scores: { quiet: { score: 3 } },
    }).expect(200)
    expect(chloes.body.afterVisit).toBeNull()
    const journal = await get(chloe, `/listings/${id}/activity`).expect(200)
    expect(
      journal.body.items.map((e: { summary: string }) => e.summary)
    ).toContain('a donné son avis après la visite : 4/5, 1 critère.')
  })

  it('les réglages des critères : propriétaires seulement, dix au plus, renommer, masquer, retirer', async () => {
    const defaults = await get(chloe, '/workspace/opinion-criteria').expect(200)
    expect(defaults.body.criteria.map((c: { key: string }) => c.key)).toEqual([
      'luminosity',
      'layout',
      'condition',
      'quiet',
      'outdoor',
      'building',
      'street',
      'feel',
    ])
    expect(defaults.body).toMatchObject({
      blind: true,
      max: 10,
      disagreementGap: 2,
      canEdit: false,
    })
    // Un membre non propriétaire ne règle rien.
    await post(chloe, '/workspace/opinion-criteria', {
      label: 'Cuisine',
    }).expect(403)
    await patch(chloe, '/workspace/opinion-criteria/quiet', {
      hidden: true,
    }).expect(403)
    await patch(chloe, '/workspace/opinion-settings', { blind: false }).expect(
      403
    )
    expect(await ctx.prisma.opinionCriterion.count()).toBe(0)

    // Des notes avant tout réglage : sur les clés par défaut.
    await mine(chloe, { rating: 3, scores: { quiet: { score: 2 } } }).expect(
      200
    )
    await mine(richard, { rating: 4, scores: { quiet: { score: 4 } } }).expect(
      200
    )

    const added = await post(richard, '/workspace/opinion-criteria', {
      label: 'Cuisine',
      hint: 'équipée, refaite, à revoir',
    }).expect(201)
    expect(added.body.canEdit).toBe(true)
    expect(added.body.criteria).toHaveLength(9)
    expect(added.body.criteria.at(-1)).toMatchObject({
      key: 'custom_cuisine',
      origin: 'custom',
      removable: true,
      position: 8,
    })
    expect(await ctx.prisma.opinionCriterion.count()).toBe(9)
    await post(richard, '/workspace/opinion-criteria', {
      label: 'cuisine',
    }).expect(409)

    // Renommer garde les notes.
    const renamed = await patch(richard, '/workspace/opinion-criteria/quiet', {
      label: 'Calme et bruit',
    }).expect(200)
    expect(
      renamed.body.criteria.find((c: { key: string }) => c.key === 'quiet')
    ).toMatchObject({
      label: 'Calme et bruit',
      scoreCount: 2,
      removable: false,
    })
    const detail = await get(richard, `/listings/${id}`).expect(200)
    expect(
      detail.body.opinionSummary.rows.find(
        (r: { key: string }) => r.key === 'quiet'
      )
    ).toMatchObject({ label: 'Calme et bruit', gap: 2 })
    expect(detail.body.opinionSummary.sentence).toContain('« Calme et bruit »')

    // Masquer : hors des fiches et des calculs, les notes restent en base.
    await patch(richard, '/workspace/opinion-criteria/quiet', {
      hidden: true,
    }).expect(200)
    const hidden = await get(richard, `/listings/${id}`).expect(200)
    expect(
      hidden.body.opinionSummary.rows.map((r: { key: string }) => r.key)
    ).not.toContain('quiet')
    expect(hidden.body.opinionSummary.disagreementKeys).toEqual([])
    expect(
      await ctx.prisma.opinionScore.count({ where: { criterionKey: 'quiet' } })
    ).toBe(2)
    const refused = await mine(richard, {
      rating: 4,
      scores: { quiet: { score: 5 } },
    }).expect(400)
    expect(refused.body.message).toContain('masqué')
    // L'export garde toutes les notes, critère masqué compris.
    const doc = ExportDocumentSchema.parse(
      JSON.parse((await get(richard, '/export?format=json')).text)
    )
    expect(
      doc.listings[0]?.opinions.flatMap(o => o.scores.map(s => s.key))
    ).toEqual(['quiet', 'quiet'])
    expect(doc.opinionCriteria.find(c => c.key === 'quiet')?.hidden).toBe(true)
    await patch(richard, '/workspace/opinion-criteria/quiet', {
      hidden: false,
    }).expect(200)

    // Ordre : toutes les clés, chacune une fois.
    const keys = renamed.body.criteria.map((c: { key: string }) => c.key)
    const order = [...keys].reverse()
    const reordered = await put(richard, '/workspace/opinion-criteria/order', {
      keys: order,
    }).expect(200)
    expect(reordered.body.criteria.map((c: { key: string }) => c.key)).toEqual(
      order
    )
    await put(richard, '/workspace/opinion-criteria/order', {
      keys: order.slice(1),
    }).expect(400)

    // Retirer : jamais un défaut, jamais un critère noté ; un ajout jamais noté, oui.
    await api()
      .delete('/workspace/opinion-criteria/quiet')
      .set(ctx.auth(richard))
      .expect(409)
    const removed = await api()
      .delete('/workspace/opinion-criteria/custom_cuisine')
      .set(ctx.auth(richard))
      .expect(200)
    expect(removed.body.criteria).toHaveLength(8)
    expect(
      removed.body.criteria.map((c: { position: number }) => c.position)
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    await post(richard, '/workspace/opinion-criteria', {
      label: 'Cuisine',
    }).expect(201)
    await mine(richard, {
      rating: 4,
      scores: { custom_cuisine: { score: 2 } },
    }).expect(200)
    await api()
      .delete('/workspace/opinion-criteria/custom_cuisine')
      .set(ctx.auth(richard))
      .expect(409)

    // Dix au plus, masqués compris.
    await post(richard, '/workspace/opinion-criteria', {
      label: 'Cave',
    }).expect(201)
    const full = await post(richard, '/workspace/opinion-criteria', {
      label: 'Parking',
    }).expect(409)
    expect(full.body.message).toContain('10 critères au plus')

    // Chaque changement entre au journal de l'espace.
    const journal = await get(
      richard,
      '/activity?kind=opinion&limit=200'
    ).expect(200)
    const settings = journal.body.items
      .filter((e: { action: string }) =>
        e.action.startsWith('opinion_settings.')
      )
      .map((e: { summary: string }) => e.summary)
    expect(settings).toEqual(
      expect.arrayContaining([
        'a ajouté le critère d’avis « Cuisine »',
        'a renommé le critère d’avis « Calme » en « Calme et bruit »',
        'a masqué le critère d’avis « Calme et bruit »',
        'a réaffiché le critère d’avis « Calme et bruit »',
        'a changé l’ordre des critères d’avis',
        'a retiré le critère d’avis « Cuisine »',
      ])
    )
  })

  it('avis à l’aveugle désactivé par un propriétaire : l’autre avis se lit sans noter', async () => {
    await mine(chloe, { rating: 3, scores: { quiet: { score: 2 } } }).expect(
      200
    )
    const off = await patch(richard, '/workspace/opinion-settings', {
      blind: false,
    }).expect(200)
    expect(off.body.blind).toBe(false)
    const detail = await get(richard, `/listings/${id}`).expect(200)
    expect(detail.body.opinions).toHaveLength(1)
    expect(detail.body.opinionSummary.blind).toBe(false)
    await post(richard, `/listings/${id}/opinions/reveal`).expect(409)
    const journal = await get(richard, '/activity?kind=opinion').expect(200)
    expect(
      journal.body.items.map((e: { summary: string }) => e.summary)
    ).toContain('a désactivé les avis à l’aveugle')
  })

  it('la notification : les désaccords avec soi, ou « à toi de noter » sans les notes', async () => {
    await mine(chloe, {
      rating: 3,
      scores: { quiet: { score: 2, word: 'bus devant la chambre' } },
    }).expect(200)
    const first = await get(richard, '/notifications').expect(200)
    const pending = first.body.items.find(
      (x: { type: string }) => x.type === 'opinion_added'
    )
    expect(pending).toMatchObject({
      title: 'Chloé a donné son avis, à toi de noter',
      body: '[Exemple] T3 68 m², balcon sud : ses notes restent masquées tant que tu n’as pas noté.',
      url: `/annonces/${id}`,
    })
    expect(JSON.stringify(first.body)).not.toContain('bus devant')

    await mine(richard, { rating: 4, scores: { quiet: { score: 4 } } }).expect(
      200
    )
    const forChloe = await get(chloe, '/notifications').expect(200)
    expect(
      forChloe.body.items.find(
        (x: { type: string }) => x.type === 'opinion_added'
      )
    ).toMatchObject({
      title: 'Richard a donné son avis',
      body: '[Exemple] T3 68 m², balcon sud : 1 désaccord à discuter.',
    })
    // Les préférences habituelles s'appliquent.
    await put(chloe, '/notifications/preferences', {
      opinion_added: { in_app: false, push: false, email: false },
    }).expect(200)
    await mine(richard, { rating: 5, scores: { quiet: { score: 5 } } }).expect(
      200
    )
    const muted = await get(chloe, '/notifications').expect(200)
    expect(
      muted.body.items.filter(
        (x: { type: string }) => x.type === 'opinion_added'
      )
    ).toHaveLength(1)
  })

  it('liste : « À rediscuter », « Avis en attente », tris par note commune et désaccord', async () => {
    const make = async (title: string) =>
      (await post(richard, '/listings', { ...LISTING, title }).expect(201)).body
        .listing.id as string
    const agreed = await make('[Exemple] T3 Chartrons, cour')
    const waiting = await make('[Exemple] T2 bis Saint-Augustin')
    // `id` : deux désaccords ; `agreed` : d'accord ; `waiting` : Chloé seule.
    await mine(richard, {
      rating: 4,
      scores: { quiet: { score: 4 }, feel: { score: 4 }, layout: { score: 4 } },
    }).expect(200)
    await mine(chloe, {
      rating: 3,
      scores: { quiet: { score: 2 }, feel: { score: 1 }, layout: { score: 4 } },
    }).expect(200)
    await mine(
      richard,
      { rating: 4, scores: { quiet: { score: 5 } } },
      agreed
    ).expect(200)
    await mine(
      chloe,
      { rating: 4, scores: { quiet: { score: 4 } } },
      agreed
    ).expect(200)
    await mine(
      chloe,
      { rating: 3, scores: { quiet: { score: 3 } } },
      waiting
    ).expect(200)

    const titles = (body: { items: Array<{ listing: { id: string } }> }) =>
      body.items.map(i => i.listing.id)
    const discuss = await get(richard, '/listings?opinions=to_discuss').expect(
      200
    )
    expect(titles(discuss.body)).toEqual([id])
    const pending = await get(richard, '/listings?opinions=pending').expect(200)
    expect(titles(pending.body)).toEqual([waiting])
    // Pour Chloé, qui a tout noté, rien n'est masqué : `waiting` attend Richard.
    expect(
      titles((await get(chloe, '/listings?opinions=pending').expect(200)).body)
    ).toEqual([waiting])
    const byCommon = await get(richard, '/listings?sort=commonScore').expect(
      200
    )
    expect(titles(byCommon.body)).toEqual([agreed, id, waiting])
    const byGap = await get(richard, '/listings?sort=disagreement').expect(200)
    expect(titles(byGap.body)[0]).toBe(id)
    await get(richard, '/listings?opinions=disputes').expect(400)

    // L'export CSV : note commune et désaccords en fin de ligne.
    const csv = await get(richard, '/export?format=csv').expect(200)
    const row = n(csv.text)
      .split('\r\n')
      .find(line => line.includes('balcon sud'))
    expect(row).toMatch(
      /;3[,.]2;on s’y voit \(3 points\), calme \(2 points\);Agencement : Richard 4, Chloé 4 \| Calme : Richard 4, Chloé 2 \| On s’y voit : Richard 4, Chloé 1;$/
    )
  })

  it('la tâche de contre-visite se crée seulement à la demande, avec son contexte', async () => {
    const task = await post(richard, `/listings/${id}/tasks`, {
      label: 'À revoir à la contre-visite : le calme',
      origin: 'opinion',
      details:
        'Les notes s’écartent de 2 points : Richard 4 (« fenêtres fermées, ça va »), Chloé 2 (« bus devant la chambre »).',
    }).expect(201)
    expect(task.body).toMatchObject({
      origin: 'opinion',
      details: expect.stringContaining('Les notes s’écartent'),
    })
    // Rien n'est créé d'office par un avis.
    const tasks = await ctx.prisma.task.count({ where: { listingId: id } })
    await mine(richard, { rating: 4, scores: { quiet: { score: 4 } } }).expect(
      200
    )
    await mine(chloe, { rating: 2, scores: { quiet: { score: 1 } } }).expect(
      200
    )
    expect(await ctx.prisma.task.count({ where: { listingId: id } })).toBe(
      tasks
    )
    // Ajoutée par un membre, elle se supprime comme une tâche saisie à la main.
    await api()
      .delete(`/listings/${id}/tasks/${task.body.id}`)
      .set(ctx.auth(chloe))
      .expect(204)
  })
})
