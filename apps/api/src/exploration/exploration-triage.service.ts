import { Injectable } from '@nestjs/common'
import {
  ListingCheckPreviewRequestSchema,
  ListingInputSchema,
} from '@apart/contracts'
import type {
  CandidateTriage,
  DuplicateCandidate,
  ExplorationCandidate,
  ExplorationCheck,
  ExplorationDismissal,
  ListingInput,
  ListingObserved,
  ListingPlacement,
} from '@apart/contracts'
import {
  candidateObserved,
  candidateTriage,
  dedupeCandidates,
  draftInputFromCandidate,
  isAddressPrecision,
  normalizeListingUrl,
} from '@apart/domain'
import type { SameUrlDraft, SameUrlListing, TriageFacts } from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { ListingAreaRef } from '../geo/geo.service'
import { probeFromInput } from '../listings/duplicates.service'
import { matchDuplicates } from '../listings/duplicates'
import type { DuplicateRow } from '../listings/duplicates'
import { num } from '../listings/listing.mapper'
import { ListingChecksService } from '../listings/listing-checks.service'
import { applyLocated, withOpenDataProvenance } from '../listings/location'
import { GeocodingService } from '../opendata/geocoding.service'
import { PrismaService } from '../prisma/prisma.service'
import type { Member } from '../generated/prisma'
import { CandidateFitService } from './candidate-fit.service'
import type { CandidateFitContext } from './candidate-fit.service'
import { DUPLICATE_TOLERANCES } from '@apart/contracts'

/** Au-delà de ce score, un doublon probable d'une annonce écartée la fait reconnaître comme écartée. */
export const DISMISSED_LOOKALIKE_MIN_SCORE = 0.8

/** Géocodages menés de front (cache en base ; le réseau seulement pour une adresse nouvelle). */
const LOCATE_CONCURRENCY = 5

/** Une annonce lue, triée, avec ce qu'il faut pour l'enregistrer. */
export interface TriagedCandidate {
  candidate: ExplorationCandidate
  triage: CandidateTriage
  /** La fiche d'un brouillon (nouvelle ou doublon probable), localisée. */
  draft: {
    input: ListingInput
    warnings: string[]
    placement: ListingPlacement | null
  } | null
  /** La vérification à appliquer à l'annonce suivie au même lien. */
  observed: ListingObserved | null
  /** Le garde-fou de cette vérification (`updatedAt` lu au tri). */
  expectedUpdatedAt: string | null
}

export interface TriageRun {
  items: TriagedCandidate[]
  /** Liens envoyés deux fois, comptés une seule. */
  dropped: number
  activeCriteria: { id: string; name: string }[]
}

/** Un traitement par élément, au plus `limit` à la fois, dans l'ordre. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index] as T, index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  )
  return results
}

/**
 * Le tri des annonces lues par Claude sur les portails (lot 16, ADR 0026) :
 * les faits viennent de la base (annonces et brouillons au même lien,
 * doublons probables, adéquation aux critères, vérification à blanc d'une
 * annonce suivie), la décision de `domain` (`candidateTriage`). Rien n'est
 * écrit ; le géocodage passe par le cache existant (lot 12) ; aucune page
 * n'est téléchargée.
 */
