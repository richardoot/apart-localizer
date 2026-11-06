import { ConflictException } from '@nestjs/common'
import type {
  ActivityChannel,
  EvaluatedListing,
  FieldProvenanceMap,
  FieldSource,
  ListingPortal,
} from '@apart/contracts'
import {
  normalizeSeller,
  portalWhere,
  primaryLink,
  primarySourceFields,
} from '@apart/domain'
import type {
  LinkCheckDiff,
  LinkPatch,
  ListingCheckPatch,
  SellerFacts,
} from '@apart/domain'
import { Prisma } from '../generated/prisma'
import { linkStateOf } from './listing.mapper'

/**
 * Les écritures partagées des liens d'une annonce (lot 18, ADR 0028), dans
 * une transaction : recopier le lien principal dans l'annonce, écrire ce
 * qu'une vérification d'un lien a lu (faits de la fiche, prix de la fiche,
 * vendeur, état du lien), refuser une URL déjà rattachée à une autre annonce.
 * Fonctions sans état, partagées par les vérifications (lot 15) et les liens.
 */

export type Tx = Prisma.TransactionClient

/**
 * Une ligne de l'historique des prix : ancien et nouveau prix, source
 * (`listing` quand le portail affiche le nouveau prix). Partagée par
 * `recordPriceChange`, la vérification d'une annonce (lot 15) et les liens
 * (lot 18), pour que le brief de négociation lise les mêmes baisses.
 */
export function priceEventData(
  listingId: string,
  oldPrice: number | null,
  newPrice: number,
  source: FieldSource,
  occurredAt?: Date
): Prisma.PriceEventUncheckedCreateInput {
  return {
    listingId,
    ...(occurredAt ? { occurredAt } : {}),
    oldPrice: oldPrice === null ? null : new Prisma.Decimal(oldPrice),
    newPrice: new Prisma.Decimal(newPrice),
    source,
  }
}

/** « Lue sur SeLoger par Claude », « Lue dans une alerte e-mail » : la provenance d'un fait lu sur un lien. */
export function readingEvidence(
  portal: ListingPortal | null,
  channel: ActivityChannel
): string {
  const where = portal ? portalWhere(portal) : 'sur la page'
  if (channel === 'mcp') return `Lue ${where} par Claude`
  if (channel === 'system') return 'Lue dans une alerte e-mail'
  return `Lue ${where}`
}

/** Les champs écrits prennent la provenance « lue dans l'annonce », avec d'où. */
export function withListingProvenance(
  existing: FieldProvenanceMap,
  keys: readonly string[],
  now: Date,
  evidence: string | null = null
): FieldProvenanceMap {
  const result: FieldProvenanceMap = { ...existing }
  for (const key of keys) {
    result[key] = {
      source: 'listing',
      recordedAt: now.toISOString(),
      ...(evidence ? { evidence } : {}),
    }
  }
  return result
}

/** Les faits d'une vérification en colonnes Prisma. */
export function patchData(
  patch: ListingCheckPatch
): Prisma.ListingUncheckedUpdateInput {
  const data: Prisma.ListingUncheckedUpdateInput = {}
  const decimal = (value: number) => new Prisma.Decimal(value)
  if (patch.price !== undefined) data.price = decimal(patch.price)
  if (patch.annualCharges !== undefined)
    data.annualCharges = decimal(patch.annualCharges)
  if (patch.propertyTax !== undefined)
    data.propertyTax = decimal(patch.propertyTax)
  if (patch.surface !== undefined) data.surface = decimal(patch.surface)
  if (patch.rooms !== undefined) data.rooms = patch.rooms
  if (patch.dpeClass !== undefined) data.dpeClass = patch.dpeClass
  if (patch.gesClass !== undefined) data.gesClass = patch.gesClass
  if (patch.dpeConsumption !== undefined)
    data.dpeConsumption = patch.dpeConsumption
  if (patch.description !== undefined) data.description = patch.description
  if (patch.publishedAt !== undefined)
    data.publishedAt = new Date(patch.publishedAt)
  if (patch.sourceUpdatedAt !== undefined)
    data.sourceUpdatedAt = new Date(patch.sourceUpdatedAt)
  if (patch.url !== undefined) data.url = patch.url
  return data
}

