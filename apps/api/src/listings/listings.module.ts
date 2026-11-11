import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { RENTAL_CONTEXT_REFRESHER } from '../assumptions/rental-context'
import { OpendataModule } from '../opendata/opendata.module'
import { CriteriaFitController } from './criteria-fit.controller'
import { DuplicatesService } from './duplicates.service'
import { ListingEnrichmentService } from './enrichment.service'
import { ExtractionService } from './extraction.service'
import { ListingChecksController } from './listing-checks.controller'
import { ListingChecksService } from './listing-checks.service'
import { ListingLinksController } from './listing-links.controller'
import { ListingLinksService } from './listing-links.service'
import { ListingMergeController } from './listing-merge.controller'
import { ListingMergeService } from './listing-merge.service'
import { ListingSellersService } from './listing-sellers.service'
import { SimilarListingsService } from './similar-listings.service'
import { ListingsController } from './listings.controller'
import { MarketContextController } from './market-context.controller'
import { ListingsService } from './listings.service'
import { TargetPriceService } from './target-price.service'

@Module({
  imports: [AssumptionsModule, AiModule, OpendataModule],
  controllers: [
    // Lot 27 : avant ListingsController, pour que `/listings/similar` ne
    // soit pas lu comme `/listings/:id`.
    ListingMergeController,
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
    // Lot 27 : annonces ressemblantes, agences multiples, fusion.
    SimilarListingsService,
    ListingSellersService,
    ListingMergeService,
    // Lot 19 : le recalcul du plafond quand l'année ou le type de location
    // de l'espace change (lu par les hypothèses, sans import circulaire).
    {
      provide: RENTAL_CONTEXT_REFRESHER,
      useExisting: ListingEnrichmentService,
    },
  ],
  exports: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
    ListingEnrichmentService,
    ListingChecksService,
    ListingLinksService,
    SimilarListingsService,
    ListingSellersService,
    ListingMergeService,
    OpendataModule,
  ],
})
export class ListingsModule {}
