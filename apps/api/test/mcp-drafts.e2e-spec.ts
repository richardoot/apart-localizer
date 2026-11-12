/**
 * Lot 31 (ADR 0044) : les brouillons au connecteur MCP, sur PostGIS réel et
 * JSON-RPC réel. Lister et lire (sans l'e-mail de l'expéditeur), corriger
 * sous garde-fou, comparer entre brouillons et aux annonces, garder,
 * écarter, repêcher, « C'est la même », fusionner deux brouillons dont le
 * lien rejoint l'annonce créée ; chaque écriture demande `confirmedInChat`
 * et est journalisée au canal `mcp` ; à plusieurs, garder devient une
 * proposition. Données fictives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { ListingInputSchema } from '@apart/contracts'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext, E2eIdentity } from './e2e-app'

const richard = e2eIdentity('richard')
const chloe = e2eIdentity('chloe')

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

/** Les données encadrées d'une réponse d'outil. */
function payload<T = Record<string, unknown>>(result: ToolResult): T {
  const text = result.content[0]?.text ?? ''
  const json = /<apart_listing_data>\n([\s\S]*)\n<\/apart_listing_data>/.exec(
    text
  )?.[1]
  if (!json) throw new Error(`Pas de données dans : ${text}`)
  return JSON.parse(json) as T
}

