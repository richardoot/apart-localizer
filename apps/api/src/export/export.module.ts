import { Module } from '@nestjs/common'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { ListingsModule } from '../listings/listings.module'
import { VisitsModule } from '../visits/visits.module'
import { AgencyRequestsModule } from '../agency-requests/agency-requests.module'
import { ExportController } from './export.controller'
import { ExportService } from './export.service'

/** Export CSV et JSON de l'espace ou de la sélection (portabilité des données). */
@Module({
  imports: [
    ListingsModule,
    AssumptionsModule,
    VisitsModule,
    AgencyRequestsModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
