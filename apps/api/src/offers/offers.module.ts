import { Module } from '@nestjs/common'
import { OffersController } from './offers.controller'
import { OffersService } from './offers.service'

/** Les offres d'achat et la réponse du vendeur (besoin S5). */
@Module({
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
