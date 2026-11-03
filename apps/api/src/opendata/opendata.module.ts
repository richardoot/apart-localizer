import { Module } from '@nestjs/common'
import { DpeService } from './dpe.service'
import { GeocodingService } from './geocoding.service'
import { IsochroneService } from './isochrone.service'
import { MarketService } from './market.service'
import { OpendataController } from './opendata.controller'
import { ReferenceCacheService } from './reference-cache.service'
import { RentControlService } from './rent-control.service'
import { TransitService } from './transit.service'

/**
 * Connecteurs de données ouvertes, chacun isolé derrière un service avec
 * cache en base (`ReferenceData`) : géocodage et isochrones IGN, DPE ADEME ;
 * et les données importées par les scripts (arrêts TBM, zonage et arrêtés
 * de l'encadrement, ventes DVF), lues par le module geo.
 */
@Module({
  controllers: [OpendataController],
  providers: [
    GeocodingService,
    ReferenceCacheService,
    IsochroneService,
    DpeService,
    RentControlService,
    MarketService,
    TransitService,
  ],
  exports: [
    GeocodingService,
    ReferenceCacheService,
    IsochroneService,
    DpeService,
    RentControlService,
    MarketService,
    TransitService,
  ],
})
export class OpendataModule {}
