import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createE2eDatabase } from '../../apps/api/test/e2e-database.js'
import type { E2eDatabase } from '../../apps/api/test/e2e-database.js'
import { buildDemoDataset } from '../lib/demo/dataset.js'
import { DEMO_WORKSPACE_ID } from '../lib/demo/ids.js'
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
    // à valider : l'alerte e-mail et les quatre de la dernière exploration.
    expect(report.explorations).toBe(2)
    expect(report.drafts).toBe(6)
    expect(
      await db.prisma.exploration.count({
        where: { workspaceId: DEMO_WORKSPACE_ID },
      })
    ).toBe(2)
    expect(
      await db.prisma.explorationCandidate.count({
        where: { exploration: { workspaceId: DEMO_WORKSPACE_ID } },
      })
    ).toBe(13)
    expect(
      await db.prisma.listingDraft.count({
        where: { workspaceId: DEMO_WORKSPACE_ID, status: 'pending' },
      })
    ).toBe(5)
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
