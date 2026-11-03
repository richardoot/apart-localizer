import { Module } from '@nestjs/common'
import { AssumptionsController } from './assumptions.controller'
import { AssumptionsService } from './assumptions.service'

@Module({
  controllers: [AssumptionsController],
  providers: [AssumptionsService],
  exports: [AssumptionsService],
})
export class AssumptionsModule {}