describe('Lot 31 : les brouillons au connecteur MCP (e2e)', () => {
  let ctx: E2eContext
  let workspaceId: string
  let nextId = 1
  const api = () => request(ctx.server)

  async function callTool(
    name: string,
    args: unknown,
    identity: E2eIdentity = richard
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

  async function draft(
    over: Record<string, unknown> = {},
    row: Record<string, unknown> = {}
  ): Promise<string> {
    const url =
      'url' in row
        ? (row.url as string | null)
        : 'https://www.bienici.com/annonce/exemple-9900201'
    const created = await ctx.prisma.listingDraft.create({
      data: {
        workspaceId,
        origin: 'exploration',
        extractedBy: 'claude',
        portal: 'bienici',
        input: ListingInputSchema.parse({
          title: '[Exemple] T3 Bacalan 62 m²',
          price: 172_000,
          surface: 62,
          rooms: 3,
          url,
          location: { commune: 'Bordeaux', district: 'Bacalan' },
          ...over,
        }),
        ...row,
        url,
      },
    })
    return created.id
  }

  const read = async (id: string) =>
    payload<{
      updatedAt: string
      status: string
      listing: Record<string, unknown>
    }>(await callTool('get_draft', { draftId: id }))

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
        name: 'Espace fictif',
        decideTogether: false,
        members: {
          create: [
            {
              handle: 'richard',
              displayName: 'Richard',
              email: richard.email,
              role: 'owner',
            },
          ],
        },
      },
    })
    workspaceId = workspace.id
  })

  it('les sept outils sont annoncés, aucun ne supprime', async () => {
    const res = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set(ctx.auth(richard))
      .send({ jsonrpc: '2.0', id: nextId++, method: 'tools/list' })
    const names = (res.body.result.tools as { name: string }[]).map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'list_drafts',
        'get_draft',
        'find_similar_drafts',
        'update_draft',
        'set_draft_status',
        'merge_draft_into_listing',
        'merge_drafts',
      ])
    )
    expect(names.some(name => name.startsWith('delete'))).toBe(false)
  })

  it('list_drafts et get_draft : par statut et par texte, sans l’e-mail de l’expéditeur', async () => {
    await draft()
    await draft(
      { title: '[Exemple] T2 Bastide' },
      {
        origin: 'email',
        extractedBy: 'parser',
        portal: null,
        status: 'dismissed',
        dismissReason: 'Trop loin du tram',
        emailFrom: 'alerte@exemple.invalid',
        url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000201',
      }
    )
    const pending = await callTool('list_drafts', {})
    expect(pending.content[0]?.text).toContain('1 brouillon(s) « À valider »')
    expect(pending.content[0]?.text).toContain('[Exemple] T3 Bacalan 62 m²')

    const dismissed = await callTool('list_drafts', {
      status: 'dismissed',
      search: 'tram',
    })
    const text = dismissed.content[0]?.text ?? ''
    expect(text).toContain('écarté : « Trop loin du tram »')
    expect(text).not.toContain('alerte@exemple.invalid')
    const none = await callTool('list_drafts', {
      status: 'dismissed',
      search: 'chartrons',
    })
    expect(none.content[0]?.text).toContain('0 brouillon(s)')

    const { items } = payload<{ items: { id: string }[] }>(dismissed)
    const one = await callTool('get_draft', { draftId: items[0]?.id })
    expect(one.content[0]?.text).not.toContain('alerte@exemple.invalid')
    expect(payload(one)).not.toHaveProperty('emailFrom')
    expect(payload(one)).toHaveProperty('updatedAt')
  })

  it('update_draft : corrige sous garde-fou, journalisé au canal mcp, refusé une fois validé', async () => {
    const id = await draft()
    const before = await read(id)
    const fixed = await callTool('update_draft', {
      draftId: id,
      patch: { floor: 2, price: 169_000 },
      expectedUpdatedAt: before.updatedAt,
      provenance: 'user',
    })
    expect(fixed.isError).toBeUndefined()
    expect(fixed.content[0]?.text).toContain('Brouillon corrigé')
    const after = await read(id)
    expect(after.listing).toMatchObject({ floor: 2, price: 169_000 })
    expect(after.listing.fieldSources).toMatchObject({
      floor: { source: 'user' },
    })

    const stale = await callTool('update_draft', {
      draftId: id,
      patch: { floor: 3 },
      expectedUpdatedAt: before.updatedAt,
    })
    expect(stale.isError).toBe(true)
    expect(stale.content[0]?.text).toContain('a changé depuis ta lecture')

    const log = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { action: 'draft.updated' },
    })
    expect(log.channel).toBe('mcp')

    await ctx.prisma.listingDraft.update({
      where: { id },
      data: { status: 'accepted' },
    })
    const closed = await callTool('update_draft', {
      draftId: id,
      patch: { floor: 3 },
      expectedUpdatedAt: after.updatedAt,
    })
    expect(closed.isError).toBe(true)
    expect(closed.content[0]?.text).toContain('déjà validé')
  })

  it('find_similar_drafts, puis merge_drafts : le lien de l’absorbé rejoint l’annonce créée', async () => {
    const keepId = await draft({ floor: null })
    const twinId = await draft(
      { title: '[Exemple] Appartement 3 pièces', floor: 4, dpeClass: 'D' },
      {
        status: 'dismissed',
        dismissReason: 'Déjà vu',
        portal: 'leboncoin',
        url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000202',
      }
    )
    await draft(
      {
        title: '[Exemple] Studio Talence',
        price: 89_000,
        surface: 18,
        rooms: 1,
        location: { commune: 'Talence' },
      },
      { url: 'https://www.bienici.com/annonce/exemple-9900203' }
    )
    const similar = await callTool('find_similar_drafts', { draftId: keepId })
    const found = payload<{ items: { draftId: string; status: string }[] }>(
      similar
    )
    expect(found.items[0]).toMatchObject({
      draftId: twinId,
      status: 'dismissed',
    })

    const keep = await read(keepId)
    const twin = await read(twinId)
    const args = {
      keepDraftId: keepId,
      mergeDraftId: twinId,
      expectedKeepUpdatedAt: keep.updatedAt,
      expectedMergeUpdatedAt: twin.updatedAt,
    }
    const refused = await callTool('merge_drafts', {
      ...args,
      confirmedInChat: false,
    })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]?.text).toContain('Rien n’a été modifié')

    const merged = await callTool('merge_drafts', {
      ...args,
      confirmedInChat: true,
    })
    expect(merged.isError).toBeUndefined()
    expect(merged.content[0]?.text).toContain('Brouillons fusionnés')
    expect(merged.content[0]?.text).toContain('Étage')
    const absorbed = await ctx.prisma.listingDraft.findUniqueOrThrow({
      where: { id: twinId },
    })
    expect(absorbed).toMatchObject({
      status: 'dismissed',
      mergedIntoDraftId: keepId,
    })
    expect(absorbed.dismissReason).toContain('Doublon du brouillon')
    expect((await read(keepId)).listing).toMatchObject({
      floor: 4,
      dpeClass: 'D',
    })
    // Une ressemblance déjà fusionnée n'est plus proposée.
    const again = payload<{ items: { draftId: string }[] }>(
      await callTool('find_similar_drafts', { draftId: keepId })
    )
    expect(again.items.map(i => i.draftId)).not.toContain(twinId)

    const kept = await callTool('set_draft_status', {
      draftId: keepId,
      decision: 'keep',
      confirmedInChat: true,
    })
    expect(kept.isError).toBeUndefined()
    const listing = await ctx.prisma.listing.findFirstOrThrow({
      include: { links: true },
    })
    expect(listing.links.map(link => link.url).sort()).toEqual([
      'https://www.bienici.com/annonce/exemple-9900201',
      'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000202',
    ])
    const accepted = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { action: 'draft.accepted' },
    })
    expect(accepted.channel).toBe('mcp')
  })

  it('ADR 0045 : l’absorbé est caché, supprimé après sept jours ; son lien reste reconnu et rejoint l’annonce', async () => {
    const keepId = await draft()
    const twinId = await draft(
      { title: '[Exemple] Appartement 3 pièces' },
      {
        status: 'dismissed',
        dismissReason: 'Vendu loué',
        portal: 'leboncoin',
        url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000211',
      }
    )
    const keep = await read(keepId)
    const twin = await read(twinId)
    await callTool('merge_drafts', {
      keepDraftId: keepId,
      mergeDraftId: twinId,
      confirmedInChat: true,
      expectedKeepUpdatedAt: keep.updatedAt,
      expectedMergeUpdatedAt: twin.updatedAt,
    })
    // Caché des archives ; le gardé porte son lien et sa raison d'écart.
    const archives = payload<{ items: { id: string }[] }>(
      await callTool('list_drafts', { status: 'dismissed' })
    )
    expect(archives.items.map(i => i.id)).not.toContain(twinId)
    const kept = payload<{
      mergedLinks: { url: string; reason: string | null; portal: string }[]
    }>(await callTool('get_draft', { draftId: keepId }))
    expect(kept.mergedLinks).toEqual([
      expect.objectContaining({
        url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000211',
        reason: 'Vendu loué',
        portal: 'leboncoin',
      }),
    ])

    // Sept jours plus tard : le repêchage est refusé, la fusion suivante le supprime.
    const old = new Date(Date.now() - 8 * 86_400_000)
    await ctx.prisma.listingDraft.update({
      where: { id: twinId },
      data: { mergedAt: old },
    })
    const late = await callTool('set_draft_status', {
      draftId: twinId,
      decision: 'restore',
      confirmedInChat: true,
    })
    expect(late.isError).toBe(true)
    expect(late.content[0]?.text).toContain('plus de 7 jours')
    const other = await draft(
      {
        title: '[Exemple] Studio Talence',
        price: 89_000,
        surface: 18,
        rooms: 1,
        location: { commune: 'Talence' },
      },
      { url: 'https://www.bienici.com/annonce/exemple-9900212' }
    )
    const third = await draft(
      {
        title: '[Exemple] Studio Talence bis',
        price: 89_000,
        surface: 18,
        rooms: 1,
        location: { commune: 'Talence' },
      },
      { url: 'https://www.bienici.com/annonce/exemple-9900213' }
    )
    await callTool('merge_drafts', {
      keepDraftId: other,
      mergeDraftId: third,
      confirmedInChat: true,
      expectedKeepUpdatedAt: (await read(other)).updatedAt,
      expectedMergeUpdatedAt: (await read(third)).updatedAt,
    })
    expect(
      await ctx.prisma.listingDraft.findUnique({ where: { id: twinId } })
    ).toBeNull()

    // L'exploration ne repropose pas le lien de l'absorbé supprimé.
    const triage = await callTool('triage_candidates', {
      candidates: [
        {
          url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000211',
          portal: 'leboncoin',
          title: '[Exemple] Appartement 3 pièces',
          price: 172_000,
          surface: 62,
          commune: 'Bordeaux',
        },
      ],
    })
    expect(triage.content[0]?.text).toContain('dismissed')

    // Garder le brouillon : l'annonce reçoit aussi le lien de l'absorbé supprimé.
    await ctx.prisma.listingDraft.update({
      where: { id: keepId },
      data: { status: 'pending', dismissReason: null },
    })
    await callTool('set_draft_status', {
      draftId: keepId,
      decision: 'keep',
      confirmedInChat: true,
    })
    const listing = await ctx.prisma.listing.findFirstOrThrow({
      include: { links: true },
    })
    expect(listing.links.map(link => link.url)).toContain(
      'https://www.leboncoin.fr/ad/ventes_immobilieres/3100000211'
    )
  })

  it('set_draft_status : écarter demande une raison et l’accord ; repêcher défait la fusion', async () => {
    const id = await draft()
    const noConsent = await callTool('set_draft_status', {
      draftId: id,
      decision: 'discard',
      reason: 'Trop cher',
      confirmedInChat: false,
    })
    expect(noConsent.isError).toBe(true)
    const noReason = await callTool('set_draft_status', {
      draftId: id,
      decision: 'discard',
      confirmedInChat: true,
    })
    expect(noReason.isError).toBe(true)
    expect(noReason.content[0]?.text).toContain('raison')

    const discarded = await callTool('set_draft_status', {
      draftId: id,
      decision: 'discard',
      reason: 'Trop cher',
      confirmedInChat: true,
    })
    expect(discarded.isError).toBeUndefined()
    expect((await read(id)).status).toBe('dismissed')

    await ctx.prisma.listingDraft.update({
      where: { id },
      data: { mergedIntoDraftId: await draft({ title: '[Exemple] Gardé' }) },
    })
    const restored = await callTool('set_draft_status', {
      draftId: id,
      decision: 'restore',
      confirmedInChat: true,
    })
    expect(restored.content[0]?.text).toContain('remis « À valider »')
    const row = await ctx.prisma.listingDraft.findUniqueOrThrow({
      where: { id },
    })
    expect(row).toMatchObject({ status: 'pending', mergedIntoDraftId: null })
  })

  it('à plusieurs, garder un brouillon devient une proposition au nom du membre', async () => {
    await ctx.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        decideTogether: true,
        members: {
          create: {
            handle: 'chloe',
            displayName: 'Chloé',
            email: chloe.email,
            role: 'member',
          },
        },
      },
    })
    const id = await draft()
    const result = await callTool('set_draft_status', {
      draftId: id,
      decision: 'keep',
      confirmedInChat: true,
    })
    expect(result.isError).toBeUndefined()
    expect(await ctx.prisma.listing.count()).toBe(0)
    expect((await read(id)).status).toBe('pending')
    expect(await ctx.prisma.decisionProposal.count()).toBe(1)
  })

  it('merge_draft_into_listing et find_similar_listings avec draftId', async () => {
    const created = await api()
      .post('/listings')
      .set(ctx.auth(richard))
      .send({
        title: '[Exemple] T3 Bacalan suivi',
        price: 172_000,
        surface: 62,
        rooms: 3,
        url: 'https://www.seloger.com/annonces/achat/appartement/exemple-9900204.htm',
        location: { commune: 'Bordeaux', district: 'Bacalan' },
      })
      .expect(201)
    const listingId = created.body.listing.id as string
    const updatedAt = created.body.listing.updatedAt as string
    const id = await draft()

    const similar = await callTool('find_similar_listings', { draftId: id })
    expect(similar.content[0]?.text).toContain('[Exemple] T3 Bacalan suivi')

    const refused = await callTool('merge_draft_into_listing', {
      draftId: id,
      listingId,
      confirmedInChat: false,
      expectedListingUpdatedAt: updatedAt,
    })
    expect(refused.isError).toBe(true)
    const merged = await callTool('merge_draft_into_listing', {
      draftId: id,
      listingId,
      confirmedInChat: true,
      expectedListingUpdatedAt: updatedAt,
    })
    expect(merged.isError).toBeUndefined()
    expect(merged.content[0]?.text).toContain('C’est la même')
    const links = await ctx.prisma.listingLink.findMany({
      where: { listingId },
    })
    expect(links.map(link => link.url)).toContain(
      'https://www.bienici.com/annonce/exemple-9900201'
    )
    expect((await read(id)).status).toBe('merged')
  })
})
