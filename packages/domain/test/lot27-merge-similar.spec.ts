/**
 * Lot 27 (ADR 0037) : retrouver une annonce « déjà vue » par ressemblance,
 * fusionner deux fiches du même bien, enregistrer chaque agence avec sa
 * référence. Données fictives (« [Exemple] », références « EX-… »).
 */
import { describe, expect, it } from 'vitest'
import { LISTING_LINKS_MAX, LISTING_SELLERS_MAX } from '@apart/contracts'
import type { ListingMergeCounts } from '@apart/contracts'
import {
  MERGE_ACTIONS,
  MERGE_FILL_FIELDS,
  describeActivity,
  describeMergeActivity,
  distanceText,
  isEmptySeller,
  knownSellers,
  linkAddedDiff,
  matchDuplicates,
  matchesSearch,
  mergeFieldPlan,
  mergeLeftBehindLines,
  mergeMoveLines,
  mergeRefusal,
  mergeSellersPlan,
  mergeSummaryText,
  mergedBannerText,
  mergedDiscardReason,
  mergedFieldSources,
  mergedListingRefusal,
  mergedNotes,
  mergedNotesHeading,
  mergedSellerLines,
  notificationsForActivity,
  observationMatchesSeller,
  otherSellerText,
  probeDuplicateReasons,
  rankSimilarListings,
  referenceReason,
  sameSeller,
  searchTokens,
  sellerContradictionAmong,
  sellerFromObservation,
  sellerObservationAmong,
  sellersCountText,
  similarSummaryText,
  similarityFeatures,
  similarityLevel,
  similarityOf,
  similarityPercent,
  suggestKeep,
  taskLabelKey,
  tasksToMove,
  whatsNewKindOf,
  withoutMergedNotes,
} from '../src/index.js'
import type {
  LinkState,
  MergeListingFacts,
  SellerFacts,
  SimilarProbe,
  SimilarRow,
} from '../src/index.js'

/** Espaces fines insécables de fr-FR → espaces simples. */
const n = (value: string): string => value.replace(/[\u202f\u00a0]/g, ' ')

const AGENCY_A = '[Exemple] Immobilier des Chartrons'
const AGENCY_B = '[Exemple] Cabinet Bastide'

const seller = (over: Partial<SellerFacts> = {}): SellerFacts => ({
  sellerType: 'agency',
  sellerName: AGENCY_A,
  sellerReference: 'EX-2041',
  ...over,
})
const NO_SELLER: SellerFacts = {
  sellerType: 'unknown',
  sellerName: null,
  sellerReference: null,
}

const row = (over: Partial<SimilarRow> = {}): SimilarRow => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  title: '[Exemple] T3 68 m², balcon sud',
  status: 'to_study',
  price: 214_000,
  surface: 68,
  commune: 'Bordeaux',
  district: 'Caudéran',
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101',
  addressRaw: null,
  addressNormalized: null,
  links: ['https://leboncoin.fr/ad/ventes_immobilieres/0000000101'],
  sellerType: 'agency',
  sellerName: AGENCY_A,
  sellerReference: 'EX-2041',
  rooms: 3,
  floor: 2,
  dpeClass: 'C',
  constructionYear: 1975,
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...over,
})

const probe = (over: Partial<SimilarProbe> = {}): SimilarProbe => ({
  commune: 'Bordeaux',
  district: 'Caudéran',
  price: 219_000,
  surface: 68,
  rooms: 3,
  floor: 2,
  dpeClass: 'C',
  ...over,
})

