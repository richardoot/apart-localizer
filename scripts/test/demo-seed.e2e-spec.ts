import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createE2eDatabase } from '../../apps/api/test/e2e-database.js'
import type { E2eDatabase } from '../../apps/api/test/e2e-database.js'
import { buildDemoDataset } from '../lib/demo/dataset.js'
import { DEMO_WORKSPACE_ID, demoId } from '../lib/demo/ids.js'
import { DemoSeedConflict, writeDemoDataset } from '../lib/demo/write.js'

/**
 * Le seed de démonstration sur un vrai PostGIS : il recrée l'espace « Démo »
 * à l'identique, calcule les entrées dans les critères par le module geo, et
 * ne touche JAMAIS aux autres espaces. Les comptes GoTrue sont remplacés par
 * des identifiants fixes (aucun réseau).
 */
const NOW = new Date('2026-11-03T15:00:00Z')
const AUTH = { demo: 'auth-demo-e2e', demo2: 'auth-demo2-e2e' }

describe('seed de démonstration (e2e, PostGIS)', () => {
  let db: E2eDatabase
  let otherListingId: string

  beforeAll(async () => {
    db = await createE2eDatabase()
    // Un autre espace, comme celui de Richard : il doit rester intact.
    const other = await db.prisma.workspace.create({
      data: { name: 'Espace réel (fictif pour le test)' },
    })
    await db.prisma.member.create({
      data: {
        workspaceId: other.id,
        handle: 'richard',
        displayName: 'Richard',
        email: null,
      },
    })
    const listing = await db.prisma.listing.create({
      data: {
        workspaceId: other.id,
        title: 'Annonce à ne pas toucher',
        price: 123_456,
      },
    })
    otherListingId = listing.id
    await db.prisma.activityLog.create({
      data: {
        workspaceId: other.id,
        listingId: listing.id,
        action: 'listing.imported',
        channel: 'import',
      },
    })
  })

  afterAll(async () => {
    await db?.close()
  })

  async function counts() {
    const [row] = await db.query<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM app.listings WHERE workspace_id = $1) AS listings,
         (SELECT count(*)::int FROM app.listings WHERE workspace_id = $1 AND latitude IS NOT NULL) AS located,
         (SELECT count(*)::int FROM app.members WHERE workspace_id = $1) AS members,
         (SELECT count(*)::int FROM app.criteria_matches m JOIN app.search_criteria c ON c.id = m.criteria_id WHERE c.workspace_id = $1 AND m.level <> 'out') AS matches,
         (SELECT count(*)::int FROM app.criteria_matches m JOIN app.search_criteria c ON c.id = m.criteria_id WHERE c.workspace_id = $1) AS fits,
         (SELECT count(*)::int FROM app.search_criteria WHERE workspace_id = $1 AND perimeter IS NOT NULL) AS polygons,
         (SELECT count(*)::int FROM app.notifications WHERE workspace_id = $1) AS notifications,
         (SELECT count(*)::int FROM app.notifications WHERE workspace_id = $1 AND read_at IS NULL) AS unread,
         (SELECT count(*)::int FROM app.activity_logs WHERE workspace_id = $1) AS activity,
         (SELECT count(*)::int FROM app.visits v JOIN app.listings l ON l.id = v.listing_id WHERE l.workspace_id = $1) AS visits,
         (SELECT count(*)::int FROM app.agency_requests WHERE workspace_id = $1) AS agency_requests,
         (SELECT count(*)::int FROM app.listing_contacts WHERE workspace_id = $1) AS contacts,
         (SELECT count(*)::int FROM app.tasks t JOIN app.listings l ON l.id = t.listing_id WHERE l.workspace_id = $1 AND t.request_id IS NOT NULL) AS requested_tasks,
         (SELECT count(*)::int FROM app.notifications WHERE workspace_id = $1 AND type = 'agency_answer') AS agency_answers,
         (SELECT count(*)::int FROM app.opinion_criteria WHERE workspace_id = $1) AS opinion_criteria,
         (SELECT count(*)::int FROM app.opinion_scores s JOIN app.opinions o ON o.id = s.opinion_id JOIN app.listings l ON l.id = o.listing_id WHERE l.workspace_id = $1) AS opinion_scores,
         (SELECT count(*)::int FROM app.notifications WHERE workspace_id = $1 AND type = 'opinion_added') AS opinion_notifications,
         (SELECT count(*)::int FROM app.listings WHERE workspace_id <> $1) AS other_listings,
         (SELECT count(*)::int FROM app.members WHERE workspace_id <> $1) AS other_members,
         (SELECT count(*)::int FROM app.activity_logs WHERE workspace_id <> $1) AS other_activity`,
      [DEMO_WORKSPACE_ID]
    )
    return row as Record<string, number>
  }

  it('écrit l’espace Démo complet, localisé, avec ses entrées de critères et ses notifications', async () => {
    const dataset = buildDemoDataset(NOW)
    const report = await writeDemoDataset(db.prisma, dataset, AUTH, NOW)
    const c = await counts()
    expect(c).toMatchObject({
      listings: dataset.listings.length,
      located: dataset.listings.length,
      members: 2,
      polygons: 1,
      other_listings: 1,
      other_members: 1,
      other_activity: 1,
    })
    // Lot 14 : une ligne d'adéquation par critère et annonce. Polygone :
    // Chartrons et Bastide, Saint-Michel à la marge (DPE E, une classe) ;
    // tram B : Talence Forum et Peixotto ; rive droite : le T3 de Cenon et sa
    // première annonce (lot 15, vendue ou retirée) à confirmer (au quartier,
    // sans adresse, dans la marge de 400 m).
    expect(c.fits).toBe(dataset.listings.length * dataset.criteria.length)
    expect(c.matches).toBe(7)
    expect(report.criteriaMatches).toBe(7)
    expect(report.criteriaFit).toMatchObject({ margin: 1, to_confirm: 2 })
    expect(c.notifications).toBeGreaterThan(20)
    expect(c.unread).toBeGreaterThan(0)
    expect(c.visits).toBe(8)
    // Lot 16 : deux explorations fictives, leurs lignes et leurs brouillons ;
    // à valider : l'alerte e-mail et les cinq de la dernière exploration
    // (lot 18 : dont un doublon par la référence ; un brouillon reconnu,
    // rattaché d'office).
    expect(report.explorations).toBe(2)
    expect(report.drafts).toBe(8)
    expect(
      await db.prisma.exploration.count({
        where: { workspaceId: DEMO_WORKSPACE_ID },
      })
    ).toBe(2)
    expect(
      await db.prisma.explorationCandidate.count({
        where: { exploration: { workspaceId: DEMO_WORKSPACE_ID } },
      })
    ).toBe(15)
    expect(
      await db.prisma.listingDraft.count({
        where: { workspaceId: DEMO_WORKSPACE_ID, status: 'pending' },
      })
    ).toBe(6)
    // Lot 18 : un lien d'origine par annonce et quatre liens ajoutés, chaque
    // vérification sur un lien, le lien rattaché d'office et son brouillon
    // reconnu ; le nom de l'agence est sur l'annonce, jamais dans le contact.
    expect(report.links).toBe(dataset.listings.length + 4)
    expect(
      await db.prisma.listingLink.count({
        where: { workspaceId: DEMO_WORKSPACE_ID },
      })
    ).toBe(report.links)
    expect(
      await db.prisma.listingCheck.count({
        where: { workspaceId: DEMO_WORKSPACE_ID, linkId: null },
      })
    ).toBe(0)
    const merged = await db.prisma.listingDraft.findFirstOrThrow({
      where: { workspaceId: DEMO_WORKSPACE_ID, status: 'merged' },
      include: { attachedLink: true },
    })
    expect(merged.attachedLink).toMatchObject({
      origin: 'exploration',
      listingId: demoId('listing:merignac-t2'),
    })
    expect(merged.attachedAt).not.toBeNull()
    const chartrons = await db.prisma.listing.findUniqueOrThrow({
      where: { id: demoId('listing:chartrons-t2') },
      include: {
        contact: true,
        links: { orderBy: { createdAt: 'asc' } },
        sellers: true,
      },
    })
    expect(chartrons).toMatchObject({
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReferenceKey: 'EX2041',
      url: chartrons.links[0]?.url,
    })
    expect(
      chartrons.links.map(l => [l.portal, l.offlineSince === null])
    ).toEqual([
      ['seloger', true],
      ['bienici', false],
      ['leboncoin', true],
    ])
    expect(chartrons.contact?.agencyName).toBeNull()
    // Lot 27 : la seconde agence fictive du même bien, avec sa référence.
    expect(
      chartrons.sellers.map(s => [s.sellerName, s.sellerReferenceKey, s.origin])
    ).toEqual([['[Exemple] Agence du Jardin public', 'EX5512', 'manual']])
    expect(chartrons.sellers[0]?.addedById).not.toBeNull()
    // Lot 17 : trois demandes (réponse reçue, à valider, relance due), trois
    // contacts, les tâches demandées ou répondues rattachées, une
    // notification « réponse de l'agence » pour l'autre membre.
    expect(report.agencyRequests).toBe(3)
    expect(c.agency_requests).toBe(3)
    expect(c.contacts).toBe(3)
    expect(c.requested_tasks).toBe(3)
    expect(c.agency_answers).toBe(1)
    // Lot 20 : les critères des avis (huit par défaut, « Cuisine » ajouté),
    // les notes par critère, l'avis à l'aveugle, la première note, et une
    // notification « avis d'un autre membre » quand le second avis arrive.
    expect(report.opinionCriteria).toBe(9)
    expect(c.opinion_criteria).toBe(9)
    expect(report.opinionScores).toBe(
      dataset.listings.reduce(
        (n, l) => n + l.opinions.reduce((m, o) => m + o.scores.length, 0),
        0
      )
    )
    expect(c.opinion_scores).toBe(report.opinionScores)
    expect(c.opinion_notifications).toBeGreaterThan(0)
    // Lot 21 : une proposition par état, avec leurs réponses, sans bouger les statuts.
    const proposals = await db.prisma.decisionProposal.findMany({
      where: { workspaceId: DEMO_WORKSPACE_ID },
      include: { responses: true },
    })
    expect(proposals).toHaveLength(dataset.decisions.length)
    expect(new Set(proposals.map(p => p.state))).toEqual(
      new Set(['open', 'to_settle', 'applied', 'withdrawn'])
    )
    expect(proposals.flatMap(p => p.responses)).toHaveLength(
      dataset.decisions.flatMap(d => d.responses).length
    )
    const workspace = await db.prisma.workspace.findUniqueOrThrow({
      where: { id: DEMO_WORKSPACE_ID },
      include: { opinionCriteria: { orderBy: { position: 'asc' } } },
    })
    expect(workspace.opinionsBlind).toBe(true)
    expect(workspace.opinionCriteria.at(-1)).toMatchObject({
      key: 'custom_cuisine',
      label: 'Cuisine',
      origin: 'custom',
      position: 8,
    })
    const saintMichel = await db.prisma.opinion.findMany({
      where: { listingId: demoId('listing:saint-michel-t3') },
      include: { scores: true },
      orderBy: { createdAt: 'asc' },
    })
    expect(saintMichel.map(o => o.scores.length)).toEqual([8, 8])
    expect(saintMichel.every(o => o.ratedAt !== null)).toBe(true)
    expect(
      saintMichel[0]?.scores.find(s => s.criterionKey === 'condition')?.score
    ).toBe(2)
    // La base refuse une note hors de 1 à 5.
    await expect(
      db.query(`UPDATE app.opinion_scores SET score = 0 WHERE id = $1`, [
        saintMichel[0]?.scores[0]?.id,
      ])
    ).rejects.toThrow(/opinion_scores_score_range/)
    const members = await db.prisma.member.findMany({
      where: { workspaceId: DEMO_WORKSPACE_ID },
      orderBy: { handle: 'asc' },
    })
    expect(members.map(m => [m.handle, m.authUserId, m.email])).toEqual([
      ['demo', 'auth-demo-e2e', 'demo@apart.local'],
      ['demo2', 'auth-demo2-e2e', 'demo2@apart.local'],
    ])
    expect(report.otherWorkspaces).toEqual([
      expect.objectContaining({
        name: 'Espace réel (fictif pour le test)',
        listings: 1,
        members: 1,
        activity: 1,
      }),
    ])
  })

  it('relancé, recrée le même espace à l’identique et laisse l’autre espace tel quel', async () => {
    const before = await counts()
    const ids = (
      await db.prisma.listing.findMany({
        where: { workspaceId: DEMO_WORKSPACE_ID },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(l => l.id)
    await writeDemoDataset(db.prisma, buildDemoDataset(NOW), AUTH, NOW)
    expect(await counts()).toEqual(before)
    const again = (
      await db.prisma.listing.findMany({
        where: { workspaceId: DEMO_WORKSPACE_ID },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(l => l.id)
    expect(again).toEqual(ids)
    const untouched = await db.prisma.listing.findUniqueOrThrow({
      where: { id: otherListingId },
    })
    expect(untouched.title).toBe('Annonce à ne pas toucher')
  })

  it("refuse de prendre un compte déjà relié à un membre d'un autre espace, et n'écrit rien", async () => {
    const other = await db.prisma.workspace.findFirstOrThrow({
      where: { id: { not: DEMO_WORKSPACE_ID } },
    })
    await db.prisma.member.create({
      data: {
        workspaceId: other.id,
        handle: 'pris',
        displayName: 'Déjà connecté',
        email: 'demo@apart.local',
        authUserId: 'auth-deja-pris',
      },
    })
    const before = await counts()
    await expect(
      writeDemoDataset(
        db.prisma,
        buildDemoDataset(NOW),
        { demo: 'auth-deja-pris', demo2: 'auth-demo2-e2e' },
        NOW
      )
    ).rejects.toThrow(DemoSeedConflict)
    expect(await counts()).toEqual(before)
  })
})
