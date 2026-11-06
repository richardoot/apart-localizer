import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { OpendataModule } from '../opendata/opendata.module'
import { CriteriaFitController } from './criteria-fit.controller'
import { DuplicatesService } from './duplicates.service'
import { ListingEnrichmentService } from './enrichment.service'
import { ExtractionService } from './extraction.service'
import { ListingChecksController } from './listing-checks.controller'
import { ListingChecksService } from './listing-checks.service'
import { ListingLinksController } from './listing-links.controller'
import { ListingLinksService } from './listing-links.service'
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
    ListingLinksController,
    CriteriaFitController,
  ],
  providers: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
    ListingEnrichmentService,
    ListingChecksService,
    ListingLinksService,
  ],
  exports: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
    ListingEnrichmentService,
    ListingChecksService,
    ListingLinksService,
    OpendataModule,
  ],
})
export class ListingsModule {}