@Injectable()
export class ExplorationTriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly geocoding: GeocodingService,
    private readonly fit: CandidateFitService,
    private readonly checks: ListingChecksService
  ) {}

  async triage(
    member: Member,
    candidates: readonly ExplorationCandidate[],
    now: Date = new Date()
  ): Promise<TriageRun> {
    const workspaceId = member.workspaceId
    const { kept, dropped } = dedupeCandidates(candidates)
    const [listings, drafts, members, context] = await Promise.all([
      this.prisma.listing.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          status: true,
          url: true,
          discardReason: true,
          discardedAt: true,
          price: true,
          surface: true,
          commune: true,
          addressRaw: true,
          addressNormalized: true,
        },
      }),
      this.prisma.listingDraft.findMany({
        where: { workspaceId },
        select: {
          id: true,
          status: true,
          url: true,
          listingId: true,
          input: true,
          dismissReason: true,
          decidedAt: true,
          decidedById: true,
        },
      }),
      this.prisma.member.findMany({
        where: { workspaceId },
        select: { id: true, displayName: true },
      }),
      this.fit.context(workspaceId),
    ])
    const names = new Map(members.map(m => [m.id, m.displayName]))
    const byId = new Map(listings.map(l => [l.id, l]))
    const sameUrl = new Map<string, SameUrlListing | SameUrlDraft>()
    const listingRef = (l: (typeof listings)[number]): SameUrlListing => ({
      kind: 'listing',
      listing: {
        id: l.id,
        title: l.title,
        status: l.status,
        discardReason: l.discardReason,
        discardedAt: l.discardedAt?.toISOString() ?? null,
      },
    })
    for (const l of listings) {
      const key = normalizeListingUrl(l.url)
      if (key && !sameUrl.has(key)) sameUrl.set(key, listingRef(l))
    }
    const titleOf = (input: unknown): string => {
      const parsed = ListingInputSchema.safeParse(input)
      return parsed.success ? parsed.data.title : 'Annonce à valider'
    }
    // Un brouillon tranché renvoie à son annonce ; un écarté passe avant un en attente.
    const ordered = [...drafts].sort(
      (a, b) => draftPriority(a.status) - draftPriority(b.status)
    )
    for (const d of ordered) {
      const key = normalizeListingUrl(d.url)
      if (!key || sameUrl.has(key)) continue
      const linked = d.listingId ? byId.get(d.listingId) : undefined
      if ((d.status === 'accepted' || d.status === 'merged') && linked) {
        sameUrl.set(key, listingRef(linked))
      } else if (d.status === 'pending' || d.status === 'dismissed') {
        sameUrl.set(key, {
          kind: 'draft',
          draftId: d.id,
          status: d.status,
          title: titleOf(d.input),
          reason: d.dismissReason,
          decidedAt: d.decidedAt?.toISOString() ?? null,
          decidedBy: d.decidedById ? (names.get(d.decidedById) ?? null) : null,
        })
      }
    }
    const listingRows: DuplicateRow[] = listings.map(l => ({
      id: l.id,
      title: l.title,
      status: l.status,
      price: Number(l.price),
      surface: num(l.surface),
      commune: l.commune,
      url: l.url,
      addressRaw: l.addressRaw,
      addressNormalized: l.addressNormalized,
    }))
    const dismissedDrafts = drafts.filter(d => d.status === 'dismissed')
    const draftRows: DuplicateRow[] = dismissedDrafts.flatMap(d => {
      const parsed = ListingInputSchema.safeParse(d.input)
      if (!parsed.success) return []
      const input = parsed.data
      return [
        {
          id: d.id,
          title: input.title,
          status: 'discarded' as const,
          price: input.price,
          surface: input.surface,
          commune: input.location.commune,
          url: d.url,
          addressRaw: input.location.addressRaw,
          addressNormalized: input.location.addressNormalized,
        },
      ]
    })
    const draftsById = new Map(dismissedDrafts.map(d => [d.id, d]))

    const prepared = await mapLimit(kept, LOCATE_CONCURRENCY, async entry => {
      const same = entry.normalizedUrl
        ? (sameUrl.get(entry.normalizedUrl) ?? null)
        : null
      const decidedByUrl =
        same?.kind === 'listing' ||
        (same?.kind === 'draft' && same.status === 'dismissed')
      const base = draftInputFromCandidate(entry.candidate, now)
      if (decidedByUrl) {
        return {
          entry,
          same,
          input: base.input,
          warnings: base.warnings,
          area: null,
          placement: null,
        }
      }
      const located = await this.geocoding.locate(base.input.location, {
        at: now,
      })
      if (!located) {
        return {
          entry,
          same,
          input: base.input,
          warnings: base.warnings,
          area: null as ListingAreaRef | null,
          placement: null as ListingPlacement | null,
        }
      }
      const applied = applyLocated(base.input.location, located)
      const input: ListingInput = {
        ...base.input,
        location: applied.location,
        fieldSources: withOpenDataProvenance(
          base.input.fieldSources,
          applied.keys,
          now
        ),
      }
      return {
        entry,
        same,
        input,
        warnings: base.warnings,
        area: applied.area,
        placement: applied.placement,
      }
    })

    const fits = await this.fit.fits(
      workspaceId,
      prepared.map(p => ({
        key: String(p.entry.index),
        listing: p.input,
        area: p.area,
      })),
      context
    )

    const items: TriagedCandidate[] = []
    for (const p of prepared) {
      const { candidate, index, normalizedUrl } = p.entry
      let check: ExplorationCheck | null = null
      let observed: ListingObserved | null = null
      let expectedUpdatedAt: string | null = null
      let duplicates: DuplicateCandidate[] = []
      const lookalikes: ExplorationDismissal[] = []
      if (p.same?.kind === 'listing' && p.same.listing.status !== 'discarded') {
        observed = candidateObserved(candidate)
        const preview = await this.checks.preview(
          member,
          p.same.listing.id,
          ListingCheckPreviewRequestSchema.parse({ observed }),
          'mcp'
        )
        expectedUpdatedAt = preview.guards.expectedUpdatedAt
        check = {
          outcome: preview.outcome,
          summary: preview.summary,
          changes: preview.changes,
          problem: preview.problem,
          checkId: null,
        }
      } else if (p.same === null || p.same.kind === 'draft') {
        const probe = probeFromInput(p.input)
        const distances = new Map<string, number>()
        const point = p.input.location.point
        if (point && isAddressPrecision(p.input.location.precision)) {
          const [longitude, latitude] = point.coordinates
          const nearby = await this.geo.listingsWithinRadius(workspaceId, {
            longitude,
            latitude,
            radiusMeters: DUPLICATE_TOLERANCES.nearbyMeters,
          })
          for (const row of nearby) distances.set(row.id, row.distance_meters)
        }
        const found = matchDuplicates(probe, listingRows, distances).filter(
          d => !d.reasons.every(r => r.kind === 'same_url')
        )
        duplicates = found.filter(d => d.status !== 'discarded')
        for (const d of found) {
          if (
            d.status !== 'discarded' ||
            d.score < DISMISSED_LOOKALIKE_MIN_SCORE
          )
            continue
          const row = byId.get(d.listingId)
          lookalikes.push({
            kind: 'listing',
            id: d.listingId,
            title: d.title,
            match: 'duplicate',
            reason: row?.discardReason ?? null,
            at: row?.discardedAt?.toISOString() ?? null,
            by: null,
          })
        }
        for (const d of matchDuplicates(probe, draftRows)) {
          if (d.score < DISMISSED_LOOKALIKE_MIN_SCORE) continue
          const row = draftsById.get(d.listingId)
          if (row && normalizeListingUrl(row.url) === normalizedUrl) continue
          lookalikes.push({
            kind: 'draft',
            id: d.listingId,
            title: d.title,
            match: 'duplicate',
            reason: row?.dismissReason ?? null,
            at: row?.decidedAt?.toISOString() ?? null,
            by: row?.decidedById ? (names.get(row.decidedById) ?? null) : null,
          })
        }
      }
      const facts: TriageFacts = {
        index,
        candidate,
        normalizedUrl,
        sameUrl: p.same,
        check,
        duplicates,
        lookalikes,
        fit: fits.get(String(index)) as TriageFacts['fit'],
      }
      const triage = candidateTriage(facts)
      const makesDraft =
        (triage.outcome === 'new' || triage.outcome === 'duplicate_probable') &&
        !triage.alreadyPending
      items.push({
        candidate,
        triage,
        draft: makesDraft
          ? { input: p.input, warnings: p.warnings, placement: p.placement }
          : null,
        observed,
        expectedUpdatedAt,
      })
    }
    return {
      items,
      dropped,
      activeCriteria: context.rules.map(r => ({ id: r.id, name: r.name })),
    }
  }

  /** Les règles et hypothèses lues pour le tri (réutilisées par l'appelant). */
  context(workspaceId: string): Promise<CandidateFitContext> {
    return this.fit.context(workspaceId)
  }
}

/** L'ordre de lecture des brouillons : tranchés, écartés, puis en attente. */
function draftPriority(status: string): number {
  if (status === 'accepted' || status === 'merged') return 0
  if (status === 'dismissed') return 1
  return 2
}