describe('Lot 27 : plusieurs agences pour un même bien', () => {
  it('reconnaît le même vendeur : particuliers, même agence, même référence', () => {
    expect(isEmptySeller(NO_SELLER)).toBe(true)
    expect(isEmptySeller(seller())).toBe(false)
    const priv: SellerFacts = { ...NO_SELLER, sellerType: 'private' }
    expect(sameSeller(priv, priv)).toBe(true)
    expect(sameSeller(priv, seller())).toBe(false)
    // Même agence, écrite autrement ; une référence manquante ne contredit pas.
    expect(
      sameSeller(
        seller(),
        seller({
          sellerName: 'Agence Immobilier des Chartrons',
          sellerReference: null,
        })
      )
    ).toBe(true)
    // Même agence, deux références : deux lignes (chaque référence compte).
    expect(sameSeller(seller(), seller({ sellerReference: 'EX-9999' }))).toBe(
      false
    )
    // Autre agence, même référence : deux vendeurs.
    expect(sameSeller(seller(), seller({ sellerName: AGENCY_B }))).toBe(false)
    // Sans nom d'un côté : la référence tranche.
    expect(sameSeller(seller(), seller({ sellerName: null }))).toBe(true)
    expect(
      sameSeller(seller({ sellerName: null }), seller({ sellerName: null }))
    ).toBe(true)
    expect(
      sameSeller(
        seller({ sellerName: null, sellerReference: null }),
        seller({ sellerName: null })
      )
    ).toBe(false)
  })

  it('liste les vendeurs connus, le principal d’abord s’il est renseigné', () => {
    const other = seller({ sellerName: AGENCY_B, sellerReference: 'CB-77' })
    expect(knownSellers(seller(), [other])).toEqual([seller(), other])
    expect(knownSellers(NO_SELLER, [other])).toEqual([other])
    expect(knownSellers(NO_SELLER)).toEqual([])
  })

  it('dit si une page montre un vendeur de la fiche', () => {
    expect(
      observationMatchesSeller(seller(), {
        sellerName: 'Immobilier des Chartrons',
        reference: 'Réf. ex 2041',
      })
    ).toBe(true)
    expect(observationMatchesSeller(seller(), { sellerName: AGENCY_A })).toBe(
      true
    )
    expect(
      observationMatchesSeller(seller(), {
        sellerName: AGENCY_A,
        reference: 'EX-9999',
      })
    ).toBe(false)
    expect(observationMatchesSeller(seller(), { sellerName: AGENCY_B })).toBe(
      false
    )
    expect(observationMatchesSeller(seller(), { reference: 'EX 2041' })).toBe(
      true
    )
    expect(observationMatchesSeller(seller(), {})).toBe(false)
    expect(observationMatchesSeller(seller(), { sellerType: 'private' })).toBe(
      false
    )
    const priv: SellerFacts = { ...NO_SELLER, sellerType: 'private' }
    expect(observationMatchesSeller(priv, { sellerType: 'private' })).toBe(true)
    expect(observationMatchesSeller(priv, { sellerName: AGENCY_A })).toBe(false)
  })

  it('une autre agence de la fiche ne contredit plus un lien lu', () => {
    const other = seller({ sellerName: AGENCY_B, sellerReference: 'CB-77' })
    const observed = { sellerName: AGENCY_B, reference: 'CB-77' }
    expect(sellerContradictionAmong(seller(), [], observed)).toContain(
      'l’agence lue'
    )
    expect(sellerContradictionAmong(seller(), [other], observed)).toBeNull()
    expect(
      sellerContradictionAmong(seller(), [other], { sellerName: AGENCY_A })
    ).toBeNull()
    expect(
      sellerContradictionAmong(seller(), [other], {
        sellerName: '[Exemple] Agence du Lac',
      })
    ).toContain('ni une des autres agences de la fiche')
    expect(
      sellerContradictionAmong(seller(), [other, other], {
        sellerName: '[Exemple] Agence du Lac',
      })
    ).toContain('ni une des 2 autres agences de la fiche')
  })

  it('garde ce qu’une page a montré d’une autre agence, sans rien deviner', () => {
    expect(sellerFromObservation({})).toBeNull()
    expect(sellerFromObservation({ sellerType: 'private' })).toMatchObject({
      sellerType: 'private',
      sellerName: null,
    })
    expect(
      sellerFromObservation({
        sellerName: ' Cabinet  X ',
        reference: 'Réf. A-12',
      })
    ).toEqual({
      sellerType: 'unknown',
      sellerName: 'Cabinet X',
      sellerReference: 'A-12',
      sellerReferenceKey: 'A12',
    })
    expect(otherSellerText(seller())).toBe(`« ${AGENCY_A} », réf. EX-2041`)
    expect(
      otherSellerText(seller({ sellerName: null, sellerType: 'mandatary' }))
    ).toBe('Mandataire, réf. EX-2041')
    expect(otherSellerText({ ...NO_SELLER, sellerReference: 'A-1' })).toBe(
      'Agence à préciser, réf. A-1'
    )
    expect(otherSellerText({ ...NO_SELLER, sellerType: 'private' })).toBe(
      'Particulier (vente directe)'
    )
    expect(otherSellerText(seller({ sellerReference: null }))).toBe(
      `« ${AGENCY_A} »`
    )
  })

  it('une agence qui contredit est proposée, ou enregistrée quand un membre a tranché', () => {
    const observed = { sellerName: AGENCY_B, reference: 'CB-77' }
    // Sans accord : la règle du lot 18 (proposé, jamais appliqué).
    const proposed = sellerObservationAmong(seller(), [], observed)
    expect(proposed.newSeller).toBeNull()
    expect(proposed.changes.map(c => c.disposition)).toEqual([
      'proposed',
      'proposed',
    ])
    // Un membre a dit « c'est la même » : une autre agence, principale intacte.
    const recorded = sellerObservationAmong(seller(), [], observed, {
      recordOther: true,
    })
    expect(recorded.patch).toEqual({})
    expect(recorded.newSeller).toMatchObject({
      sellerName: AGENCY_B,
      sellerReference: 'CB-77',
      sellerReferenceKey: 'CB77',
    })
    expect(recorded.changes).toEqual([
      {
        field: 'otherSeller',
        label: 'Autre agence',
        before: null,
        after: `« ${AGENCY_B} », réf. CB-77`,
        disposition: 'applied',
        text: `Autre agence enregistrée : « ${AGENCY_B} », réf. CB-77 (même bien, autre mandat)`,
      },
    ])
    // Déjà une des autres agences : rien à dire.
    expect(
      sellerObservationAmong(seller(), [seller(observedAsSeller())], observed, {
        recordOther: true,
      })
    ).toEqual({ changes: [], patch: {}, newSeller: null })
    // Le même vendeur lu autrement (« mandataire ») : proposé, pas une autre agence.
    const retyped = sellerObservationAmong(
      seller(),
      [],
      { sellerType: 'mandatary', sellerName: AGENCY_A, reference: 'EX-2041' },
      { recordOther: true }
    )
    expect(retyped.newSeller).toBeNull()
    expect(retyped.changes.map(c => [c.field, c.disposition])).toEqual([
      ['sellerType', 'proposed'],
    ])
    // Rien ne contredit : le vendeur inconnu est complété comme au lot 18.
    const filled = sellerObservationAmong(NO_SELLER, [], observed, {
      recordOther: true,
    })
    expect(filled.newSeller).toBeNull()
    expect(filled.patch).toEqual({
      sellerName: AGENCY_B,
      sellerReference: 'CB-77',
    })
  })

  function observedAsSeller(): Partial<SellerFacts> {
    return { sellerName: AGENCY_B, sellerReference: 'CB-77' }
  }

  it('compte les agences sous « Qui la vend »', () => {
    const other = seller({ sellerName: AGENCY_B, sellerReference: 'CB-77' })
    expect(sellersCountText(seller(), [])).toBeNull()
    expect(sellersCountText(seller(), [other])).toBe('Vendue par 2 agences')
    expect(
      sellersCountText(seller(), [{ ...NO_SELLER, sellerType: 'private' }])
    ).toBe('Vendue par 1 agence et en direct')
  })

  it('l’ajout d’un lien enregistre l’autre agence quand un membre a tranché', () => {
    const link: LinkState = {
      id: 'link-2',
      portal: 'seloger',
      url: 'https://www.seloger.com/annonces/0000000202.htm',
      normalizedUrl: 'https://seloger.com/annonces/0000000202.htm',
      externalId: null,
      price: null,
      priceAt: null,
      online: true,
      offlineSince: null,
      lastSeenOnlineAt: null,
      lastCheckedAt: null,
      createdAt: '2026-11-11T10:00:00.000Z',
      origin: 'manual',
    }
    const base = {
      stored: {
        price: 214_000,
        annualCharges: null,
        propertyTax: null,
        surface: 68,
        rooms: 3,
        dpeClass: null,
        gesClass: null,
        dpeConsumption: null,
        description: null,
        publishedAt: null,
        sourceUpdatedAt: null,
        url: null,
        status: 'to_study' as const,
      },
      priceSource: 'listing' as const,
      seller: seller(),
      links: [],
      link,
      observed: { sellerName: AGENCY_B, reference: 'CB-77', online: true },
      now: '2026-11-11T10:00:00.000Z',
    }
    const strict = linkAddedDiff(base)
    expect(strict.newSeller).toBeNull()
    expect(strict.changes.some(c => c.disposition === 'proposed')).toBe(true)
    const decided = linkAddedDiff({ ...base, recordOtherSeller: true })
    expect(decided.newSeller?.sellerReference).toBe('CB-77')
    expect(decided.changes.map(c => c.field)).toContain('otherSeller')
    expect(decided.sellerPatch).toEqual({})
    const known = linkAddedDiff({
      ...base,
      otherSellers: [seller(observedAsSeller())],
      recordOtherSeller: true,
    })
    expect(known.newSeller).toBeNull()
    expect(known.changes.map(c => c.field)).toEqual(['link'])
  })

  it('la référence de chaque agence reconnaît la même annonce', () => {
    const tracked = row({
      otherSellers: [
        {
          sellerType: 'agency',
          sellerName: AGENCY_B,
          sellerReference: 'CB-77',
        },
      ],
    })
    expect(
      referenceReason({ sellerName: AGENCY_B, reference: 'cb 77' }, tracked)
    ).toMatchObject({ kind: 'same_reference', score: 1 })
    expect(
      referenceReason({ sellerName: AGENCY_A, reference: 'EX-2041' }, tracked)
        ?.kind
    ).toBe('same_reference')
    // La même référence chez une agence inconnue de la fiche : à trancher.
    expect(
      referenceReason(
        { sellerName: '[Exemple] Agence du Lac', reference: 'CB-77' },
        tracked
      )?.kind
    ).toBe('same_reference_other_agency')
    expect(referenceReason({ reference: 'ZZ-1' }, tracked)).toBeNull()
    const [candidate] = matchDuplicates(
      { sellerName: AGENCY_B, reference: 'CB-77' },
      [tracked]
    )
    expect(candidate?.certain).toBe(true)
  })
})

