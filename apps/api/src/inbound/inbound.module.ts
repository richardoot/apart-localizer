import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { ExplorationModule } from '../exploration/exploration.module'
import { ListingsModule } from '../listings/listings.module'
import { DraftsService } from './drafts.service'
import { DraftsController, InboundEmailController } from './inbound.controller'
import { InboundSignatureGuard } from './inbound-signature.guard'
import { InboundEmailService } from './inbound.service'

/** Les alertes e-mail transférées et les brouillons à valider (besoin C9). */
@Module({
  imports: [AiModule, ListingsModule, ExplorationModule],
  controllers: [InboundEmailController, DraftsController],
  providers: [InboundEmailService, DraftsService, InboundSignatureGuard],
})
export class InboundModule {}
