import { Module } from '@nestjs/common'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { ListingsModule } from '../listings/listings.module'
import { ComplianceService } from './compliance.service'
import { RentComparablesService } from './rent-comparables.service'
import { ScenariosController } from './scenarios.controller'
import { ScenariosService } from './scenarios.service'
import { StudyController } from './study.controller'
import { StudyService } from './study.service'

/**
 * Phase 1 et phase 2 avancées (lot 5) : coût d'occupation, scénarios « et
 * si », fiscalité et projection jusqu'à la revente, loyer de marché par
 * comparables, checklist réglementaire et Géorisques. Les calculs sont dans
 * `domain` ; Géorisques et le cache viennent du module opendata (réexporté
 * par listings).
 */
@Module({
  imports: [ListingsModule, AssumptionsModule],
  controllers: [StudyController, ScenariosController],
  providers: [
    StudyService,
    ScenariosService,
    RentComparablesService,
    ComplianceService,
  ],
  exports: [
    StudyService,
    ScenariosService,
    RentComparablesService,
    ComplianceService,
  ],
})
export class StudyModule {}
