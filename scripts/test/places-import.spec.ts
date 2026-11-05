import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOverpass } from '../lib/osm.js'
import { PLACES_QUERY, buildPlaces } from '../lib/places.js'

/** Lot 12 : lieux-dits OpenStreetMap, sur une réponse Overpass fictive. */
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')
  )

describe('lieux-dits OpenStreetMap', () => {
  it('garde les place=neighbourhood, quarter, suburb nommés, une fois chacun', () => {
    const { rows, stats } = buildPlaces(
      parseOverpass(fixture('osm-lieux-dits-fictifs.json')).elements
    )
    expect(rows).toEqual([
      {
        externalId: 'node/1',
        name: 'Le Moulinet',
        placeType: 'neighbourhood',
        longitude: -0.58,
        latitude: 44.84,
      },
      {
        externalId: 'way/2',
        name: 'Cité des Tilleuls',
        placeType: 'quarter',
        longitude: -0.57,
        latitude: 44.85,
      },
      {
        externalId: 'relation/3',
        name: 'Faubourg Fictif',
        placeType: 'suburb',
        longitude: -0.56,
        latitude: 44.86,
      },
    ])
    expect(stats).toEqual({
      read: 7,
      kept: 3,
      byType: { neighbourhood: 1, quarter: 1, suburb: 1 },
      otherPlace: 2,
      withoutName: 1,
    })
  })

  it('la requête porte sur les trois valeurs de place, nommées, dans la métropole', () => {
    expect(PLACES_QUERY).toContain(
      'nwr["place"~"^(neighbourhood|quarter|suburb)$"]["name"](area.bm);'
    )
    expect(PLACES_QUERY).toContain('out center tags;')
  })
})