describe('Lot 27 : annonces ressemblantes', () => {
  it('note chaque caractéristique comparable et la dit en clair', () => {
    const features = similarityFeatures(
      probe({ constructionYear: 1978 }),
      row({ floor: 3, dpeClass: 'D' }),
      40
    )
    const byKind = new Map(features.map(f => [f.kind, f]))
    expect(byKind.get('commune')).toMatchObject({
      similarity: 1,
      text: 'Même commune (Bordeaux)',
    })
    expect(byKind.get('district')?.text).toBe('Même quartier (Caudéran)')
    expect(byKind.get('distance')).toMatchObject({
      similarity: 1,
      text: 'Au même endroit (à 40 m)',
    })
    expect(byKind.get('surface')?.text).toBe('Même surface (68 m²)')
    expect(n(byKind.get('price')?.text ?? '')).toBe(
      '5 000 € de moins (214 000 €)'
    )
    expect(byKind.get('price')?.similarity).toBeGreaterThan(0.85)
    expect(byKind.get('rooms')?.text).toBe('Même nombre de pièces (3)')
    expect(byKind.get('floor')).toMatchObject({
      similarity: 0,
      text: 'Au 3e étage, pas au 2e étage',
    })
    expect(byKind.get('dpe')).toMatchObject({
      similarity: 0.4,
      text: 'DPE D contre C',
    })
    expect(byKind.get('year')).toMatchObject({
      similarity: 0.5,
      text: 'Construit en 1975, pas en 1978',
    })
    expect(byKind.has('same_agency')).toBe(false)
  })

  it('dit aussi ce qui s’éloigne', () => {
    const features = similarityFeatures(
      probe({
        commune: 'Talence',
        district: 'Forum',
        price: 150_000,
        surface: 40.5,
        rooms: 1,
        floor: 0,
        dpeClass: 'G',
        constructionYear: 1900,
        sellerName: 'Chartrons Immo',
      }),
      row({ floor: 1, rooms: 3 }),
      2300
    )
    const text = (kind: string) =>
      n(features.find(f => f.kind === kind)?.text ?? '')
    expect(text('commune')).toBe('Autre commune : Bordeaux')
    expect(text('district')).toBe('Autre quartier : Caudéran')
    expect(text('distance')).toBe('À 2,3 km')
    expect(text('surface')).toBe('68 m² contre 40,5 m²')
    expect(text('price')).toBe('64 000 € de plus (214 000 €)')
    expect(text('rooms')).toBe('3 pièces contre 1')
    expect(text('floor')).toBe('Au 1er étage, pas au rez-de-chaussée')
    expect(text('dpe')).toBe('DPE C contre G')
    expect(text('year')).toBe('Construit en 1975, pas en 1900')
    expect(features.find(f => f.kind === 'same_agency')?.text).toBe(
      `Même agence (« ${AGENCY_A} »)`
    )
    expect(
      features
        .filter(f => f.kind !== 'same_agency')
        .every(f => f.similarity < 0.5)
    ).toBe(true)
    // Une pièce d'écart rapproche encore un peu ; rien de comparable : rien.
    expect(
      similarityFeatures({ rooms: 2 }, row(), undefined).find(
        f => f.kind === 'rooms'
      )
    ).toMatchObject({ similarity: 0.3, text: '3 pièces contre 2' })
    expect(similarityFeatures({}, row(), undefined)).toEqual([])
    expect(distanceText(4)).toBe('10 m')
    expect(distanceText(640)).toBe('640 m')
  })

  it('le même bien sur un autre portail arrive « très proche », un autre bien « peu ressemblant »', () => {
    const same = similarityOf(probe(), row())
    expect(same.level).toBe('very_close')
    expect(same.score).toBeGreaterThan(0.9)
    expect(same.differences).toEqual([])
    const other = similarityOf(
      probe(),
      row({ surface: 45, price: 180_000, rooms: 2, dpeClass: 'E', floor: 5 })
    )
    expect(other.level).toBe('far')
    expect(other.score).toBeLessThan(0.5)
    expect(other.differences.map(d => d.kind)).toEqual(
      expect.arrayContaining(['surface', 'rooms', 'floor', 'dpe'])
    )
  })

  it('peu de faits communs rabattent la note', () => {
    const thin = similarityOf({ commune: 'Bordeaux' }, row())
    expect(thin.score).toBeLessThan(0.6)
    expect(thin.level).toBe('close')
    expect(similarityOf({}, row()).score).toBe(0)
  })

  it('un motif de doublon fixe la note : certain, ou probable', () => {
    const certain = similarityOf(
      probe({ sellerName: AGENCY_A, reference: 'ex 2041', price: 300_000 }),
      row()
    )
    expect(certain).toMatchObject({ score: 1, level: 'certain' })
    expect(certain.matches[0]).toMatchObject({ kind: 'same_reference' })
    // « Même agence » n'est pas répété après « même agence, même référence ».
    expect(certain.matches.filter(m => m.kind === 'same_agency')).toEqual([])
    const sameLink = similarityOf(
      { url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101?x=1' },
      row()
    )
    expect(sameLink.level).toBe('certain')
    const otherAgency = similarityOf(
      { sellerName: AGENCY_B, reference: 'EX-2041' },
      row()
    )
    expect(otherAgency.score).toBe(0.85)
    expect(otherAgency.matches[0]?.kind).toBe('same_reference_other_agency')
    // Le motif « commune, surface et prix » dit déjà ces trois faits.
    const trio = similarityOf(
      { commune: 'Bordeaux', price: 214_000, surface: 68 },
      row()
    )
    expect(trio.matches.map(m => m.kind)).toEqual(['commune'])
    const nearby = similarityOf({ surface: 68 }, row(), 20)
    expect(nearby.matches[0]).toMatchObject({ kind: 'distance' })
    expect(similarityLevel(0.6, false)).toBe('close')
    expect(similarityLevel(0.1, true)).toBe('certain')
    expect(similarityPercent(0.874)).toBe('87 %')
  })

  it('compare tous les liens et toutes les agences de l’annonce regardée', () => {
    const tracked = row({ sellerName: AGENCY_B, sellerReference: 'CB-77' })
    const reasons = probeDuplicateReasons(
      {
        sellerType: 'unknown',
        sellerName: AGENCY_A,
        reference: 'EX-2041',
        otherSellers: [
          {
            sellerType: 'agency',
            sellerName: AGENCY_B,
            sellerReference: 'CB-77',
          },
        ],
        url: 'https://exemple.invalid/a',
        links: ['https://leboncoin.fr/ad/ventes_immobilieres/0000000101'],
      },
      tracked,
      undefined
    )
    expect(reasons.map(r => r.kind)).toEqual(['same_url', 'same_reference'])
    // « Même référence, autre agence » s'efface devant la même agence.
    const both = probeDuplicateReasons(
      {
        sellerName: AGENCY_A,
        reference: 'CB-77',
        otherSellers: [{ sellerName: AGENCY_B, sellerReference: 'CB-77' }],
      },
      tracked,
      undefined
    )
    expect(both.map(r => r.kind)).toEqual(['same_reference'])
    expect(probeDuplicateReasons({}, tracked, undefined)).toEqual([])
  })

  it('cherche un texte dans le titre, le lieu, l’agence, la référence, le prix', () => {
    expect(searchTokens('  Caudéran, T3 ')).toEqual(['cauderan', 't3'])
    expect(searchTokens(null)).toEqual([])
    const tracked = row({
      addressRaw: '12 rue du Forum',
      otherSellers: [{ sellerName: AGENCY_B, sellerReference: 'CB-77' }],
    })
    const hit = (q: string) => matchesSearch(tracked, searchTokens(q))
    expect(hit('')).toBe(true)
    expect(hit('balcon cauderan')).toBe(true)
    expect(hit('forum')).toBe(true)
    expect(hit('bastide')).toBe(true)
    expect(hit('ex 2041')).toBe(true)
    expect(hit('cb77')).toBe(true)
    expect(hit('214000')).toBe(true)
    expect(hit('214 000')).toBe(true)
    expect(hit('68')).toBe(true)
    expect(hit('talence')).toBe(false)
    expect(hit('balcon talence')).toBe(false)
    expect(
      matchesSearch(row({ surface: null, sellerReference: null }), ['zz'])
    ).toBe(false)
  })

  it('classe de la plus ressemblante à la moins ressemblante, la même annonce en tête', () => {
    const rows = [
      row({
        id: 'far',
        title: 'Loin',
        commune: 'Pessac',
        district: 'Centre',
        surface: 30,
        price: 120_000,
        rooms: 1,
      }),
      row({
        id: 'weak',
        title: 'Vague',
        surface: 30,
        price: 120_000,
        rooms: 1,
      }),
      row({ id: 'close', title: 'Proche', price: 230_000, floor: 4 }),
      row({ id: 'same', title: 'La même', status: 'discarded' }),
      row({
        id: 'certain',
        title: 'Certaine',
        commune: 'Mérignac',
        surface: 20,
        sellerName: AGENCY_B,
        sellerReference: 'CB-77',
      }),
      row({ id: 'self', title: 'Elle-même' }),
    ]
    const ranked = rankSimilarListings(
      probe({
        listingId: 'self',
        sellerName: AGENCY_B,
        reference: 'CB-77',
      }),
      rows
    )
    expect(ranked.compared).toBe(5)
    // « Loin » passe sous le plancher ; « Vague » reste, en dernier.
    expect(ranked.items.map(i => i.listingId)).toEqual([
      'certain',
      'same',
      'close',
      'weak',
    ])
    expect(ranked.items[3]?.level).toBe('far')
    expect(ranked.items[0]).toMatchObject({ level: 'certain', score: 1 })
    expect(ranked.items[1]).toMatchObject({
      level: 'very_close',
      linkCount: 1,
      updatedAt: '2026-11-10T10:00:00.000Z',
    })
    // Un texte cherché garde même une annonce peu ressemblante, à sa place.
    const searched = rankSimilarListings(probe(), rows, new Map(), {
      q: 'loin',
    })
    expect(searched.items.map(i => i.listingId)).toEqual(['far'])
    expect(searched.items[0]?.level).toBe('far')
    // À note égale : les annonces suivies avant les écartées, puis le titre.
    const tie = rankSimilarListings(
      probe(),
      [
        row({ id: 'b', title: 'B', status: 'discarded' }),
        row({ id: 'c', title: 'C' }),
        row({ id: 'a', title: 'A' }),
      ],
      new Map([['c', 30]]),
      { limit: 2 }
    )
    expect(tie.items.map(i => i.listingId)).toEqual(['c', 'a'])
  })

  it('résume ce qui a été trouvé', () => {
    expect(similarSummaryText([])).toBe(
      'Aucune annonce suivie ne lui ressemble'
    )
    expect(similarSummaryText([], 'forum')).toBe(
      'Aucune annonce suivie ne correspond à « forum »'
    )
    expect(similarSummaryText([{ level: 'far' }])).toBe(
      '1 annonce ressemblante'
    )
    expect(
      similarSummaryText([{ level: 'very_close' }, { level: 'close' }])
    ).toBe('2 annonces ressemblantes, dont 1 très proche')
    expect(
      similarSummaryText([{ level: 'very_close' }, { level: 'very_close' }])
    ).toBe('2 annonces ressemblantes, dont 2 très proches')
    expect(similarSummaryText([{ level: 'certain' }, { level: 'far' }])).toBe(
      '2 annonces ressemblantes, dont la même annonce'
    )
    expect(
      similarSummaryText([{ level: 'certain' }, { level: 'certain' }])
    ).toBe('2 annonces ressemblantes, dont 2 fois la même annonce')
  })
})

describe('Lot 27 : fusionner deux fiches', () => {
  const facts = (over: Partial<MergeListingFacts> = {}): MergeListingFacts => ({
    id: 'keep',
    title: 'T3 Caudéran',
    status: 'to_study',
    createdAt: '2026-11-01T10:00:00.000Z',
    mergedIntoId: null,
    locationPrecision: 'district',
    counts: { links: 1, visits: 0, offers: 0, opinions: 0, tasks: 2 },
    ...over,
  })
  const counts = (
    over: Partial<ListingMergeCounts> = {}
  ): ListingMergeCounts => ({
    links: 0,
    sellers: 0,
    visits: 0,
    offers: 0,
    opinions: 0,
    tasks: 0,
    agencyRequests: 0,
    fields: 0,
    notes: false,
    ...over,
  })

  it('refuse ce qui ne se fusionne pas', () => {
    const keep = facts()
    const absorb = facts({ id: 'absorb', title: 'T3 doublon' })
    expect(mergeRefusal(keep, absorb)).toBeNull()
    expect(mergeRefusal(keep, keep)).toBe(
      'Une fiche ne se fusionne pas avec elle-même.'
    )
    expect(mergeRefusal({ ...keep, mergedIntoId: 'x' }, absorb)).toContain(
      '« T3 Caudéran » a déjà été fusionnée dans une autre fiche'
    )
    expect(mergeRefusal(keep, { ...absorb, mergedIntoId: 'x' })).toBe(
      '« T3 doublon » a déjà été fusionnée dans une autre fiche.'
    )
    expect(
      mergeRefusal(
        { ...keep, counts: { ...keep.counts, links: LISTING_LINKS_MAX } },
        absorb
      )
    ).toContain(`au plus ${LISTING_LINKS_MAX}`)
  })

  it('complète les champs vides, garde les siens quand ils diffèrent', () => {
    const plan = mergeFieldPlan(
      {
        surface: 68,
        rooms: 3,
        dpeClass: null,
        elevator: true,
        description: '',
      },
      {
        surface: 69,
        rooms: 3,
        dpeClass: 'C',
        propertyTax: 1100,
        elevator: true,
        description: 'Bel appartement',
        syndic: null,
      }
    )
    expect(plan.values).toEqual({
      dpeClass: 'C',
      propertyTax: 1100,
      description: 'Bel appartement',
    })
    expect(plan.fills.map(f => f.field)).toEqual([
      'description',
      'dpeClass',
      'propertyTax',
    ])
    expect(n(plan.fills[2]?.other ?? '')).toBe('1 100 €')
    expect(plan.fills[2]).toMatchObject({ label: 'Taxe foncière', kept: null })
    expect(plan.differences).toHaveLength(1)
    expect(plan.differences[0]).toMatchObject({
      field: 'surface',
      kept: '68 m²',
      other: '69 m²',
    })
    expect(MERGE_FILL_FIELDS).not.toContain('price')
    expect(mergeFieldPlan({}, {})).toEqual({
      fills: [],
      differences: [],
      values: {},
    })
  })

  it('garde la provenance des champs complétés', () => {
    expect(
      mergedFieldSources(
        { price: { source: 'user' }, dpeClass: { source: 'estimated' } },
        { dpeClass: { source: 'ai', confidence: 0.9 } },
        ['dpeClass', 'propertyTax']
      )
    ).toEqual({
      price: { source: 'user' },
      dpeClass: { source: 'ai', confidence: 0.9 },
    })
  })

  it('reprend les agences inconnues de la fiche gardée, sans doublon', () => {
    const other = seller({ sellerName: AGENCY_B, sellerReference: 'CB-77' })
    // Même agence des deux côtés : rien à ajouter.
    expect(
      mergeSellersPlan({
        keep: seller(),
        keepOthers: [],
        absorb: seller({ sellerName: 'Immobilier des Chartrons' }),
        absorbOthers: [],
      })
    ).toEqual({ principal: null, add: [], dropped: 0 })
    // Une autre agence : elle s'ajoute avec sa référence.
    const added = mergeSellersPlan({
      keep: seller(),
      keepOthers: [],
      absorb: other,
      absorbOthers: [seller(), { ...NO_SELLER, sellerType: 'private' }],
    })
    expect(added.principal).toBeNull()
    expect(added.add.map(s => s.sellerReferenceKey)).toEqual(['CB77', null])
    expect(added.add[1]?.sellerType).toBe('private')
    // La fiche gardée ne savait rien : l'agence de l'autre devient la sienne.
    const filled = mergeSellersPlan({
      keep: NO_SELLER,
      keepOthers: [],
      absorb: other,
      absorbOthers: [seller()],
    })
    expect(filled.principal?.sellerName).toBe(AGENCY_B)
    expect(filled.add.map(s => s.sellerName)).toEqual([AGENCY_A])
    expect(
      mergedSellerLines({ keep: NO_SELLER, keepOthers: [], plan: filled })
    ).toEqual([
      `« ${AGENCY_B} », réf. CB-77 (reprise de l’autre fiche)`,
      `« ${AGENCY_A} », réf. EX-2041 (reprise de l’autre fiche)`,
    ])
    expect(
      mergedSellerLines({
        keep: seller(),
        keepOthers: [other],
        plan: { principal: null, add: [] },
      })
    ).toEqual([`« ${AGENCY_A} », réf. EX-2041`, `« ${AGENCY_B} », réf. CB-77`])
    expect(
      mergedSellerLines({
        keep: NO_SELLER,
        keepOthers: [],
        plan: { principal: null, add: [] },
      })
    ).toEqual([])
    // Au-delà de la limite, le reste n'est pas repris (et c'est dit).
    const full = Array.from({ length: LISTING_SELLERS_MAX }, (_, index) =>
      seller({ sellerName: `[Exemple] Agence ${index}`, sellerReference: null })
    )
    expect(
      mergeSellersPlan({
        keep: seller(),
        keepOthers: full,
        absorb: other,
        absorbOthers: [],
      })
    ).toEqual({ principal: null, add: [], dropped: 1 })
  })

  it('recopie les notes à la suite, et sait les retirer', () => {
    expect(mergedNotes('Vue le 3', '  ', 'B')).toBeNull()
    expect(mergedNotes('Vue le 3', null, 'B')).toBeNull()
    const merged = mergedNotes('Vue le 3', 'Cave humide', 'T3 doublon')
    expect(merged?.notes).toBe(
      `Vue le 3\n\n${mergedNotesHeading('T3 doublon')}\nCave humide`
    )
    expect(
      withoutMergedNotes(merged?.notes ?? null, merged?.appended ?? '')
    ).toBe('Vue le 3')
    const alone = mergedNotes(null, 'Cave humide', 'T3 doublon')
    expect(alone?.notes).toBe(alone?.appended)
    expect(
      withoutMergedNotes(alone?.notes ?? null, alone?.appended ?? '')
    ).toBeNull()
    // Retouchées depuis : elles restent telles quelles.
    expect(withoutMergedNotes('Autre chose', merged?.appended ?? '')).toBe(
      'Autre chose'
    )
    expect(withoutMergedNotes(null, 'x')).toBeNull()
    expect(withoutMergedNotes('Notes', '')).toBe('Notes')
  })

  it('ne reprend pas une tâche que la fiche gardée a déjà', () => {
    expect(taskLabelKey('  Demander  la TAXE foncière ')).toBe(
      'demander la taxe fonciere'
    )
    expect(
      tasksToMove(
        [{ label: 'Demander la taxe foncière' }],
        [
          { id: '1', label: 'demander la taxe fonciere' },
          { id: '2', label: 'Vérifier la cave' },
          { id: '3', label: 'Vérifier  la cave' },
        ]
      ).map(t => t.id)
    ).toEqual(['2'])
  })

  it('propose de garder la plus avancée, puis la plus suivie, la mieux placée, la plus ancienne', () => {
    const a = facts({ id: 'a' })
    expect(suggestKeep(a, facts({ id: 'b', status: 'visited' }))).toEqual({
      id: 'b',
      reason: 'c’est la plus avancée dans le parcours',
    })
    expect(
      suggestKeep(facts({ id: 'a', status: 'to_visit' }), facts({ id: 'b' })).id
    ).toBe('a')
    expect(
      suggestKeep(a, facts({ id: 'b', counts: { ...a.counts, opinions: 2 } }))
    ).toEqual({
      id: 'b',
      reason: 'c’est elle qui porte le plus de suivi (visites, offres, avis)',
    })
    expect(
      suggestKeep(
        facts({ id: 'a', counts: { ...a.counts, visits: 1 } }),
        facts({ id: 'b' })
      ).id
    ).toBe('a')
    expect(
      suggestKeep(a, facts({ id: 'b', locationPrecision: 'exact' }))
    ).toEqual({ id: 'b', reason: 'c’est la mieux placée sur la carte' })
    expect(suggestKeep(a, facts({ id: 'b', locationPrecision: null })).id).toBe(
      'a'
    )
    expect(
      suggestKeep(a, facts({ id: 'b', createdAt: '2026-10-01T10:00:00.000Z' }))
    ).toEqual({ id: 'b', reason: 'c’est la plus ancienne' })
    expect(suggestKeep(a, facts({ id: 'b' })).id).toBe('a')
  })

  it('dit ce qui rejoint la fiche gardée, et ce qui reste', () => {
    expect(mergeMoveLines(counts())).toEqual([])
    expect(
      mergeMoveLines(
        counts({
          links: 1,
          sellers: 1,
          visits: 1,
          offers: 1,
          opinions: 1,
          tasks: 1,
          agencyRequests: 1,
          fields: 1,
          notes: true,
        })
      )
    ).toEqual([
      '1 lien de portail, avec son prix et ses vérifications',
      '1 agence avec sa référence',
      '1 visite et leurs photos',
      '1 offre',
      '1 avis',
      '1 tâche',
      '1 question à l’agence',
      '1 champ vide complété',
      'ses notes, recopiées à la suite des tiennes',
    ])
    expect(
      mergeMoveLines(
        counts({ links: 2, sellers: 2, agencyRequests: 2, fields: 3 })
      )
    ).toEqual([
      '2 liens de portail, avec leurs prix et leurs vérifications',
      '2 agences avec leurs références',
      '2 questions aux agences',
      '3 champs vides complétés',
    ])
    expect(mergeSummaryText('B', counts())).toBe(
      'Fusionnée avec « B » (rien à reprendre)'
    )
    expect(
      mergeSummaryText(
        'B',
        counts({
          links: 2,
          sellers: 1,
          visits: 1,
          offers: 2,
          opinions: 1,
          tasks: 3,
          agencyRequests: 1,
          fields: 2,
          notes: true,
        })
      )
    ).toBe(
      'Fusionnée avec « B » : 2 liens, 1 agence, 1 visite, 2 offres, 1 avis, 3 tâches, 1 question, 2 champs complétés, notes recopiées'
    )
    expect(mergedDiscardReason('A')).toBe(
      'Doublon de « A » (fiches fusionnées)'
    )
    expect(mergedListingRefusal('A')).toContain('fusionnée dans « A »')
    expect(mergedBannerText('A')).toContain('Doublon fusionné dans « A »')
    expect(
      mergeLeftBehindLines({
        opinionsKept: 0,
        tasksKept: 0,
        sellersDropped: 0,
        hasAddress: false,
      })
    ).toHaveLength(1)
    const left = mergeLeftBehindLines({
      opinionsKept: 1,
      tasksKept: 2,
      sellersDropped: 1,
      hasAddress: true,
    })
    expect(left).toHaveLength(5)
    expect(left[1]).toContain('1 avis n’est pas repris')
    expect(left[2]).toContain('2 tâches ne sont pas reprises')
    expect(left[3]).toContain('1 agence n’est pas reprise')
    expect(
      mergeLeftBehindLines({
        opinionsKept: 2,
        tasksKept: 1,
        sellersDropped: 2,
        hasAddress: false,
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('2 avis ne sont pas repris'),
        expect.stringContaining('1 tâche n’est pas reprise'),
        expect.stringContaining('2 agences ne sont pas reprises'),
      ])
    )
  })
})

describe('Lot 27 : journal, notifications, « ce qui a changé »', () => {
  const noChanges = () => []
  const summaryOf = (action: string, before: unknown, after: unknown) =>
    describeMergeActivity(action, before, after, noChanges)?.summary

  it('raconte une fusion des deux côtés, son annulation et les agences', () => {
    expect(MERGE_ACTIONS).toHaveLength(7)
    expect(
      summaryOf('listing.merged', null, {
        absorbedTitle: 'B',
        summary: 'Fusionnée avec « B » : 2 liens, 1 agence',
      })
    ).toBe('a fusionné dans cette fiche son doublon « B » : 2 liens, 1 agence')
    expect(
      summaryOf('listing.merged', null, {
        absorbedTitle: 'B',
        summary: 'Fusionnée avec « B » (rien à reprendre)',
      })
    ).toBe('a fusionné dans cette fiche son doublon « B » (rien à reprendre)')
    expect(summaryOf('listing.merged', null, null)).toBe(
      'a fusionné dans cette fiche son doublon une autre fiche'
    )
    expect(summaryOf('listing.absorbed', null, { keptTitle: 'A' })).toBe(
      'a fusionné cette fiche dans « A » (doublon) : elle n’est plus suivie'
    )
    expect(summaryOf('listing.unmerged', null, { absorbedTitle: 'B' })).toBe(
      'a annulé la fusion avec « B » : ce qui en venait y est retourné'
    )
    expect(summaryOf('listing.unabsorbed', null, { keptTitle: 'A' })).toBe(
      'a annulé la fusion dans « A » : la fiche est de nouveau suivie'
    )
    expect(
      summaryOf('listing.seller_added', null, { seller: '« X », réf. A-1' })
    ).toBe('a ajouté une autre agence qui vend le même bien : « X », réf. A-1')
    expect(summaryOf('listing.seller_added', null, [])).toBe(
      'a ajouté une autre agence qui vend le même bien : agence'
    )
    expect(summaryOf('listing.seller_removed', { seller: '« X »' }, null)).toBe(
      'a retiré une agence de la fiche : « X »'
    )
    expect(summaryOf('listing.seller_removed', null, null)).toBe(
      'a retiré une agence de la fiche : agence'
    )
    expect(summaryOf('listing.updated', null, null)).toBeUndefined()
  })

  it('le journal de la fiche montre le prix que la fusion a changé', () => {
    const description = describeActivity({
      action: 'listing.merged',
      channel: 'web',
      actorMemberId: null,
      before: { facts: { price: 214_000 } },
      after: {
        absorbedTitle: 'B',
        summary: 'Fusionnée avec « B » : 1 lien',
        facts: { price: 209_000 },
      },
    })
    expect(description.summary).toBe(
      'a fusionné dans cette fiche son doublon « B » : 1 lien'
    )
    expect(description.changes.map(c => c.field)).toEqual(['price'])
  })

  it('une fusion prévient les autres membres et compte dans « ce qui a changé »', () => {
    const event = {
      action: 'listing.merged',
      channel: 'mcp' as const,
      actorMemberId: 'richard',
      listingId: 'listing-1',
      before: null,
      after: { absorbedTitle: 'B', summary: 'Fusionnée avec « B » : 1 lien' },
    }
    const drafts = notificationsForActivity(event, {
      members: [
        { id: 'richard', displayName: 'Richard', role: 'owner' },
        { id: 'chloe', displayName: 'Chloé', role: 'member' },
      ],
      listingTitle: 'T3 Caudéran',
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      recipientId: 'chloe',
      type: 'listing_checked',
      title: 'Fiches fusionnées : T3 Caudéran',
      url: '/annonces/listing-1',
    })
    expect(drafts[0]?.body).toContain('La fusion s’annule depuis la fiche.')
    const base = {
      id: 'log-1',
      listingId: 'listing-1',
      createdAt: '2026-11-11T10:00:00.000Z',
    }
    expect(whatsNewKindOf({ ...base, ...event }, 'chloe')).toBe('listing_check')
    expect(
      whatsNewKindOf(
        {
          ...base,
          ...event,
          after: { ...event.after, facts: { price: 209_000 } },
        },
        'chloe'
      )
    ).toBe('price_change')
  })
})
