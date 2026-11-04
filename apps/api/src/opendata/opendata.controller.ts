import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { marketWindow } from '@apart/domain'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { GeoService } from '../geo/geo.service'
import {
  BboxQueryDto,
  GeocodeLookupDto,
  GeocodeQueryDto,
  LayerDto,
  OpenDataStatusDto,
  TransitLayerQueryDto,
} from './dto/opendata.dto'
import { GeocodingService } from './geocoding.service'
import {
  RENT_CONTROL_TERRITORY,
  RentControlService,
} from './rent-control.service'

/** Emprise par défaut des ventes DVF : Bordeaux Métropole. */
const METROPOLE_BBOX: [number, number, number, number] = [
  -0.85, 44.7, -0.45, 45.05,
]

/**
 * Couches de carte (arrêts TBM, zonage de l'encadrement, ventes DVF), état
 * des imports et recherche d'adresse pour recentrer une carte. Lecture
 * seule ; le SQL est dans le module geo, le géocodeur dans GeocodingService.
 */
@ApiTags('opendata')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('opendata')
export class OpendataController {
  constructor(
    private readonly geo: GeoService,
    private readonly rentControl: RentControlService,
    private readonly geocoding: GeocodingService
  ) {}

  @Get('geocode')
  @ApiOperation({
    summary:
      'Localise une adresse ou une commune (Géoplateforme IGN, réponse mise en cache) pour recentrer une carte ; rien n’est enregistré',
  })
  @ZodResponse({ status: 200, type: GeocodeLookupDto })
  async geocode(@Query() query: GeocodeQueryDto): Promise<GeocodeLookupDto> {
    try {
      const found = await this.geocoding.geocode(query.q, 'address')
      return found
        ? {
            query: query.q,
            status: 'found',
            result: {
              point: found.point,
              label: found.label,
              precision: found.precision,
              commune: found.city,
            },
          }
        : { query: query.q, status: 'not_found', result: null }
    } catch {
      // Panne ou délai du géocodeur : la carte reste où elle est.
      return { query: query.q, status: 'unavailable', result: null }
    }
  }

  @Get('layers/transit-stops')
  @ApiOperation({
    summary: 'Arrêts TBM en GeoJSON (mode facultatif : tram, bus, boat)',
  })
  @ZodResponse({ status: 200, type: LayerDto })
  transitStops(@Query() query: TransitLayerQueryDto): Promise<LayerDto> {
    return this.geo.transitStopsGeoJson(query.mode)
  }

  @Get('layers/rent-control-zones')
  @ApiOperation({
    summary:
      "Zonage de l'encadrement des loyers de Bordeaux (secteurs IRIS, zone 1 à 4) en GeoJSON",
  })
  @ZodResponse({ status: 200, type: LayerDto })
  rentControlZones(): Promise<LayerDto> {
    return this.geo.rentControlZonesGeoJson(RENT_CONTROL_TERRITORY)
  }

  @Get('layers/dvf')
  @ApiOperation({
    summary:
      "Ventes DVF d'appartements des trois dernières années dans une emprise (bbox=ouest,sud,est,nord), 2 000 au plus",
  })
  @ZodResponse({ status: 200, type: LayerDto })
  dvf(@Query() query: BboxQueryDto): Promise<LayerDto> {
    return this.geo.dvfSalesInBbox(
      query.bbox ?? METROPOLE_BBOX,
      marketWindow(new Date()).from
    )
  }

  @Get('status')
  @ApiOperation({
    summary:
      'État des imports open data : secteurs et arrêtés de l’encadrement, arrêts par mode, ventes DVF par année',
  })
  @ZodResponse({ status: 200, type: OpenDataStatusDto })
  async status(): Promise<OpenDataStatusDto> {
    const [zones, tables, transitStops, dvf] = await Promise.all([
      this.geo.rentControlZoneCount(RENT_CONTROL_TERRITORY),
      this.rentControl.tables(),
      this.geo.transitStopCounts(),
      this.geo.dvfYears(),
    ])
    return {
      rentControl: {
        zones,
        decrees: tables.map(t => ({
          decreeDate: t.decreeDate,
          validFrom: t.validFrom,
          validUntil: t.validUntil,
          rows: t.rows.length,
        })),
      },
      transitStops,
      dvf,
    }
  }
}