/** Le vendeur après une écriture, en colonnes (nom, référence et sa clé normalisés). */
export function sellerData(
  current: SellerFacts,
  patch: Partial<SellerFacts>
): Prisma.ListingUncheckedUpdateInput {
  if (Object.keys(patch).length === 0) return {}
  const next = normalizeSeller({ ...current, ...patch })
  return {
    sellerType: next.sellerType,
    sellerName: next.sellerName,
    sellerReference: next.sellerReference,
    sellerReferenceKey: next.sellerReferenceKey,
  }
}

/** Ce qu'une vérification écrit dans un lien. */
export function linkPatchData(
  patch: LinkPatch,
  now: Date | null
): Prisma.ListingLinkUncheckedUpdateInput {
  const data: Prisma.ListingLinkUncheckedUpdateInput = now
    ? { lastCheckedAt: now }
    : {}
  if (patch.price !== undefined) data.price = new Prisma.Decimal(patch.price)
  if (patch.priceAt !== undefined) data.priceAt = new Date(patch.priceAt)
  if (patch.offlineSince !== undefined) {
    data.offlineSince =
      patch.offlineSince === null ? null : new Date(patch.offlineSince)
  }
  if (patch.lastSeenOnlineAt !== undefined)
    data.lastSeenOnlineAt = new Date(patch.lastSeenOnlineAt)
  if (patch.url !== undefined) data.url = patch.url
  if (patch.normalizedUrl !== undefined)
    data.normalizedUrl = patch.normalizedUrl
  if (patch.readSellerName !== undefined)
    data.readSellerName = patch.readSellerName
  if (patch.readReference !== undefined)
    data.readReference = patch.readReference
  return data
}

/**
 * Recopie le lien principal (le plus ancien en ligne, à défaut le plus
 * ancien) dans `listings.url`, `source`, `source_label` (Logic-Immo) et
 * `external_id`, seulement s'il change. Sans lien : l'URL est vidée.
 * Rend vrai si l'annonce a été réécrite.
 */
export async function syncPrimaryLink(
  tx: Tx,
  listingId: string
): Promise<boolean> {
  const [listing, links] = await Promise.all([
    tx.listing.findUniqueOrThrow({
      where: { id: listingId },
      select: { url: true, source: true, sourceLabel: true, externalId: true },
    }),
    tx.listingLink.findMany({ where: { listingId } }),
  ])
  const states = links.map(linkStateOf)
  const primary = primaryLink(states)
  if (!primary) {
    if (listing.url === null && listing.externalId === null) return false
    await tx.listing.update({
      where: { id: listingId },
      data: { url: null, externalId: null },
    })
    return true
  }
  const next = primarySourceFields(primary, {
    sourceLabel: listing.sourceLabel,
  })
  if (
    next.url === listing.url &&
    next.source === listing.source &&
    next.sourceLabel === listing.sourceLabel &&
    next.externalId === listing.externalId
  ) {
    return false
  }
  await tx.listing.update({ where: { id: listingId }, data: next })
  return true
}

/**
 * Refuse une URL déjà rattachée à une autre annonce de l'espace, avec le nom
 * de cette annonce ; rend le lien s'il est déjà celui de cette annonce.
 */
export async function assertLinkFree(
  tx: Tx,
  workspaceId: string,
  normalizedUrl: string,
  listingId: string | null
): Promise<{ id: string } | null> {
  const existing = await tx.listingLink.findUnique({
    where: { workspaceId_normalizedUrl: { workspaceId, normalizedUrl } },
    select: { id: true, listingId: true, listing: { select: { title: true } } },
  })
  if (!existing) return null
  if (listingId !== null && existing.listingId === listingId) {
    return { id: existing.id }
  }
  throw new ConflictException(
    `Ce lien est déjà celui de l’annonce « ${existing.listing.title} » [id ${existing.listingId}] : une même URL ne peut pas être sur deux fiches. Ouvrez cette annonce, ou ajoutez-y ce lien si c'est la même.`
  )
}

