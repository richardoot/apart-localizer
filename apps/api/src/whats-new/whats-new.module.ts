import { Module } from '@nestjs/common'
import { WhatsNewController } from './whats-new.controller'
import { WhatsNewService } from './whats-new.service'

/** « Ce qui a changé depuis ma dernière visite » (besoin K4). */
@Module({
  controllers: [WhatsNewController],
  providers: [WhatsNewService],
  exports: [WhatsNewService],
})
export class WhatsNewModule {}
