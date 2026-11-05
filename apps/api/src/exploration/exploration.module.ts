import { Module } from '@nestjs/common'
import { ListingsModule } from '../listings/listings.module'
import { CandidateFitService } from './candidate-fit.service'
import {
  CriteriaBriefController,
  ExplorationsController,
} from './exploration.controller'
import { ExplorationTriageService } from './exploration-triage.service'
import { ExplorationsService } from './explorations.service'

/**
 * Exploration par les critères (lot 16, ADR 0026) : brief, tri des annonces
 * lues par Claude, explorations et leur compte rendu, adéquation des
 * annonces pas enregistrées (brouillons compris).
 */
@Module({
  imports: [ListingsModule],
  controllers: [ExplorationsController, CriteriaBriefController],
  providers: [
    CandidateFitService,
    ExplorationTriageService,
    ExplorationsService,
  ],
  exports: [CandidateFitService, ExplorationsService],
})
export class ExplorationModule {}
