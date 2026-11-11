import { Injectable } from '@nestjs/common'
import { MARKET_MIN_COMPARABLES, MARKET_RADII } from '@apart/contracts'
import type {
  DvfComparable,
  LocationApproximation,
  LocationPrecision,
  MarketContext,
  MarketTrend,
  Point,
} from '@apart/contracts'
import {
  approximationReason,
  comparableSurfaceRange,
  gapToMarket,
  marketPrice,
  marketStats,
  marketTrend,
  marketWindow,
  trendCoversLastCompleteYear,
} from '@apart/domain'
import { GeoService } from '../geo/geo.service'
import type { DvfSaleHit } from '../geo/geo.service'

/** Nombre de comparables rendus (les statistiques portent sur toutes les ventes retenues). */
export const MARKET_COMPARABLES_SHOWN = 30

export interface MarketTarget {
  point: Point | null
  surface: number | null
  /** Prix affiché, pour l'écart au marché. */
  price?: number | null
  /** Rayon imposé ; absent = 500 m, élargi à 1 000 puis 2 000 m faute de ventes. */
  radiusMeters?: number | null
  /**
   * Lot 12 : la réserve d'un repère approché. Au centre du quartier : la
   * médiane reste, signalée indicative ; au centre de la commune : « à
   * vérifier » (les ventes du centre ne disent rien d'un autre quartier).
   */
  approximation?: LocationApproximation | null
  precision?: LocationPrecision | null
}

/**
 * Ancrage marché (besoins D5, N4) : ventes DVF d'appartements comparables
 * dans un rayon (PostGIS, module geo), surface à ±25 %, trois dernières
 * années, statistiques et prix de marché par `domain`.
 */
@Injectable()
export class MarketService {
  constructor(private readonly geo: GeoService) {}

  async context(
    target: MarketTarget,
    at: Date = new Date()
  ): Promise<MarketContext> {
    const period = marketWindow(at)
    const years = await this.geo.dvfYears()
    const dataYears = years.map(y => y.year)
    const noTrend = marketTrend({
      byYear: [],
      dataYears: years,
      radiusMeters: null,
      located: false,
    })
    const empty: MarketContext = {
      status: 'unavailable',
      point: target.point,
      radiusMeters: null,
      surface: target.surface,
      surfaceRange: null,
      period,
      stats: null,
      comparables: [],
      marketPrice: null,
      listingPricePerM2: null,
      gapToMarket: null,
      reasons: [],
      dataYears,
      trend: noTrend,
    }
    if (dataYears.length === 0) {
      return {
        ...empty,
        reasons: ['Aucune vente DVF importée : lance pnpm import:dvf.'],
      }
    }
    if (!target.point) {
      return {
        ...empty,
        status: 'to_verify',
        reasons: ['Adresse non localisée : pas de comparables.'],
      }
    }
    const surface =
      target.surface !== null && target.surface > 0 ? target.surface : null
    const surfaceRange =
      surface !== null ? comparableSurfaceRange(surface) : null
    const radii = target.radiusMeters
      ? [target.radiusMeters]
      : [...MARKET_RADII]
    let hits: DvfSaleHit[] = []
    let radius = radii[0] as number
    for (const r of radii) {
      radius = r
      hits = await this.geo.dvfSalesWithinRadius({
        point: target.point,
        radiusMeters: r,
        from: period.from,
        to: period.to,
        surfaceRange,
      })
      if (hits.length >= MARKET_MIN_COMPARABLES) break
    }
    const stats = marketStats(
      hits.map(h => h.price_per_m2).filter((v): v is number => v !== null)
    )
    const reasons: string[] = []
    if (surface === null) {
      reasons.push(
        'Surface inconnue : comparables de toutes surfaces, prix de marché non estimé.'
      )
    }
    if (!stats || stats.count < MARKET_MIN_COMPARABLES) {
      reasons.push(
        `Moins de ${MARKET_MIN_COMPARABLES} ventes comparables à ${radius} m sur trois ans : médiane non retenue.`
      )
    }
    const last = dataYears[dataYears.length - 1] as number
    if (Number(period.to.slice(0, 4)) > last) {
      reasons.push(
        `Données DVF disponibles jusqu'en ${last} (publication avec six mois à un an de décalage).`
      )
    }
    const approximate = target.approximation
      ? approximationReason('market', target.approximation)
      : null
    if (approximate) reasons.push(approximate)
    const trend = await this.trend(
      target.point,
      target.precision ?? null,
      years,
      radii,
      approximate
    )
    const listingPricePerM2 =
      target.price && surface ? target.price / surface : null
    const enough = stats !== null && stats.count >= MARKET_MIN_COMPARABLES
    const comparables: DvfComparable[] = hits
      .slice(0, MARKET_COMPARABLES_SHOWN)
      .map(h => ({
        id: h.id,
        mutationDate: h.mutation_date,
        price: h.price,
        surface: h.surface ?? 0,
        pricePerM2: h.price_per_m2 ?? 0,
        rooms: h.rooms,
        address: h.address,
        commune: h.commune,
        distanceMeters: h.distance_meters,
        point:
          h.longitude !== null && h.latitude !== null
            ? { type: 'Point', coordinates: [h.longitude, h.latitude] }
            : null,
      }))
    return {
      status:
        enough && surface !== null && target.precision !== 'commune'
          ? 'ok'
          : 'to_verify',
      point: target.point,
      radiusMeters: radius,
      surface,
      surfaceRange,
      period,
      stats,
      comparables,
      marketPrice: enough ? marketPrice(surface, stats) : null,
      listingPricePerM2,
      gapToMarket: enough ? gapToMarket(listingPricePerM2, stats) : null,
      reasons,
      dataYears,
      trend,
    }
  }

  /**
   * Lot 29 : la tendance des prix autour du repère, toutes surfaces, sur
   * toutes les années en base. Ses rayons sont ceux des comparables (500 m,
   * puis 1 000 et 2 000 m, ou le rayon imposé), élargis tant que la dernière
   * année complète n'a pas dix ventes : indépendamment des comparables, dont
   * le rayon dépend aussi de la surface. Les médianes et les écarts viennent
   * de `domain`.
   */
  private async trend(
    point: Point,
    precision: LocationPrecision | null,
    years: { year: number; count: number; lastDate: string }[],
    radii: readonly number[],
    reserve: string | null
  ): Promise<MarketTrend> {
    let trend = marketTrend({
      byYear: [],
      dataYears: years,
      radiusMeters: null,
    })
    for (const radiusMeters of radii) {
      const byYear = await this.geo.dvfPricesByYearWithinRadius({
        point,
        radiusMeters,
      })
      trend = marketTrend({
        byYear,
        dataYears: years,
        radiusMeters,
        reserve,
        toVerify: precision === 'commune',
      })
      if (trendCoversLastCompleteYear(trend)) break
    }
    return trend
  }
}
