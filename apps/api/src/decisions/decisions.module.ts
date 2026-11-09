import { Module } from '@nestjs/common'
import { InboundModule } from '../inbound/inbound.module'
import { ListingsModule } from '../listings/listings.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { DecisionSettingsService } from './decision-settings.service'
import {
  DecisionRulesController,
  DecisionsController,
} from './decisions.controller'
import { DecisionsService } from './decisions.service'

/**
 * Lot 21 : les décisions à plusieurs. Portent aussi les routes du statut et
 * des brouillons qui passent par la règle (`/listings/:id/status`,
 * `/listing-drafts/:id/accept`, `/listing-drafts/accept-in-criteria`,
 * `/listing-drafts/:id`) : les annonces et les brouillons ne dépendent pas de
 * ce module, il dépend d'eux.
 */
@Module({
  imports: [ListingsModule, InboundModule, WorkspaceModule],
  controllers: [DecisionsController, DecisionRulesController],
  providers: [DecisionsService, DecisionSettingsService],
  exports: [DecisionsService],
})
export class DecisionsModule {}
