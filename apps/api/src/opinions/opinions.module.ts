import { Module } from '@nestjs/common'
import { OpinionsController } from './opinions.controller'
import { OpinionsService } from './opinions.service'
import { OpinionCriteriaController } from './opinion-criteria.controller'
import { OpinionCriteriaService } from './opinion-criteria.service'

@Module({
  controllers: [OpinionsController, OpinionCriteriaController],
  providers: [OpinionsService, OpinionCriteriaService],
  exports: [OpinionsService, OpinionCriteriaService],
})
export class OpinionsModule {}
