import { Module } from '@nestjs/common'
import { ListingsModule } from '../listings/listings.module'
import { SearchCriteriaController } from './search-criteria.controller'
import { SearchCriteriaService } from './search-criteria.service'

/** Critères de recherche enregistrés et partagés (besoins G3 à G6). */
@Module({
  imports: [ListingsModule],
  controllers: [SearchCriteriaController],
  providers: [SearchCriteriaService],
  exports: [SearchCriteriaService],
})
export class SearchCriteriaModule {}
