import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { OpendataModule } from '../opendata/opendata.module'
import { CriteriaMatchService } from './criteria-match.service'
import { DuplicatesService } from './duplicates.service'
import { ListingEnrichmentService } from './enrichment.service'
import { ExtractionService } from './extraction.service'
import { ListingChecksController } from './listing-checks.controller'
import { ListingChecksService } from './listing-checks.service'
import { ListingsController } from './listings.controller'
import { MarketContextController } from './market-context.controller'
import { ListingsService } from './listings.service'
import { TargetPriceService } from './target-price.service'

@Module({
  imports: [AssumptionsModule, AiModule, OpendataModule],
  controllers: [
    ListingsController,
    MarketContextController,
    ListingChecksController,
  ],
  providers: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
    CriteriaMatchService,
    ListingEnrichmentService,
    ListingChecksService,
  ],
  exports: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
    CriteriaMatchService,
    ListingEnrichmentService,
    ListingChecksService,
    OpendataModule,
  ],
})
export class ListingsModule {}
