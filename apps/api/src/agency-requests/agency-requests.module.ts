import { Module } from '@nestjs/common'
import { ListingsModule } from '../listings/listings.module'
import {
  AgencyRequestsController,
  ListingAgencyController,
} from './agency-requests.controller'
import { AgencyRequestsService } from './agency-requests.service'

/**
 * Lot 17 : questions aux agences (ADR 0027). Contact de l'annonceur,
 * demandes, validation, envoi enregistré, réponses. Aucun envoi sortant : le
 * module n'a ni client e-mail ni accès aux portails.
 */
@Module({
  imports: [ListingsModule],
  controllers: [ListingAgencyController, AgencyRequestsController],
  providers: [AgencyRequestsService],
  exports: [AgencyRequestsService],
})
export class AgencyRequestsModule {}
