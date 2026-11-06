#!/usr/bin/env tsx
/**
 * Import des données de l'artefact Claude « Comparateur d'annonces locatives ».
 *
 *   pnpm import:artifact [--no-geocode] [--dry-run] [--dir data/private/artifact-export]
 *                        [--richard-email r@x] [--chloe-email c@x] [--database-url ...]
 *
 * Lit `annonces/*.json` et `reglages/financement.json`, crée l'espace
 * « Richard et Chloé » avec ses deux membres (rattachés à Supabase à leur
 * première connexion grâce à l'e-mail), importe les hypothèses, les annonces
 * (travaux, phase 2, avis, tâches, « vu par » Richard), puis géocode les
 * adresses par la Géoplateforme IGN avec un cache sur disque. Idempotent :
 * une annonce déjà importée (même identifiant externe) est laissée telle quelle.
 * Lot 18 : le lien de l'annonce devient son lien d'origine (`listing_links`),
 * comme le fait la migration pour les annonces déjà en base ; un lien déjà
 * pris dans l'espace reçoit une clé suffixée `#doublon-<id>`.
 *
 * Le SQL géographique n'est pas ici : le point passe par GeoService.
 */
import 'reflect-metadata'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cliArgs } from './lib/cli.js'
import { config as loadEnv } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { taskFieldForLabel } from '@apart/contracts'
import { linkKey, portalOfListingSource } from '@apart/domain'
import { Prisma, PrismaClient } from '../apps/api/src/generated/prisma/index.js'
import { GeoService } from '../apps/api/src/geo/geo.service.js'
import type { PrismaService } from '../apps/api/src/prisma/prisma.service.js'
import {
  ArtifactFinancingSchema,
  geocodeQuery,
  mapAssumptions,
  mapListing,
} from './lib/artifact.js'
import type { MappedListing } from './lib/artifact.js'
import { Geocoder } from './lib/geocode.js'
import type { GeocodeResult } from './lib/geocode.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

const { values: args } = parseArgs({
  args: cliArgs(),
  options: {
    'no-geocode': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    dir: {
      type: 'string',
      default: path.join(repoRoot, 'data/private/artifact-export'),
    },
    'cache-file': {
      type: 'string',
      default: path.join(repoRoot, 'data/private/geocode-cache.json'),
    },
    'richard-email': { type: 'string' },
    'chloe-email': { type: 'string' },
    'database-url': { type: 'string' },
    workspace: { type: 'string', default: 'Richard et Chloé' },
  },
})

loadEnv({ path: path.join(repoRoot, 'apps/api/.env') })
const databaseUrl = args['database-url'] ?? process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL manquant (apps/api/.env ou --database-url).')
  process.exit(1)
}

const WORKSPACE_NAME = args.workspace ?? 'Richard et Chloé'
const MEMBERS = [
  {
    handle: 'richard',
    displayName: 'Richard',
    role: 'owner' as const,
    email: args['richard-email'] ?? process.env.IMPORT_RICHARD_EMAIL ?? null,
  },
  {
    handle: 'chloe',
    displayName: 'Chloé',
    role: 'member' as const,
    email: args['chloe-email'] ?? process.env.IMPORT_CHLOE_EMAIL ?? null,
  },
]

const dec = (value: number | null | undefined): Prisma.Decimal | null =>
  value == null ? null : new Prisma.Decimal(value)

