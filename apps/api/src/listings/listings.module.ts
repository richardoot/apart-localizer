import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { OpendataModule } from '../opendata/opendata.module'
import { DuplicatesService } from './duplicates.service'
import { ExtractionService } from './extraction.service'
import { ListingsController } from './listings.controller'
import { ListingsService } from './listings.service'
import { TargetPriceService } from './target-price.service'

@Module({
  imports: [AssumptionsModule, AiModule, OpendataModule],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
  ],
  exports: [
    ListingsService,
    DuplicatesService,
    ExtractionService,
    TargetPriceService,
  ],
})
export class ListingsModule {}
