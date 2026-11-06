import { describe, expect, it } from 'vitest'
import { DEFAULT_REGULATORY_RULES } from '@apart/contracts'
import type { ComplianceItem, ComplianceReport } from '@apart/contracts'
import { complianceReport } from '@apart/domain'
import {
  fakeAmenity,
  fakeContext,
  fakeSurroundings,
} from '@/test/criteria-fixtures'
import {
  NEIGHBOURHOOD_TILE_IDS,
  neighbourhoodTiles,
} from './neighbourhood-tiles'

/** Les espaces fines insécables de fr-FR, en espaces simples. */
const n = (text: string | undefined): string | undefined =>
  text?.replace(/[\u202f\u00a0]/g, ' ')

function report(items: ComplianceItem[]): ComplianceReport {
  const base = complianceReport(
    {
      dpeClass: 'D',
      dpeDate: '2023-01-01',
      constructionYear: 1975,
      leaseType: 'unfurnished',
      inseeCode: '33063',
      commune: 'Bordeaux',
      surface: 45,
      rentControlled: false,
      targetRent: 750,
      rentCap: null,
      heatingType: null,
      coOwnershipAllowsRental: 'unknown',
      decencyCompliant: 'unknown',
      rentalPermitRequired: 'unknown',
    },
    DEFAULT_REGULATORY_RULES,
    null,
    { rentalStartDate: '2028-01-01', at: new Date('2026-11-03T10:00:00Z') }
  )
  return {
    ...base,
    items: [...base.items.filter(i => i.category !== 'risks'), ...items],
  }
}

const risk = (over: Partial<ComplianceItem>): ComplianceItem => ({
  key: 'georisques_quiet',
  category: 'risks',
  level: 'ok',
  title: 'Autres aléas',
  message: 'Aucun autre aléa recensé dans la commune.',
  date: '2026-11-03',
  source: null,
  provenance: 'open_data',
  ...over,
})

const byId = (tiles: ReturnType<typeof neighbourhoodTiles>) =>
  Object.fromEntries(tiles.map(t => [t.id, t]))