async function main(): Promise<void> {
  const exportDir = args.dir as string
  const listingsDir = path.join(exportDir, 'annonces')
  const financingFile = path.join(exportDir, 'reglages', 'financement.json')
  if (!existsSync(listingsDir)) {
    throw new Error(`Dossier introuvable : ${listingsDir}`)
  }

  const files = readdirSync(listingsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
  const mapped: MappedListing[] = files.map(file =>
    mapListing(
      file.replace(/\.json$/, ''),
      JSON.parse(readFileSync(path.join(listingsDir, file), 'utf8'))
    )
  )
  console.log(`${mapped.length} annonces lues dans ${listingsDir}`)

  const geocoder = new Geocoder({
    cacheFile: args['cache-file'] as string,
    online: !args['no-geocode'],
  })

  if (args['dry-run']) {
    for (const item of mapped) {
      console.log(
        `- ${item.externalId}: ${item.input.title} (${item.input.status}, ${item.tasks.length} tâches, ${item.opinions.length} avis)`
      )
    }
    return
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  const geo = new GeoService(prisma as unknown as PrismaService)
  const stats = {
    created: 0,
    skipped: 0,
    geocodedExact: 0,
    geocodedCommune: 0,
    notGeocoded: 0,
  }

  try {
    // 1. Espace et membres
    let workspace = await prisma.workspace.findFirst({
      where: { name: WORKSPACE_NAME },
    })
    workspace ??= await prisma.workspace.create({
      data: { name: WORKSPACE_NAME },
    })
    const members = new Map<string, string>()
    for (const member of MEMBERS) {
      const row = await prisma.member.upsert({
        where: {
          workspaceId_handle: {
            workspaceId: workspace.id,
            handle: member.handle,
          },
        },
        create: { workspaceId: workspace.id, ...member },
        update: member.email ? { email: member.email } : {},
      })
      members.set(member.handle, row.id)
      if (!row.email) {
        console.warn(
          `  ! ${member.displayName} sans e-mail : passez --${member.handle}-email pour le rattacher à sa connexion Google.`
        )
      }
    }

    // 2. Hypothèses (une seule version importée)
    const hasAssumptions = await prisma.assumptionsVersion.count({
      where: { workspaceId: workspace.id },
    })
    if (hasAssumptions === 0 && existsSync(financingFile)) {
      const financing = ArtifactFinancingSchema.parse(
        JSON.parse(readFileSync(financingFile, 'utf8'))
      )
      await prisma.assumptionsVersion.create({
        data: {
          workspaceId: workspace.id,
          label: "Import de l'artefact",
          values: mapAssumptions(financing),
        },
      })
      console.log('Hypothèses importées.')
    }

    // 3. Annonces
    for (const item of mapped) {
      const existing = await prisma.listing.findFirst({
        where: { workspaceId: workspace.id, externalId: item.externalId },
      })
      if (existing) {
        stats.skipped++
        continue
      }
      const id = await importListing(prisma, workspace.id, members, item)
      stats.created++

      const located = await locate(geocoder, item)
      if (located) {
        await geo.setListingPoint(id, located.point, located.precision)
        await prisma.listing.update({
          where: { id },
          data: {
            addressNormalized:
              located.precision === 'commune' ? null : located.label,
            banId: located.precision === 'commune' ? null : located.banId,
            inseeCode: located.citycode,
          },
        })
        if (located.precision === 'commune') stats.geocodedCommune++
        else stats.geocodedExact++
      } else {
        stats.notGeocoded++
      }
    }
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }

  console.log(
    `Import terminé : ${stats.created} créées, ${stats.skipped} déjà présentes ; ` +
      `géocodage : ${stats.geocodedExact} à l'adresse, ${stats.geocodedCommune} au centroïde de la commune, ` +
      `${stats.notGeocoded} sans point (${geocoder.calls} appels réseau).`
  )
}

/** Adresse exacte d'abord, sinon centroïde de la commune ; rien si le géocodeur est muet. */
async function locate(
  geocoder: Geocoder,
  item: MappedListing
): Promise<GeocodeResult | null> {
  const query = geocodeQuery(item.input)
  if (!query) return null
  if (item.hasExactAddress) {
    const result = await geocoder.geocode(query, 'address')
    if (result && result.precision !== 'commune') return result
  }
  const commune = item.input.location.commune
  if (!commune) return null
  return geocoder.geocode(commune, 'municipality')
}

async function importListing(
  prisma: PrismaClient,
  workspaceId: string,
  members: Map<string, string>,
  item: MappedListing
): Promise<string> {
  const { input } = item
  const richardId = members.get('richard')
  return prisma.$transaction(async tx => {
    const listing = await tx.listing.create({
      data: {
        workspaceId,
        createdById: richardId ?? null,
        source: input.source,
        sourceLabel: input.sourceLabel,
        url: input.url,
        externalId: item.externalId,
        title: input.title,
        notes: input.notes,
        addressRaw: input.location.addressRaw,
        commune: input.location.commune,
        district: input.location.district,
        price: new Prisma.Decimal(input.price),
        surface: dec(input.surface),
        rooms: input.rooms,
        floor: input.floor,
        floorsTotal: input.floorsTotal,
        floorLabel: input.floorLabel,
        elevator: input.elevator,
        constructionYear: input.constructionYear,
        dpeClass: input.dpeClass,
        annualCharges: dec(input.annualCharges),
        nonRecoverableChargesMonthly: dec(input.nonRecoverableChargesMonthly),
        propertyTax: dec(input.propertyTax),
        furnitureValue: dec(input.furnitureValue),
        fieldSources: input.fieldSources as Prisma.InputJsonValue,
        status: input.status,
        discardedAt:
          input.status === 'discarded'
            ? new Date(item.updatedAt ?? Date.now())
            : null,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
        renovation: input.renovation
          ? {
              create: {
                active: input.renovation.active,
                level: input.renovation.level,
                durationMonths: input.renovation.durationMonths,
                notes: input.renovation.notes,
                items: {
                  create: input.renovation.items.map((it, position) => ({
                    label: it.label,
                    amount: dec(it.amount),
                    position,
                  })),
                },
              },
            }
          : undefined,
        rentalPlan: input.rentalPlan
          ? {
              create: {
                rentControl: input.rentalPlan.rentControl,
                referenceRentPerM2: dec(input.rentalPlan.referenceRentPerM2),
                targetRent: dec(input.rentalPlan.targetRent),
                marketRent: dec(input.rentalPlan.marketRent),
                demand: input.rentalPlan.demand,
                coOwnershipAllowsRental:
                  input.rentalPlan.coOwnershipAllowsRental,
                decencyCompliant: input.rentalPlan.decencyCompliant,
                rentalPermitRequired: input.rentalPlan.rentalPermitRequired,
                notes: input.rentalPlan.notes,
              },
            }
          : undefined,
        tasks: {
          create: item.tasks.map((task, position) => ({
            label: task.label,
            done: task.done,
            doneAt: task.done ? new Date(item.updatedAt ?? Date.now()) : null,
            origin: task.origin,
            // Lot 17 : le champ de la fiche que la tâche demande, s'il est sûr.
            field: taskFieldForLabel(task.label),
            position,
          })),
        },
        priceEvents: {
          create: {
            occurredAt: item.createdAt ? new Date(item.createdAt) : undefined,
            oldPrice: null,
            newPrice: new Prisma.Decimal(input.price),
            source: 'user',
          },
        },
        opinions: {
          create: item.opinions
            .filter(opinion => members.has(opinion.handle))
            .map(opinion => ({
              memberId: members.get(opinion.handle) as string,
              rating: opinion.rating,
              text: opinion.text,
              createdAt: opinion.date ? new Date(opinion.date) : undefined,
              updatedAt: opinion.date ? new Date(opinion.date) : undefined,
            })),
        },
        views:
          item.seenByRichardAt && richardId
            ? {
                create: {
                  memberId: richardId,
                  seenAt: new Date(item.seenByRichardAt),
                },
              }
            : undefined,
      },
    })
    // Lot 18 : le lien d'origine, comme la migration pour les annonces en base.
    const key = linkKey(input.url)
    if (input.url && key) {
      const taken = await tx.listingLink.findUnique({
        where: {
          workspaceId_normalizedUrl: { workspaceId, normalizedUrl: key },
        },
        select: { id: true },
      })
      const at = item.createdAt ? new Date(item.createdAt) : new Date()
      await tx.listingLink.create({
        data: {
          workspaceId,
          listingId: listing.id,
          portal: portalOfListingSource(
            input.source,
            input.sourceLabel,
            input.url
          ),
          url: input.url.trim(),
          normalizedUrl: taken ? `${key}#doublon-${listing.id}` : key,
          externalId: item.externalId,
          price: input.price > 0 ? new Prisma.Decimal(input.price) : null,
          priceAt: input.price > 0 ? at : null,
          firstSeenAt: at,
          origin: 'original',
          addedById: richardId ?? null,
          createdAt: at,
        },
      })
    }
    await tx.activityLog.create({
      data: {
        workspaceId,
        listingId: listing.id,
        actorMemberId: richardId ?? null,
        channel: 'import',
        action: 'listing.imported',
        after: {
          externalId: item.externalId,
          title: input.title,
          status: input.status,
        },
      },
    })
    return listing.id
  })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
