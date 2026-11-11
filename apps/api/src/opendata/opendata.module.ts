import { Module } from '@nestjs/common'
import { DpeService } from './dpe.service'
import { GeocodingService } from './geocoding.service'
import { GeorisquesService } from './georisques.service'
import { IsochroneService } from './isochrone.service'
import { MarketService } from './market.service'
import { OpendataController } from './opendata.controller'
import { PlacementService } from './placement.service'
import { ReferenceCacheService } from './reference-cache.service'
import { RentControlService } from './rent-control.service'
import { RentObservatoryService } from './rent-observatory.service'
import { SurroundingsService } from './surroundings.service'
import { TransitService } from './transit.service'

/**
 * Connecteurs de données ouvertes, chacun isolé derrière un service avec
 * cache en base (`ReferenceData`) : géocodage et isochrones IGN, DPE ADEME,
 * risques Géorisques ;
 * et les données importées par les scripts (arrêts TBM, zonage et arrêtés
 * de l'encadrement, ventes DVF ; lot 11 : équipements et quartiers), lues
 * par le module geo ; lot 28 : loyers observés par l'observatoire local des
 * loyers (`ReferenceData`, sorte `rent_observatory`).
 */
@Module({
  controllers: [OpendataController],
  providers: [
    PlacementService,
    GeocodingService,
    ReferenceCacheService,
    IsochroneService,
    DpeService,
    RentControlService,
    RentObservatoryService,
    MarketService,
    TransitService,
    GeorisquesService,
    SurroundingsService,
  ],
  exports: [
    PlacementService,
    GeocodingService,
    ReferenceCacheService,
    IsochroneService,
    DpeService,
    RentControlService,
    RentObservatoryService,
    MarketService,
    TransitService,
    GeorisquesService,
    SurroundingsService,
  ],
})
export class OpendataModule {}
