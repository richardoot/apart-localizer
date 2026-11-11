import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  INBOUND_EMAIL_MAX_LISTINGS,
  ListingInputSchema,
  normalizeUrl,
  parseAlertEmail,
} from '@apart/contracts'
import type {
  AlertCandidate,
  DraftExtractor,
  DuplicateCandidate,
  InboundEmail,
  InboundEmailResult,
  ListingInput,
} from '@apart/contracts'
import {
  detectLinkPortal,
  referenceMatchOf,
  sameUrlMatchOf,
} from '@apart/domain'
import { ActivityService } from '../activity/activity.service'
import { AiService } from '../ai/ai.service'
import { DuplicatesService } from '../listings/duplicates.service'
import { ExtractionService } from '../listings/extraction.service'
import { ListingLinksService } from '../listings/listing-links.service'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '../generated/prisma'

interface DraftCandidate {
  input: ListingInput
  duplicates: DuplicateCandidate[]
  warnings: string[]
  extractedBy: DraftExtractor
  url: string
}

/**
 * La fiche que l'analyseur simple tire d'une annonce de l'alerte, sans IA :
 * lien, portail, titre, et ce que le texte dit explicitement (prix, surface,
 * pièces, commune), en provenance « annonce » avec l'extrait.
 */
export function parserDraft(
  candidate: AlertCandidate,
  subject: string
): { input: ListingInput; warnings: string[] } {
  const evidence = candidate.snippet.slice(0, 300)
  const provenance = { source: 'listing' as const, confidence: 0.6, evidence }
  const fieldSources: Record<string, typeof provenance> = {}
  if (candidate.price !== null) fieldSources.price = provenance
  if (candidate.surface !== null) fieldSources.surface = provenance
  if (candidate.rooms !== null) fieldSources.rooms = provenance
  if (candidate.commune !== null) fieldSources.commune = provenance
  const warnings = [
    'Lu par l’analyseur simple (IA non configurée ou indisponible) : vérifie chaque champ.',
    ...(candidate.price === null ? ['Prix à compléter.'] : []),
  ]
  const input = ListingInputSchema.parse({
    title: candidate.title ?? (subject.trim() || `Annonce ${candidate.source}`),
    source: candidate.source,
    url: candidate.url,
    price: candidate.price ?? 0,
    surface: candidate.surface,
    rooms: candidate.rooms,
    location: { commune: candidate.commune },
    sourceText: candidate.snippet,
    fieldSources,
  })
  return { input, warnings }
}

/**
 * Les alertes e-mail transférées (besoin C9) : les annonces repérées dans
 * l'e-mail deviennent des brouillons « à valider », lues par l'IA si elle
 * est configurée (modèle économique, une extraction par annonce), sinon par
 * l'analyseur simple ; doublons signalés ; un brouillon par lien (une alerte
 * reçue deux fois n'en crée pas deux) ; les membres sont prévenus. Rien
 * n'est téléchargé : seul le contenu de l'e-mail est lu.
 */
