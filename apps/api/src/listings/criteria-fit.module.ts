import { Global, Module } from '@nestjs/common'
import { CriteriaMatchService } from './criteria-match.service'

/**
 * L'adéquation aux critères (lot 14), global : les annonces, les critères
 * et les hypothèses la recalculent après leurs écritures. Le service ne
 * dépend que de Prisma, du module geo et du journal (globaux), pas des
 * services qui l'appellent : aucune dépendance circulaire.
 */
@Global()
@Module({
  providers: [CriteriaMatchService],
  exports: [CriteriaMatchService],
})
export class CriteriaFitModule {}