describe('les six tuiles du Quartier (lot 19)', () => {
  it('lit le contexte d’une adresse exacte : tram, drive, sport, quartier, risques, repère', () => {
    const tiles = neighbourhoodTiles(
      fakeContext(),
      report([
        risk({
          key: 'georisques_rga',
          level: 'warn',
          title: 'Retrait-gonflement des argiles',
          message: 'À l’adresse : moyen.',
        }),
        risk({}),
      ]),
      { commune: 'Bordeaux', district: null }
    )
    expect(tiles.map(t => t.id)).toEqual(NEIGHBOURHOOD_TILE_IDS)
    const t = byId(tiles)
    expect(t.transit).toMatchObject({
      kicker: 'Tram',
      value: 'Tram A, C à 240 m',
      sub: 'arrêt Arrêt fictif · bus Lianes 1 à 80 m',
      tone: 'default',
    })
    expect(t.shopping).toMatchObject({
      kicker: 'Courses',
      value: 'Drive à 900 m',
      sub: 'Drive fictif',
    })
    expect(n(t.sport?.value)).toBe('Piste à 1,3 km')
    expect(t.sport?.sub).toBe('Fitness Park : non disponible')
    expect(t.neighbourhood).toMatchObject({
      value: 'Quartier fictif',
      sub: 'quartier Grand quartier fictif, Bordeaux',
      tone: 'default',
    })
    expect(t.risks).toMatchObject({
      kicker: 'Risques à l’adresse',
      value: '1 point d’attention',
      sub: 'Retrait-gonflement des argiles',
      tone: 'warn',
    })
    expect(t.placement).toMatchObject({
      value: 'À l’adresse',
      sub: 'distances depuis l’adresse',
      tone: 'good',
    })
  })

  it('une donnée absente rend « à vérifier », « inconnu » ou « non disponible », jamais une valeur', () => {
    const t = byId(neighbourhoodTiles(null, null))
    expect(t.transit?.value).toBe('à vérifier')
    expect(t.shopping?.value).toBe('à vérifier')
    expect(t.sport?.value).toBe('à vérifier')
    expect(t.neighbourhood?.value).toBe('inconnu')
    expect(t.risks).toMatchObject({
      value: 'à vérifier',
      sub: 'rapport Géorisques non lu',
    })
    expect(t.placement?.value).toBe('à vérifier')

    const missing = {
      status: 'not_applicable' as const,
      nearest: null,
      approximate: false,
      reasons: ['Annonce sans point : saisissez une adresse ou une commune.'],
    }
    const bare = byId(
      neighbourhoodTiles(
        fakeContext({
          point: null,
          precision: null,
          transit: {
            nearestTram: null,
            nearestStop: null,
            approximate: false,
            reasons: [],
          },
          surroundings: fakeSurroundings({
            neighbourhood: {
              status: 'unavailable',
              value: null,
              reasons: [
                'Contours des quartiers non importés : non disponible.',
              ],
            },
            athleticsTrack: missing,
            supermarkets: {
              ...missing,
              preferred: { carrefour: null, auchan: null, intermarche: null },
            },
            fitnessPark: { ...missing, status: 'unavailable' },
          }),
        }),
        report([
          risk({
            key: 'georisques',
            level: 'unknown',
            title: 'Risques à l’adresse (Géorisques)',
            message:
              'Risques à l’adresse non consultés : adresse non localisée.',
          }),
        ])
      )
    )
    expect(bare.transit).toMatchObject({
      value: 'à vérifier',
      sub: 'adresse non localisée',
    })
    expect(bare.shopping).toMatchObject({
      value: 'à vérifier',
      sub: 'Annonce sans point : saisissez une adresse ou une commune.',
    })
    expect(bare.sport).toMatchObject({
      value: 'à vérifier',
      sub: 'Fitness Park : non disponible · piste d’athlétisme : à vérifier',
    })
    expect(bare.neighbourhood).toMatchObject({
      value: 'non disponible',
      sub: 'Contours des quartiers non importés : non disponible.',
    })
    expect(bare.risks).toMatchObject({
      value: 'à vérifier',
      sub: 'Risques à l’adresse non consultés : adresse non localisée.',
    })
    expect(bare.placement).toMatchObject({
      value: 'Non localisée',
      sub: 'aucune distance calculée',
      tone: 'warn',
    })
  })

  it('repère au quartier : « ≈ » dans les distances, nom du quartier retenu', () => {
    const surroundings = fakeSurroundings()
    const t = byId(
      neighbourhoodTiles(
        fakeContext({
          precision: 'district',
          placement: {
            method: 'neighbourhood_match',
            precision: 'district',
            matchedText: 'Secteur fictif',
            area: {
              level: 'sector',
              name: 'Secteur fictif',
              codes: ['S1'],
              commune: 'Bordeaux',
              inseeCode: '33063',
              source: 'Secteurs fictifs',
              areaSquareMeters: 1_000_000,
            },
            toVerify: false,
            reasons: [],
            computedAt: '2026-11-05T10:00:00.000Z',
          },
          transit: { ...fakeContext().transit, approximate: true },
          surroundings: {
            ...surroundings,
            supermarkets: { ...surroundings.supermarkets, approximate: true },
            neighbourhood: {
              ...surroundings.neighbourhood,
              status: 'to_verify',
            },
          },
        }),
        report([risk({})]),
        { commune: 'Bordeaux', district: 'Secteur fictif' }
      )
    )
    expect(t.transit?.value).toBe('Tram A, C à ≈ 240 m')
    expect(t.shopping?.value).toBe('Drive à ≈ 900 m')
    expect(t.neighbourhood?.sub).toBe(
      'quartier Grand quartier fictif, Bordeaux · à vérifier'
    )
    expect(t.neighbourhood?.tone).toBe('warn')
    expect(t.risks).toMatchObject({ value: 'Faibles', tone: 'good' })
    expect(t.placement).toMatchObject({
      value: 'Au quartier',
      sub: 'Secteur fictif · distances approchées',
      tone: 'warn',
    })
  })

  it('pas de tram proche, drive à vérifier, Fitness Park, aléas à vérifier, commune', () => {
    const surroundings = fakeSurroundings()
    const t = byId(
      neighbourhoodTiles(
        fakeContext({
          precision: 'commune',
          transit: {
            nearestTram: null,
            nearestStop: null,
            approximate: false,
            reasons: ['Arrêts TBM non importés.'],
          },
          surroundings: {
            ...surroundings,
            supermarkets: {
              ...surroundings.supermarkets,
              nearest: fakeAmenity({
                name: 'Hyper fictif',
                brand: 'Carrefour',
                drive: 'to_verify',
                distanceMeters: 1400,
              }),
            },
            fitnessPark: {
              status: 'ok',
              nearest: fakeAmenity({
                kind: 'fitness_park',
                name: 'Fitness Park fictif',
                distanceMeters: 2100,
              }),
              approximate: false,
              reasons: [],
            },
            athleticsTrack: {
              status: 'ok',
              nearest: null,
              approximate: false,
              reasons: [],
            },
            neighbourhood: {
              status: 'ok',
              value: {
                name: 'Bordeaux',
                kind: 'commune',
                code: '33063',
                parent: null,
                commune: 'Bordeaux',
                inseeCode: '33063',
                source: 'Source fictive',
              },
              reasons: [],
            },
          },
        }),
        report([
          risk({
            key: 'georisques_radon',
            level: 'unknown',
            title: 'Radon',
            message: 'À vérifier.',
          }),
          risk({}),
        ])
      )
    )
    expect(t.transit).toMatchObject({
      value: 'Pas de tram à moins de 2 km',
      sub: 'Arrêts TBM non importés.',
      tone: 'warn',
    })
    expect(n(t.shopping?.value)).toBe('Drive à vérifier à 1,4 km')
    expect(t.shopping?.sub).toBe('Hyper fictif (Carrefour)')
    expect(n(t.sport?.value)).toBe('Fitness Park à 2,1 km')
    expect(t.sport?.sub).toBe('piste d’athlétisme : aucune proche')
    expect(t.neighbourhood).toMatchObject({
      value: 'Bordeaux',
      sub: 'Commune entière',
    })
    expect(t.risks).toMatchObject({
      value: 'à vérifier',
      sub: '1 aléa à vérifier : Radon',
    })
    expect(t.placement).toMatchObject({
      value: 'Commune seulement',
      sub: 'adresse et quartier inconnus : distances indicatives',
    })
  })

  it('aucun drive dans le rayon, aucun équipement de sport proche, plusieurs points d’attention', () => {
    const surroundings = fakeSurroundings()
    const t = byId(
      neighbourhoodTiles(
        fakeContext({
          surroundings: {
            ...surroundings,
            supermarkets: { ...surroundings.supermarkets, nearest: null },
            fitnessPark: {
              status: 'ok',
              nearest: null,
              approximate: false,
              reasons: [],
            },
            athleticsTrack: {
              status: 'ok',
              nearest: null,
              approximate: false,
              reasons: [],
            },
          },
          transit: {
            ...fakeContext().transit,
            nearestTram: null,
          },
        }),
        report([
          risk({ key: 'a', level: 'warn', title: 'Inondation' }),
          risk({ key: 'b', level: 'bad', title: 'Mouvements de terrain' }),
        ])
      )
    )
    expect(t.shopping).toMatchObject({
      value: 'Aucun drive dans le rayon',
      sub: 'à moins de 20 km à vol d’oiseau',
    })
    expect(t.transit?.sub).toBe('bus Lianes 1 à 80 m')
    expect(t.sport).toMatchObject({
      value: 'à vérifier',
      sub: 'Fitness Park : aucun proche · piste d’athlétisme : aucune proche',
    })
    expect(t.risks).toMatchObject({
      value: '2 points d’attention',
      sub: 'Inondation, Mouvements de terrain',
    })
    const none = byId(
      neighbourhoodTiles(
        fakeContext({
          transit: {
            nearestTram: null,
            nearestStop: null,
            approximate: false,
            reasons: [],
          },
        }),
        report([])
      )
    )
    expect(none.transit?.sub).toBe('aucun arrêt proche connu')
    expect(none.risks?.sub).toBe('aucun relevé Géorisques')
  })
})
