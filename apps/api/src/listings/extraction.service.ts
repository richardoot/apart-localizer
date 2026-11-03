import { Injectable } from '@nestjs/common'
import { missingListingFields } from '@apart/contracts'
import type {
  ActivityChannel,
  ExtractionRequest,
  ExtractionResult,
} from '@apart/contracts'
import { ActivityService } from '../activity/activity.service'
import { AiService } from '../ai/ai.service'
import { extractionToListing } from '../ai/extraction.mapper'
import { GeocodingService } from '../opendata/geocoding.service'
import type { Member } from '../generated/prisma'
import { DuplicatesService } from './duplicates.service'
import { applyLocated, withOpenDataProvenance } from './location'

/**
 * L'extraction de bout en bout, sans écriture d'annonce : le modèle lit,
 * le mappeur traduit vers le contrat, le géocodeur place l'adresse, le
 * service de doublons compare, les champs indispensables manquants sont
 * listés ; le coût est journalisé. La fiche revient au client pour
 * validation ; `POST /listings` fait la création.
 */
@Injectable()
export class ExtractionService {
  constructor(
    private readonly ai: AiService,
    private readonly geocoding: GeocodingService,
    private readonly duplicates: DuplicatesService,
    private readonly activity: ActivityService
  ) {}

  async extract(
    member: Member,
    request: ExtractionRequest,
    channel: ActivityChannel = 'web'
  ): Promise<ExtractionResult> {
    const { raw, usage } = await this.ai.extractListing(request)
    const mapped = extractionToListing(raw, {
      url: request.url,
      sourceText: request.text,
    })
    let listing = mapped.listing
    let geocoded = false
    if (listing.location.addressRaw || listing.location.commune) {
      const located = await this.geocoding.locate(listing.location)
      if (located) {
        const { location, keys } = applyLocated(listing.location, located)
        listing = {
          ...listing,
          location,
          fieldSources: withOpenDataProvenance(listing.fieldSources, keys),
        }
        geocoded = true
      }
    }
    const duplicates = await this.duplicates.findForInput(member, listing)
    const missingFields = missingListingFields(listing)
    await this.activity.record({
      workspaceId: member.workspaceId,
      actorMemberId: member.id,
      channel,
      action: 'ai.extraction',
      after: {
        ...usage,
        quality: request.quality,
        textChars: request.text?.length ?? 0,
        imageCount: request.images.length,
        url: request.url,
        geocoded,
        duplicates: duplicates.length,
        missingFields: missingFields.length,
        warnings: mapped.warnings.length,
      },
    })
    return {
      listing,
      missingFields,
      duplicates,
      warnings: mapped.warnings,
      geocoded,
      usage,
      persisted: false,
    }
  }
}