@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ai: AiService,
    private readonly extraction: ExtractionService,
    private readonly duplicates: DuplicatesService,
    private readonly links: ListingLinksService
  ) {}

  async receive(
    workspaceId: string,
    email: InboundEmail
  ): Promise<InboundEmailResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    })
    if (!workspace) throw new NotFoundException('Espace introuvable')
    const candidates = parseAlertEmail(email, INBOUND_EMAIL_MAX_LISTINGS)
    const pending = await this.prisma.listingDraft.findMany({
      // Lot 18 : un lien déjà rattaché (brouillon reconnu) ne revient pas.
      where: {
        workspaceId,
        status: { in: ['pending', 'merged'] },
        url: { not: null },
      },
      select: { url: true },
    })
    const known = new Set(pending.map(d => normalizeUrl(d.url)))
    const fresh = candidates.filter(c => !known.has(normalizeUrl(c.url)))
    const extractedBy: DraftExtractor = this.ai.enabled ? 'ai' : 'parser'
    const drafts: DraftCandidate[] = []
    for (const candidate of fresh) {
      drafts.push(await this.read(workspaceId, candidate, email.subject))
    }
    const receivedAt = email.receivedAt
      ? new Date(email.receivedAt)
      : new Date()
    // Lot 18 : même agence et même référence qu'une annonce suivie (sous un
    // autre lien) : le lien est rattaché d'office à sa fiche, comme à
    // l'exploration ; « Ce n'est pas la même » le détache.
    const attachTo = (draft: DraftCandidate) =>
      sameUrlMatchOf(draft.duplicates)
        ? null
        : referenceMatchOf(
            draft.duplicates.filter(
              d => d.status !== 'discarded' && d.status !== 'sold_or_withdrawn'
            )
          )
    const now = new Date()
    const { ids, attached } = await this.prisma.$transaction(async tx => {
      const created: string[] = []
      const attached: {
        draftId: string
        listingId: string
        draft: DraftCandidate
      }[] = []
      for (const draft of drafts) {
        const target = attachTo(draft)
        const row = await tx.listingDraft.create({
          data: {
            workspaceId,
            origin: 'email',
            extractedBy: draft.extractedBy,
            input: draft.input as unknown as Prisma.InputJsonValue,
            duplicates: draft.duplicates as unknown as Prisma.InputJsonValue,
            warnings: draft.warnings,
            url: draft.url,
            emailSubject: email.subject.slice(0, 300) || null,
            emailFrom: email.from?.slice(0, 320) ?? null,
            receivedAt,
            ...(target
              ? {
                  status: 'merged' as const,
                  listingId: target.listingId,
                  attachedAt: now,
                  decidedAt: now,
                }
              : {}),
          },
          select: { id: true },
        })
        if (target) {
          attached.push({ draftId: row.id, listingId: target.listingId, draft })
        } else {
          created.push(row.id)
        }
      }
      await this.activity.record(
        {
          workspaceId,
          channel: 'system',
          action: 'draft.received',
          after: {
            subject: email.subject.slice(0, 300),
            candidates: candidates.length,
            created: created.length,
            skipped: candidates.length - fresh.length,
            extractedBy,
            draftIds: created,
            attached: attached.length,
          },
        },
        tx
      )
      return { ids: created, attached }
    })
    // Chaque rattachement dans sa transaction (lien, vérification, journal) ;
    // refusé (vendeur qui contredit, lien pris), le brouillon reste à valider.
    let attachedCount = 0
    for (const a of attached) {
      const input = a.draft.input
      try {
        const result = await this.links.add(
          { workspaceId, id: null },
          a.listingId,
          {
            url: a.draft.url,
            portal: detectLinkPortal(a.draft.url),
            online: true,
            ...(input.price > 0 ? { price: input.price } : {}),
            ...(input.sellerType !== 'unknown'
              ? { sellerType: input.sellerType }
              : {}),
            ...(input.sellerName ? { sellerName: input.sellerName } : {}),
            ...(input.sellerReference
              ? { reference: input.sellerReference }
              : {}),
            evidence: `Vue dans une alerte e-mail${email.subject ? ` (« ${email.subject.slice(0, 120)} »)` : ''}`,
          },
          {
            channel: 'system',
            origin: 'email',
            auto: true,
            draftId: a.draftId,
            strictSeller: true,
          }
        )
        await this.prisma.listingDraft.update({
          where: { id: a.draftId },
          data: {
            attachedLinkId: result.link?.id ?? null,
            mergedCheckId: result.check?.id ?? null,
          },
        })
        attachedCount += 1
      } catch (error) {
        this.logger.warn(
          `Rattachement d'une alerte refusé, brouillon à valider : ${error instanceof Error ? error.message : 'inconnu'}`
        )
        await this.prisma.listingDraft.update({
          where: { id: a.draftId },
          data: {
            status: 'pending',
            listingId: null,
            attachedAt: null,
            decidedAt: null,
          },
        })
        ids.push(a.draftId)
      }
    }
    return {
      candidates: candidates.length,
      created: ids.length,
      skipped: candidates.length - fresh.length,
      draftIds: ids,
      extractedBy,
      attached: attachedCount,
    }
  }

  private async read(
    workspaceId: string,
    candidate: AlertCandidate,
    subject: string
  ): Promise<DraftCandidate> {
    if (this.ai.enabled) {
      try {
        const result = await this.extraction.extract(
          { workspaceId, id: null },
          {
            text: [subject, candidate.snippet].filter(Boolean).join('\n'),
            url: candidate.url,
            images: [],
            quality: 'fast',
          },
          'system'
        )
        return {
          input: result.listing,
          duplicates: result.duplicates,
          warnings: result.warnings,
          extractedBy: 'ai',
          url: candidate.url,
        }
      } catch (error) {
        this.logger.warn(
          `Extraction IA d'une alerte en échec, repli sur l'analyseur simple : ${error instanceof Error ? error.message : 'inconnu'}`
        )
      }
    }
    const { input, warnings } = parserDraft(candidate, subject)
    const duplicates = await this.duplicates.findForInput(
      { workspaceId },
      input
    )
    return {
      input,
      duplicates,
      warnings,
      extractedBy: 'parser',
      url: candidate.url,
    }
  }
}