/** Ce que l'écriture d'une vérification sur un lien a changé. */
export interface CheckFactsWrite {
  listingId: string
  item: EvaluatedListing
  diff: LinkCheckDiff
  applyFacts: boolean
  seenOnline: boolean
  now: Date
  channel: ActivityChannel
  /** Le lien vérifié (peut avoir été créé dans la même transaction). */
  linkId: string | null
  portal: ListingPortal | null
  /** Une autre écriture touche la fiche (republication rattachée). */
  alsoTouches?: Prisma.ListingUncheckedUpdateInput
  /**
   * Faux pour un lien collé sans être ouvert : rien n'a été vérifié, les
   * dates de vérification ne bougent pas (l'annonce reste « à revérifier »).
   */
  checked?: boolean
}

/**
 * Écrit ce qu'une vérification a lu : les faits de la fiche (prix de la
 * fiche compris, par l'historique des prix, source « annonce »), le vendeur
 * lu s'il était inconnu, l'état du lien vérifié et sa date, les dates de la
 * fiche, puis recopie le lien principal. Une vérification qui ne change
 * aucun fait garde `updatedAt` : elle ne « modifie » pas la fiche.
 */
export async function writeCheckFacts(
  tx: Tx,
  w: CheckFactsWrite
): Promise<{ touched: boolean }> {
  const patch: ListingCheckPatch = w.applyFacts ? w.diff.patch : {}
  const sellerPatch = w.applyFacts ? w.diff.sellerPatch : {}
  const evidence = readingEvidence(w.portal, w.channel)
  const keys = [...Object.keys(patch), ...Object.keys(sellerPatch)]
  const seller: SellerFacts = {
    sellerType: w.item.listing.sellerType,
    sellerName: w.item.listing.sellerName,
    sellerReference: w.item.listing.sellerReference,
  }
  const extra = w.alsoTouches ?? {}
  const checked = w.checked ?? true
  const touches = keys.length > 0 || Object.keys(extra).length > 0
  await tx.listing.update({
    where: { id: w.listingId },
    data: {
      ...patchData(patch),
      ...sellerData(seller, sellerPatch),
      ...(keys.length > 0
        ? {
            fieldSources: withListingProvenance(
              w.item.listing.fieldSources,
              keys,
              w.now,
              evidence
            ) as Prisma.InputJsonValue,
          }
        : {}),
      ...extra,
      ...(checked ? { lastCheckedAt: w.now } : {}),
      ...(w.seenOnline ? { lastSeenOnlineAt: w.now } : {}),
      // Une vérification qui ne change aucun fait ne « modifie » pas la
      // fiche : les garde-fous des autres lecteurs restent valables.
      ...(touches ? {} : { updatedAt: new Date(w.item.listing.updatedAt) }),
    },
  })
  if (w.diff.price && w.applyFacts) {
    await tx.priceEvent.create({
      data: priceEventData(
        w.listingId,
        w.diff.price.from,
        w.diff.price.to,
        'listing',
        w.now
      ),
    })
  }
  let linkTouched = false
  if (w.linkId) {
    const linkPatch: LinkPatch = w.applyFacts ? w.diff.linkPatch : {}
    await tx.listingLink.update({
      where: { id: w.linkId },
      data: linkPatchData(linkPatch, checked ? w.now : null),
    })
    linkTouched = linkPatch.online !== undefined || linkPatch.url !== undefined
  }
  const primaryChanged = linkTouched
    ? await syncPrimaryLink(tx, w.listingId)
    : false
  return { touched: touches || primaryChanged }
}
