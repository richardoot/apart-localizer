/**
 * Lot 18 : la migration `20261108100000_lot18_listing_links` sur un vrai
 * PostGIS, appliquée à une base au lot 17 qui a déjà des annonces : chaque
 * annonce qui a une URL reçoit son lien d'origine (aucune perte), clé
 * normalisée comme `normalizeListingUrl` (portails, paramètres de suivi,
 * forme Leboncoin), portail tiré de l'hôte ou de la source, prix et état
 * repris, doublons d'avant le lot 18 gardés sans casser l'unicité ; les
 * vérifications existantes rattachées au lien ; le nom d'agence du contact
 * reporté sur l'annonce ; le vendeur inconnu sinon. Données fictives.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { linkKey } from '@apart/domain'
import {
  DEFAULT_TEST_DATABASE_URL,
  dropE2eDatabase,
  migrationFiles,
} from './e2e-database'

const LOT18 = '20261108100000_lot18_listing_links'

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

describe('Migration du lot 18 : liens d’origine et vendeur (e2e)', () => {
  const adminUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL
  const name = `e2e_lot18_${process.pid}_${randomBytes(4).toString('hex')}`
  let admin: Pool
  let pool: Pool
  const workspace = randomUUID()
  const member = randomUUID()
  const ids = {
    lbc: randomUUID(),
    seloger: randomUUID(),
    logic: randomUUID(),
    agency: randomUUID(),
    duplicate: randomUUID(),
    noUrl: randomUUID(),
    ftp: randomUUID(),
  }
  const urls = {
    lbc: 'https://www.leboncoin.fr/ventes_immobilieres/0000000101.htm?ac=0000000001',
    seloger:
      'https://www.SeLoger.com/annonces/achat/appartement/bordeaux-33/exemple/0000000202.htm?projects=2#photos',
    logic: 'https://www.logic-immo.com/detail-vente-0000000404.htm',
    agency:
      'https://agence.exemple.invalid/annonce/?ref=EX-2041&utm_source=alerte&xtor=AL-1&id=12',
    ftp: 'ftp://exemple.invalid/annonce',
  }

  async function insertListing(
    id: string,
    over: Record<string, unknown>,
    createdAt: string
  ): Promise<void> {
    const row = {
      id,
      workspace_id: workspace,
      title: `[Exemple] ${id.slice(0, 4)}`,
      price: 214000,
      source: 'autre',
      created_at: createdAt,
      updated_at: createdAt,
      created_by_id: member,
      ...over,
    }
    const keys = Object.keys(row)
    await pool.query(
      `INSERT INTO app.listings (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys
        .map((_, i) => `$${i + 1}`)
        .join(', ')})`,
      Object.values(row)
    )
  }

  beforeAll(async () => {
    admin = new Pool({ connectionString: adminUrl, max: 1 })
    await admin.query(`CREATE DATABASE "${name}"`)
    pool = new Pool({ connectionString: withDatabase(adminUrl, name) })
    const files = migrationFiles()
    const lot18 = files.findIndex(f => path.basename(path.dirname(f)) === LOT18)
    expect(lot18).toBeGreaterThan(0)
    for (const file of files.slice(0, lot18)) {
      await pool.query(readFileSync(file, 'utf8'))
    }
    // Une base au lot 17 : des annonces, une vérification, des contacts.
    await pool.query(
      `INSERT INTO app.workspaces (id, name, updated_at) VALUES ($1, 'Démo', now())`,
      [workspace]
    )
    await pool.query(
      `INSERT INTO app.members (id, workspace_id, handle, display_name, updated_at) VALUES ($1, $2, 'richard', 'Richard', now())`,
      [member, workspace]
    )
    await insertListing(
      ids.lbc,
      { url: urls.lbc, source: 'leboncoin', external_id: '0000000101' },
      '2026-10-01T10:00:00Z'
    )
    await insertListing(
      ids.seloger,
      {
        url: urls.seloger,
        source: 'seloger',
        last_checked_at: '2026-11-04T10:00:00Z',
        last_seen_online_at: '2026-11-01T10:00:00Z',
      },
      '2026-10-02T10:00:00Z'
    )
    await insertListing(
      ids.logic,
      { url: urls.logic, source: 'autre', source_label: 'Logic-Immo' },
      '2026-10-03T10:00:00Z'
    )
    await insertListing(
      ids.agency,
      { url: urls.agency, source: 'agence' },
      '2026-10-04T10:00:00Z'
    )
    // Le même lien Leboncoin, autrement écrit, sur une annonce plus récente.
    await insertListing(
      ids.duplicate,
      {
        url: 'https://leboncoin.fr/ad/ventes_immobilieres/0000000101',
        source: 'leboncoin',
      },
      '2026-10-05T10:00:00Z'
    )
    await insertListing(ids.noUrl, { url: null }, '2026-10-06T10:00:00Z')
    await insertListing(
      ids.ftp,
      { url: `  ${urls.ftp}  ` },
      '2026-10-07T10:00:00Z'
    )
    await pool.query(
      `INSERT INTO app.price_events (id, listing_id, occurred_at, new_price, source) VALUES ($1, $2, '2026-10-20T10:00:00Z', 214000, 'listing')`,
      [randomUUID(), ids.lbc]
    )
    // La dernière vérification concluante de l'annonce SeLoger : plus en ligne.
    for (const [outcome, at] of [
      ['changed', '2026-11-01T10:00:00Z'],
      ['offline', '2026-11-03T10:00:00Z'],
      ['inaccessible', '2026-11-04T10:00:00Z'],
    ] as const) {
      await pool.query(
        `INSERT INTO app.listing_checks (id, listing_id, workspace_id, checked_at, channel, outcome, summary) VALUES ($1, $2, $3, $4, 'mcp', $5, 'x')`,
        [randomUUID(), ids.seloger, workspace, at, outcome]
      )
    }
    await pool.query(
      `INSERT INTO app.listing_contacts (listing_id, workspace_id, agency_name, updated_at) VALUES ($1, $2, '[Exemple] Agence du port', '2026-10-10T10:00:00Z'), ($3, $2, 'Particulier', '2026-10-10T10:00:00Z')`,
      [ids.agency, workspace, ids.logic]
    )
    const sql = readFileSync(files[lot18] as string, 'utf8')
    await pool.query(sql)
  })

  afterAll(async () => {
    await pool?.end()
    if (admin) await dropE2eDatabase(admin, name)
    await admin?.end()
  })

  async function linksOf(listingId: string) {
    const result = await pool.query(
      `SELECT * FROM app.listing_links WHERE listing_id = $1`,
      [listingId]
    )
    return result.rows as Array<Record<string, unknown>>
  }

  it('un lien d’origine par annonce qui a une URL, clé comme normalizeListingUrl', async () => {
    const all = await pool.query(
      `SELECT count(*)::int AS n FROM app.listing_links`
    )
    expect(all.rows[0].n).toBe(6)
    expect(await linksOf(ids.noUrl)).toEqual([])
    const expectations: Array<[string, string, string]> = [
      [ids.lbc, urls.lbc, 'leboncoin'],
      [ids.seloger, urls.seloger, 'seloger'],
      [ids.logic, urls.logic, 'logicimmo'],
      [ids.agency, urls.agency, 'agence'],
    ]
    for (const [listingId, url, portal] of expectations) {
      const [link] = await linksOf(listingId)
      expect(link).toMatchObject({
        url,
        portal,
        origin: 'original',
        added_by_id: member,
        normalized_url: linkKey(url),
      })
    }
    expect(linkKey(urls.lbc)).toBe(
      'https://leboncoin.fr/ad/ventes_immobilieres/0000000101'
    )
    // Un lien qui n'est pas http(s) est gardé tel quel, sans les espaces.
    const [ftp] = await linksOf(ids.ftp)
    expect(ftp?.normalized_url).toBe(urls.ftp)
  })

  it('prix, dates, état et identifiant repris ; doublon d’avant le lot 18 gardé', async () => {
    const [lbc] = await linksOf(ids.lbc)
    expect(Number(lbc?.price)).toBe(214000)
    expect((lbc?.price_at as Date).toISOString()).toBe(
      '2026-10-20T10:00:00.000Z'
    )
    expect(lbc?.external_id).toBe('0000000101')
    expect(lbc?.offline_since).toBeNull()
    const [seloger] = await linksOf(ids.seloger)
    expect((seloger?.offline_since as Date).toISOString()).toBe(
      '2026-11-03T10:00:00.000Z'
    )
    expect((seloger?.last_checked_at as Date).toISOString()).toBe(
      '2026-11-04T10:00:00.000Z'
    )
    expect((seloger?.price_at as Date).toISOString()).toBe(
      '2026-10-02T10:00:00.000Z'
    )
    const [duplicate] = await linksOf(ids.duplicate)
    expect(duplicate?.normalized_url).toBe(
      `https://leboncoin.fr/ad/ventes_immobilieres/0000000101#doublon-${ids.duplicate}`
    )
  })

  it('les vérifications rattachées au lien ; le nom d’agence du contact reporté ; vendeur inconnu sinon', async () => {
    const checks = await pool.query(
      `SELECT c.link_id, l.listing_id FROM app.listing_checks c JOIN app.listing_links l ON l.id = c.link_id`
    )
    expect(checks.rows).toHaveLength(3)
    expect(checks.rows.every(r => r.listing_id === ids.seloger)).toBe(true)
    const sellers = await pool.query(
      `SELECT id, seller_type, seller_name, seller_reference, field_sources FROM app.listings`
    )
    const byId = new Map(sellers.rows.map(r => [r.id, r]))
    expect(byId.get(ids.agency)).toMatchObject({
      seller_type: 'unknown',
      seller_name: '[Exemple] Agence du port',
      seller_reference: null,
    })
    expect(byId.get(ids.agency).field_sources.sellerName).toMatchObject({
      source: 'user',
      recordedAt: '2026-10-10T10:00:00.000Z',
    })
    expect(byId.get(ids.logic)).toMatchObject({
      seller_type: 'private',
      seller_name: null,
    })
    expect(byId.get(ids.lbc)).toMatchObject({
      seller_type: 'unknown',
      seller_name: null,
    })
  })
})
