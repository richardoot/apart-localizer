import { Module } from '@nestjs/common'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { ListingsController } from './listings.controller'
import { ListingsService } from './listings.service'

@Module({
  imports: [AssumptionsModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
