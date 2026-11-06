import { Injectable } from '@nestjs/common'
import {
  DEFAULT_REGULATORY_RULES,
  RegulatoryRulesTableSchema,
} from '@apart/contracts'
import type { ComplianceReport, RegulatoryRulesTable } from '@apart/contracts'
import {
  complianceInputFromListing,
  complianceReport,
  rentalStartDate,
} from '@apart/domain'
import { GeorisquesService } from '../opendata/georisques.service'
import { ReferenceCacheService } from '../opendata/reference-cache.service'
import type { Member } from '../generated/prisma'
import { StudyService } from './study.service'

/** La table des règles en base : `reference_data`, sorte et clé ci-dessous. */
export const REGULATORY_RULES_KIND = 'regulatory_rules'
export const REGULATORY_RULES_KEY = 'current'

/**
 * Checklist réglementaire datée d'une annonce (besoin L5) et risques
 * Géorisques à l'adresse (D6), évalués à la date de mise en location
 * prévue. La table des règles vient de `reference_data` quand une version y
 * a été déposée (et qu'elle est lisible), sinon de la table par défaut de
 * `contracts`. Le calcul est dans `domain`.
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly study: StudyService,
    private readonly georisques: GeorisquesService,
    private readonly cache: ReferenceCacheService
  ) {}

  async rules(): Promise<RegulatoryRulesTable> {
    const stored = await this.cache.get<unknown>(
      REGULATORY_RULES_KIND,
      REGULATORY_RULES_KEY
    )
    if (!stored) return DEFAULT_REGULATORY_RULES
    const parsed = RegulatoryRulesTableSchema.safeParse(stored.payload)
    return parsed.success ? parsed.data : DEFAULT_REGULATORY_RULES
  }

  async compliance(member: Member, id: string): Promise<ComplianceReport> {
    const ctx = await this.study.context(member, id)
    const listing = ctx.item.listing
    const [rules, georisques] = await Promise.all([
      this.rules(),
      this.georisques.report(listing.location.point),
    ])
    return complianceReport(
      complianceInputFromListing(
        listing,
        ctx.item.evaluation.metrics,
        ctx.assumptions
      ),
      rules,
      georisques,
      {
        // Lot 19 : l'année et le type de location de l'espace.
        rentalStartDate: rentalStartDate(null, ctx.assumptions),
        at: ctx.at,
      }
    )
  }
}
