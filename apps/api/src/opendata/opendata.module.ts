import { Module } from '@nestjs/common'
import { GeocodingService } from './geocoding.service'

/**
 * Connecteurs de données ouvertes, chacun isolé derrière un service avec
 * cache en base (`ReferenceData`) : géocodage IGN aujourd'hui ; DPE ADEME,
 * loyers de référence, isochrones dans les lots suivants.
 */
@Module({
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class OpendataModule {}
