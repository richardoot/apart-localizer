/**
 * Lot 18 : une annonce, plusieurs portails. Liens (clé, portail, lien
 * principal, état), prix de la fiche (le plus bas en ligne, proposé quand il
 * a été saisi à la main), écart entre portails, vérification d'un lien,
 * vendeur et référence, reconnaissance de la même annonce, journal,
 * notifications et « ce qui a changé ». Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type { ListingObserved } from '@apart/contracts'
import {
  activityChanges,
  comparedPriceText,
  portalWhere,
  agencyKey,
  cleanReference,
  cleanSellerName,
  computeWhatsNew,
  describeActivity,
  describeLinkActivity,
  detectLinkPortal,
  duplicateReasons,
  fichePriceDecision,
  fichePriceProposal,
  isCertainMatch,
  linkAddedChange,
  linkAddedDiff,
  linkCheckDiff,
  linkCountText,
  linkKey,
  linkPortalFromUrl,
  linkPortalName,
  linkPriceGap,
  linkSeenText,
  linkStateText,
  linkSubLabel,
  linksAvailability,
  listingChangedFields,
  listingCheckSummary,
  lowestOnlinePrice,
  matchDuplicates,
  normalizeListingUrl,
  normalizeSeller,
  notificationTypeOf,
  notificationsForActivity,
  orderLinks,
  portalFromUrl,
  portalOfListingSource,
  priceGapText,
  priceRangeText,
  priceSpread,
  primaryLink,
  primarySourceFields,
  referenceKey,
  referenceMatchOf,
  referenceProvenanceText,
  referenceReason,
  resolveLinkCheckOutcome,
  rowLinkKeys,
  sameAgency,
  sameUrlMatchOf,
  sellerChipText,
  sellerContradiction,
  sellerListLabel,
  sellerNameLabel,
  sellerObservationDiff,
  sellerText,
  shortDay,
  whatsNewKindOf,
} from '../src/index.js'
import type {
  CheckableListing,
  DuplicateRow,
  LinkState,
  SellerFacts,
  WhatsNewEvent,
} from '../src/index.js'

/** Espaces fines insécables de fr-FR → espaces simples, pour comparer. */
const n = (value: string | null | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? value

const NOW = '2026-11-06T10:00:00.000Z'

const link = (over: Partial<LinkState> = {}): LinkState => ({
  id: 'l1',
  portal: 'leboncoin',
  url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000101',
  normalizedUrl: 'https://leboncoin.fr/ad/ventes_immobilieres/0000000101',
  externalId: '0000000101',
  price: 214_000,
  priceAt: '2026-11-02T10:00:00.000Z',
  online: true,
  offlineSince: null,
  lastSeenOnlineAt: '2026-11-05T10:00:00.000Z',
  lastCheckedAt: '2026-11-05T10:00:00.000Z',
  createdAt: '2026-11-02T10:00:00.000Z',
  origin: 'original',
  readSellerName: null,
  readReference: null,
  ...over,
})

const lbc = link()
const sl = link({
  id: 'l2',
  portal: 'seloger',
  url: 'https://www.seloger.com/annonces/achat/appartement/exemple/0000000202.htm',
  normalizedUrl:
    'https://seloger.com/annonces/achat/appartement/exemple/0000000202.htm',
  externalId: null,
  price: 219_000,
  createdAt: '2026-11-03T10:00:00.000Z',
  origin: 'claude',
})
const bi = link({
  id: 'l3',
  portal: 'bienici',
  url: 'https://www.bienici.com/annonce/vente/exemple/0000000303',
  normalizedUrl: 'https://bienici.com/annonce/vente/exemple/0000000303',
  externalId: null,
  price: 214_000,
  online: false,
  offlineSince: '2026-11-04T10:00:00.000Z',
  createdAt: '2026-11-03T12:00:00.000Z',
  origin: 'manual',
})

const stored: CheckableListing = {
  status: 'to_study',
  price: 214_000,
  annualCharges: null,
  propertyTax: null,
  surface: 68,
  rooms: 3,
  dpeClass: 'C',
  gesClass: null,
  dpeConsumption: null,
  description: null,
  publishedAt: '2026-11-01T00:00:00.000Z',
  sourceUpdatedAt: null,
  url: lbc.url,
}

const agency: SellerFacts = {
  sellerType: 'agency',
  sellerName: '[Exemple] Immobilier des Chartrons',
  sellerReference: 'EX-2041',
}
const unknownSeller: SellerFacts = {
  sellerType: 'unknown',
  sellerName: null,
  sellerReference: null,
}

const check = (
  observed: ListingObserved,
  over: {
    links?: LinkState[]
    linkId?: string | null
    priceSource?: 'user' | 'listing' | 'ai' | null
    stored?: Partial<CheckableListing>
    seller?: SellerFacts
  } = {}
) =>
  linkCheckDiff({
    stored: { ...stored, ...over.stored },
    priceSource: over.priceSource === undefined ? 'listing' : over.priceSource,
    seller: over.seller ?? agency,
    links: over.links ?? [lbc, sl, bi],
    linkId: over.linkId === undefined ? 'l1' : over.linkId,
    observed,
    now: NOW,
  })

describe('liens : clé, portail', () => {
  it('la clé d’un lien : normalisée sur un portail, telle quelle sinon', () => {
    expect(
      linkKey(
        'https://www.leboncoin.fr/ventes_immobilieres/0000000101.htm?ac=1'
      )
    ).toBe('https://leboncoin.fr/ad/ventes_immobilieres/0000000101')
    expect(linkKey('  ftp://exemple.invalid/a  ')).toBe(
      'ftp://exemple.invalid/a'
    )
    expect(linkKey('   ')).toBeNull()
    expect(linkKey(null)).toBeNull()
    expect(linkKey(undefined)).toBeNull()
  })

  it('le portail d’après l’hôte, sinon celui donné, sinon « autre »', () => {
    expect(linkPortalFromUrl('https://www.logic-immo.com/detail/1')).toBe(
      'logicimmo'
    )
    expect(linkPortalFromUrl('https://agence.exemple.invalid/1')).toBeNull()
    expect(detectLinkPortal('https://www.pap.fr/annonces/1', 'agence')).toBe(
      'pap'
    )
    expect(detectLinkPortal('https://agence.exemple.invalid/1', 'agence')).toBe(
      'agence'
    )
    expect(detectLinkPortal('https://agence.exemple.invalid/1')).toBe('autre')
    // Les fonctions du lot 16 restent les mêmes.
    expect(portalFromUrl('pas un lien')).toBe('other')
    expect(normalizeListingUrl('mailto:x@exemple.invalid')).toBeNull()
  })

  it('le portail d’une annonce enregistrée, d’après sa source', () => {
    expect(portalOfListingSource('autre', 'Logic-Immo', null)).toBe('logicimmo')
    expect(portalOfListingSource('agence', null, null)).toBe('agence')
    expect(
      portalOfListingSource('agence', null, 'https://www.seloger.com/a/1')
    ).toBe('seloger')
    expect(portalOfListingSource('autre', null, null)).toBe('autre')
  })
})

describe('liens : principal, état, prix', () => {
  it('le principal est le plus ancien en ligne, à défaut le plus ancien', () => {
    expect(primaryLink([sl, lbc, bi])?.id).toBe('l1')
    expect(primaryLink([sl, { ...lbc, online: false }])?.id).toBe('l2')
    expect(
      primaryLink([
        { ...sl, online: false },
        { ...lbc, online: false },
      ])?.id
    ).toBe('l1')
    expect(primaryLink([])).toBeNull()
    // À date égale, l'identifiant départage.
    expect(
      primaryLink([
        { ...sl, createdAt: lbc.createdAt },
        { ...lbc, id: 'l0' },
      ])?.id
    ).toBe('l0')
    expect(
      orderLinks([bi, sl, { ...lbc, online: false }]).map(l => l.id)
    ).toEqual(['l2', 'l1', 'l3'])
  })

  it('en ligne partout, en partie, plus en ligne, aucun lien', () => {
    expect(linksAvailability([])).toBe('none')
    expect(linksAvailability([lbc, sl])).toBe('online')
    expect(linksAvailability([lbc, bi])).toBe('partial')
    expect(linksAvailability([bi])).toBe('offline')
    expect(linkCountText([])).toBe('Aucun lien')
    expect(linkCountText([lbc])).toBe('1 lien · en ligne')
    expect(linkCountText([bi])).toBe('1 lien · plus en ligne')
    expect(linkCountText([lbc, sl, bi])).toBe('3 liens · 2 en ligne')
  })

  it('le plus bas en ligne, l’écart entre portails', () => {
    expect(lowestOnlinePrice([lbc, sl, bi])?.link.id).toBe('l1')
    expect(lowestOnlinePrice([bi])).toBeNull()
    expect(lowestOnlinePrice([{ ...lbc, price: null }])).toBeNull()
    const spread = priceSpread([lbc, sl, bi])
    expect(spread?.gap).toBe(5_000)
    expect(spread?.max.link.id).toBe('l2')
    expect(priceSpread([lbc, { ...sl, price: 214_000.5 }])).toBeNull()
    expect(priceSpread([])).toBeNull()
    expect(linkPriceGap(sl, [lbc, sl, bi])).toBe(5_000)
    expect(linkPriceGap(lbc, [lbc, sl, bi])).toBeNull()
    expect(linkPriceGap(bi, [lbc, sl, bi])).toBeNull()
    expect(linkPriceGap({ ...sl, price: 219_000 }, [bi])).toBeNull()
    expect(n(priceGapText(5_000))).toBe('+5 000 € : frais inclus ?')
    expect(n(priceRangeText([lbc, sl]))).toBe(
      'jusqu’à 219 000 € selon le portail'
    )
    expect(priceRangeText([lbc])).toBeNull()
    expect(n(comparedPriceText(219_000, 214_000))).toBe(
      '219 000 € : 5 000 € de plus'
    )
    expect(n(comparedPriceText(209_000, 214_000))).toBe(
      '209 000 € : 5 000 € de moins'
    )
    expect(comparedPriceText(214_000.5, 214_000)).toBe('même prix')
    expect(comparedPriceText(null, 214_000)).toBe('prix à relever')
    expect(comparedPriceText(0, 214_000)).toBe('prix à relever')
    expect(portalWhere('seloger')).toBe('sur SeLoger')
    expect(portalWhere('agence')).toBe('sur le site de l’agence')
    expect(portalWhere('autre')).toBe('sur le portail')
    expect(portalWhere(undefined)).toBe('sur le portail')
  })

  it('vue en ligne : aujourd’hui, hier, le 4 nov., pas encore vue', () => {
    const now = new Date(NOW)
    expect(
      linkSeenText({ lastSeenOnlineAt: NOW, offlineSince: null }, now)
    ).toBe('aujourd’hui')
    expect(
      linkSeenText(
        { lastSeenOnlineAt: '2026-11-05T09:00:00.000Z', offlineSince: null },
        now
      )
    ).toBe('hier')
    expect(
      linkSeenText(
        { lastSeenOnlineAt: null, offlineSince: '2026-11-04T10:00:00.000Z' },
        now
      )
    ).toBe('le 4 nov.')
    expect(
      linkSeenText({ lastSeenOnlineAt: null, offlineSince: null }, now)
    ).toBe('pas encore vue')
    expect(linkStateText(bi, now)).toBe('Plus en ligne · le 4 nov.')
    expect(linkStateText(lbc, now)).toBe('vue hier')
    expect(linkStateText({ ...lbc, lastSeenOnlineAt: null }, now)).toBe(
      'pas encore vue'
    )
    expect(shortDay('2026-11-03T10:00:00.000Z')).toBe('3 nov.')
  })

  it('la ligne sous le portail', () => {
    expect(linkSubLabel(lbc)).toBe('lien d’origine · n° 0000000101')
    expect(linkSubLabel(sl, { autoAttached: true })).toBe(
      'rattaché par Claude, même référence'
    )
    expect(linkSubLabel(bi)).toBe('rattaché à la main')
  })

  it('le lien principal recopié dans l’annonce, libellé saisi gardé', () => {
    expect(
      primarySourceFields(
        { portal: 'logicimmo', url: 'https://www.logic-immo.com/d/1' },
        { sourceLabel: null }
      )
    ).toEqual({
      url: 'https://www.logic-immo.com/d/1',
      source: 'autre',
      sourceLabel: 'Logic-Immo',
      externalId: null,
    })
    expect(
      primarySourceFields(
        { portal: 'leboncoin', url: lbc.url, externalId: '0000000101' },
        { sourceLabel: 'Logic-Immo' }
      )
    ).toEqual({
      url: lbc.url,
      source: 'leboncoin',
      sourceLabel: null,
      externalId: '0000000101',
    })
    expect(
      primarySourceFields(
        { portal: 'agence', url: 'https://agence.exemple.invalid/1' },
        { sourceLabel: '[Exemple] Agence du port' }
      ).sourceLabel
    ).toBe('[Exemple] Agence du port')
  })
})

describe('le prix de la fiche', () => {
  it('suit le plus bas en ligne, comme un changement de prix ordinaire', () => {
    expect(
      fichePriceDecision({
        fichePrice: 214_000,
        priceSource: 'user',
        before: [lbc, sl],
        after: [{ ...lbc, price: 209_000 }, sl],
      })
    ).toEqual({
      kind: 'apply',
      from: 214_000,
      to: 209_000,
      portal: 'leboncoin',
      linkId: 'l1',
    })
  })

  it('un prix saisi à la main qui ne suivait pas les liens est proposé, jamais écrasé', () => {
    expect(
      fichePriceDecision({
        fichePrice: 205_000,
        priceSource: 'user',
        before: [lbc, sl],
        after: [{ ...lbc, price: 209_000 }, sl],
      })
    ).toMatchObject({ kind: 'propose', from: 205_000, to: 209_000 })
    // Aucun lien n'avait de prix : saisi à la main, il est gardé.
    expect(
      fichePriceDecision({
        fichePrice: 214_000,
        priceSource: 'user',
        before: [{ ...lbc, price: null }],
        after: [{ ...lbc, price: 209_000 }],
      }).kind
    ).toBe('propose')
    // Lu par l'IA ou sans provenance : il suit les liens.
    expect(
      fichePriceDecision({
        fichePrice: 205_000,
        priceSource: 'ai',
        before: [lbc],
        after: [{ ...lbc, price: 209_000 }],
      }).kind
    ).toBe('apply')
  })

  it('rien sans lien en ligne au prix connu, ni à l’euro près', () => {
    expect(
      fichePriceDecision({
        fichePrice: 214_000,
        priceSource: null,
        before: [lbc],
        after: [{ ...lbc, online: false }],
      })
    ).toEqual({ kind: 'none' })
    expect(
      fichePriceDecision({
        fichePrice: 214_000,
        priceSource: null,
        before: [lbc],
        after: [{ ...lbc, price: 214_000.4 }],
      })
    ).toEqual({ kind: 'none' })
  })

  it('la proposition visible sur la fiche', () => {
    expect(
      n(
        fichePriceProposal({
          fichePrice: 214_000,
          priceSource: 'user',
          links: [{ ...lbc, price: 209_000 }, sl],
        })?.text
      )
    ).toBe(
      'Prix de la fiche saisi à la main : 214 000 €. Le plus bas affiché en ligne est 209 000 € (Leboncoin).'
    )
    expect(
      n(
        fichePriceProposal({
          fichePrice: 214_000,
          priceSource: 'listing',
          links: [{ ...sl, price: 209_000 }],
        })?.text
      )
    ).toBe(
      'Le plus bas affiché en ligne est 209 000 € (SeLoger), la fiche dit 214 000 €.'
    )
    expect(
      fichePriceProposal({
        fichePrice: 214_000,
        priceSource: 'user',
        links: [lbc, sl],
      })
    ).toBeNull()
    expect(
      fichePriceProposal({
        fichePrice: 214_000,
        priceSource: 'user',
        links: [],
      })
    ).toBeNull()
  })
})

describe('linkCheckDiff : la vérification d’un lien', () => {
  it('un seul lien : le prix lu devient celui de la fiche, en une ligne (lot 15)', () => {
    const d = check({ price: 205_000, online: true }, { links: [lbc] })
    expect(d.price).toEqual({ from: 214_000, to: 205_000 })
    expect(d.patch).toEqual({ price: 205_000 })
    expect(d.changes.map(c => n(c.text))).toEqual([
      'Prix 214 000 € → 205 000 €',
    ])
    expect(d.linkPatch).toMatchObject({
      price: 205_000,
      priceAt: NOW,
      lastSeenOnlineAt: NOW,
    })
    expect(d.linksAfter[0]?.price).toBe(205_000)
    expect(d.allOffline).toBe(false)
  })

  it('le prix d’un autre portail plus haut : noté, la fiche ne bouge pas', () => {
    const d = check({ price: 224_000, online: true }, { linkId: 'l2' })
    expect(d.patch).toEqual({})
    expect(d.fichePrice).toEqual({ kind: 'none' })
    expect(d.changes.map(c => [c.field, c.disposition, n(c.text)])).toEqual([
      ['linkPrice', 'applied', 'Prix sur SeLoger 219 000 € → 224 000 €'],
      [
        'priceGap',
        'noted',
        'Écart entre portails : SeLoger affiche 224 000 €, +10 000 € par rapport à Leboncoin (214 000 €) : frais inclus ?',
      ],
    ])
  })

  it('un autre portail moins cher : le plus bas devient le prix de la fiche', () => {
    const d = check({ price: 209_000 }, { linkId: 'l2' })
    expect(d.patch.price).toBe(209_000)
    expect(n(d.changes[0]?.text)).toBe('Prix 214 000 € → 209 000 €')
    expect(d.changes.map(c => c.field)).toEqual(['price', 'priceGap'])
    expect(n(d.changes[1]?.text)).toBe(
      'Écart entre portails : Leboncoin affiche 214 000 €, +5 000 € par rapport à SeLoger (209 000 €) : frais inclus ?'
    )
  })

  it('un prix saisi à la main est proposé, la ligne du portail reste', () => {
    const d = check(
      { price: 209_000 },
      { linkId: 'l2', priceSource: 'user', stored: { price: 200_000 } }
    )
    expect(d.patch.price).toBeUndefined()
    expect(d.fichePrice.kind).toBe('propose')
    expect(d.changes.map(c => [c.field, c.disposition])).toEqual([
      ['price', 'proposed'],
      ['linkPrice', 'applied'],
      ['priceGap', 'noted'],
    ])
    expect(n(d.changes[0]?.text)).toBe(
      'Prix le plus bas en ligne 209 000 € (SeLoger) : prix de la fiche saisi à la main (200 000 €) gardé, à appliquer si vous le souhaitez'
    )
  })

  it('un lien plus en ligne parmi d’autres : la fiche suit, rien n’est proposé', () => {
    const d = check(
      { online: false },
      {
        links: [lbc, { ...sl, price: 209_000 }],
        linkId: 'l2',
        stored: { price: 209_000 },
      }
    )
    expect(d.suggestedStatus).toBeNull()
    expect(d.allOffline).toBe(false)
    expect(d.linkPatch).toEqual({ online: false, offlineSince: NOW })
    expect(d.changes.map(c => [c.field, c.disposition, n(c.text)])).toEqual([
      [
        'price',
        'applied',
        'Prix 209 000 € → 214 000 € (plus bas en ligne : Leboncoin)',
      ],
      [
        'online',
        'applied',
        'Plus en ligne sur SeLoger (toujours en ligne sur Leboncoin)',
      ],
      ['priceGap', 'noted', 'Prix alignés sur les portails (214 000 €)'],
    ])
  })

  it('plus aucun lien en ligne : « Vendu ou retiré » proposé', () => {
    const d = check({ online: false }, { links: [lbc, bi] })
    expect(d.allOffline).toBe(true)
    expect(d.suggestedStatus).toBe('sold_or_withdrawn')
    expect(d.changes.map(c => [c.field, c.disposition, c.text])).toEqual([
      ['online', 'applied', 'Plus en ligne sur Leboncoin'],
      [
        'status',
        'proposed',
        'Plus en ligne sur aucun portail : statut proposé « Vendu ou retiré »',
      ],
    ])
    // Un seul lien : la phrase du lot 15.
    expect(check({ online: false }, { links: [lbc] }).changes).toEqual([
      expect.objectContaining({
        field: 'status',
        text: 'Plus en ligne : statut proposé « Vendu ou retiré »',
      }),
    ])
    // Déjà vendue : noté.
    expect(
      check(
        { online: false },
        { links: [lbc], stored: { status: 'sold_or_withdrawn' } }
      ).changes
    ).toEqual([
      expect.objectContaining({
        field: 'online',
        disposition: 'noted',
        text: 'Plus en ligne (statut déjà « Vendu ou retiré »)',
      }),
    ])
  })

  it('de nouveau en ligne, ou toujours en ligne alors que vendue', () => {
    const back = check({ online: true }, { linkId: 'l3' })
    expect(back.linkPatch).toEqual({
      lastSeenOnlineAt: NOW,
      online: true,
      offlineSince: null,
    })
    expect(back.changes.map(c => c.text)).toEqual([
      'De nouveau en ligne sur Bien’ici',
    ])
    const sold = check(
      { online: true },
      { links: [lbc], stored: { status: 'sold_or_withdrawn' } }
    )
    expect(sold.changes).toEqual([
      expect.objectContaining({
        disposition: 'noted',
        text: 'Toujours en ligne alors que l’annonce est « Vendu ou retiré »',
      }),
    ])
  })

  it('le lien a changé sur le portail ; les faits du bien suivent le lot 15', () => {
    const d = check(
      {
        url: 'https://www.seloger.com/annonces/achat/appartement/exemple/0000000204.htm',
        surface: 67,
        annualCharges: 1_200,
      },
      { linkId: 'l2' }
    )
    expect(d.linkPatch.normalizedUrl).toBe(
      'https://seloger.com/annonces/achat/appartement/exemple/0000000204.htm'
    )
    expect(d.patch).toEqual({ surface: 67, annualCharges: 1_200 })
    expect(d.changes.map(c => c.text)).toContain('Lien SeLoger modifié')
    expect(
      check(
        { url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/0000000109' },
        { links: [lbc] }
      ).changes.map(c => c.text)
    ).toEqual(['Lien de l’annonce modifié'])
    // Le même lien, autrement écrit : rien.
    expect(check({ url: `${lbc.url}?utm_source=x` }).changes).toEqual([])
  })

  it('le vendeur lu : appliqué s’il était inconnu, lu sur le lien', () => {
    const d = check(
      {
        sellerType: 'agency',
        sellerName: '[Exemple] Agence du port',
        reference: 'Réf. EX-77',
      },
      { seller: unknownSeller }
    )
    expect(d.sellerPatch).toEqual({
      sellerType: 'agency',
      sellerName: '[Exemple] Agence du port',
      sellerReference: 'EX-77',
    })
    expect(d.linkPatch).toMatchObject({
      readSellerName: '[Exemple] Agence du port',
      readReference: 'EX-77',
    })
    // L'état du lien rendu porte ce qui y a été lu.
    expect(d.linksAfter.find(l => l.id === d.link?.id)).toMatchObject({
      readSellerName: '[Exemple] Agence du port',
      readReference: 'EX-77',
    })
  })

  it('sans lien : les règles du lot 15', () => {
    const d = check(
      { price: 205_000, online: false, reference: 'EX-2041' },
      { links: [], linkId: null }
    )
    expect(d.link).toBeNull()
    expect(d.fichePrice).toEqual({
      kind: 'apply',
      from: 214_000,
      to: 205_000,
      portal: null,
      linkId: null,
    })
    expect(d.allOffline).toBe(true)
    expect(d.suggestedStatus).toBe('sold_or_withdrawn')
    expect(check({}, { links: [], linkId: null }).fichePrice).toEqual({
      kind: 'none',
    })
    // Un lien inconnu se lit comme « sans lien ».
    expect(check({}, { linkId: 'nope' }).link).toBeNull()
  })
})

describe('resolveLinkCheckOutcome', () => {
  const resolve = (
    observed: ListingObserved,
    declared?: Parameters<typeof resolveLinkCheckOutcome>[0]['declared'],
    over: Parameters<typeof check>[1] = {},
    linked = false
  ) =>
    resolveLinkCheckOutcome({
      declared,
      observed,
      diff: check(observed, over),
      linked,
    })

  it('déduit : mise à jour, inchangée, plus en ligne (partout ou sur un lien)', () => {
    expect(resolve({ price: 209_000, online: true })).toMatchObject({
      ok: true,
      outcome: 'changed',
      seenOnline: true,
    })
    expect(resolve({ online: true })).toMatchObject({
      outcome: 'unchanged',
    })
    expect(
      resolve({ online: false }, undefined, { links: [lbc] })
    ).toMatchObject({ outcome: 'offline', seenOnline: false })
    expect(
      resolve({ online: false }, undefined, { linkId: 'l2' })
    ).toMatchObject({ outcome: 'changed', seenOnline: false })
    expect(
      resolve({ online: false }, undefined, { linkId: 'l3' })
    ).toMatchObject({ outcome: 'unchanged', seenOnline: false })
    expect(resolve({}, undefined, {}, true)).toMatchObject({
      outcome: 'republished',
    })
  })

  it('« offline » déclaré sur un lien parmi d’autres : une mise à jour', () => {
    expect(
      resolve({ online: false }, 'offline', { linkId: 'l2' })
    ).toMatchObject({ ok: true, outcome: 'changed' })
    expect(
      resolve({ online: false }, 'offline', { links: [lbc] })
    ).toMatchObject({ ok: true, outcome: 'offline' })
    expect(resolve({}, 'offline', { links: [lbc] })).toMatchObject({
      ok: true,
      outcome: 'offline',
    })
    expect(resolve({ online: true }, 'offline')).toMatchObject({ ok: false })
  })

  it('refuse ce qui ne colle pas', () => {
    expect(resolve({ price: 1 }, 'inaccessible')).toMatchObject({ ok: false })
    expect(resolve({}, 'inaccessible')).toMatchObject({
      ok: true,
      outcome: 'inaccessible',
      applyFacts: false,
    })
    expect(resolve({}, 'republished')).toMatchObject({ ok: false })
    expect(
      resolve(
        {
          url: 'https://www.seloger.com/annonces/achat/appartement/exemple/0000000209.htm',
        },
        'republished',
        { linkId: 'l2' }
      )
    ).toMatchObject({ ok: true, outcome: 'republished', seenOnline: true })
    expect(resolve({ online: true }, 'republished', {}, true)).toMatchObject({
      ok: true,
      seenOnline: true,
    })
    expect(
      resolve({ online: false }, 'unchanged', { links: [lbc] })
    ).toMatchObject({ ok: false })
    expect(resolve({}, 'changed', {}, true)).toMatchObject({ ok: false })
    expect(resolve({ online: true }, 'changed')).toMatchObject({ ok: false })
    expect(resolve({ price: 209_000 }, 'unchanged')).toMatchObject({
      ok: false,
    })
    expect(resolve({ price: 209_000 }, 'changed')).toMatchObject({
      ok: true,
      outcome: 'changed',
    })
    expect(resolve({}, 'link_added')).toMatchObject({ ok: false })
  })
})

describe('un lien ajouté', () => {
  const added = link({
    id: 'new',
    portal: 'logicimmo',
    url: 'https://www.logic-immo.com/detail-vente-exemple.htm',
    normalizedUrl: 'https://logic-immo.com/detail-vente-exemple.htm',
    externalId: null,
    price: null,
    createdAt: NOW,
    origin: 'claude',
  })

  it('la ligne « Lien … ajouté », prix lu ou à relever', () => {
    expect(n(linkAddedChange({ ...added, price: 219_000 }).text)).toBe(
      'Lien Logic-Immo ajouté : 219 000 €'
    )
    expect(linkAddedChange(added).text).toBe(
      'Lien Logic-Immo ajouté (prix à relever)'
    )
    expect(linkAddedChange({ ...added, online: false }).text).toBe(
      'Lien Logic-Immo ajouté (plus en ligne)'
    )
  })

  it('le plan d’un ajout : le prix du lien, l’écart noté, la fiche suit', () => {
    const d = linkAddedDiff({
      stored,
      priceSource: 'user',
      seller: agency,
      links: [lbc],
      link: added,
      observed: { price: 219_000, online: true },
      now: NOW,
    })
    expect(d.changes.map(c => [c.field, n(c.text)])).toEqual([
      ['link', 'Lien Logic-Immo ajouté : 219 000 €'],
      [
        'priceGap',
        'Écart entre portails : Logic-Immo affiche 219 000 €, +5 000 € par rapport à Leboncoin (214 000 €) : frais inclus ?',
      ],
    ])
    expect(d.linksAfter).toHaveLength(2)
    const cheaper = linkAddedDiff({
      stored,
      priceSource: 'listing',
      seller: agency,
      links: [lbc],
      link: added,
      observed: { price: 210_000, online: true },
      now: NOW,
    })
    expect(cheaper.patch.price).toBe(210_000)
    expect(cheaper.changes.map(c => c.field)).toEqual([
      'link',
      'price',
      'priceGap',
    ])
    expect(n(listingCheckSummary('link_added', cheaper.changes))).toMatch(
      /^Lien Logic-Immo ajouté : 210 000 € · Prix 214 000 € → 210 000 €/
    )
    expect(listingCheckSummary('link_added', [])).toBe('Lien ajouté')
  })
})

describe('vendeur et référence', () => {
  it('la référence sans son préfixe, et sa clé', () => {
    expect(cleanReference('  Réf. EX-2041 ')).toBe('EX-2041')
    expect(cleanReference('Référence : 2041')).toBe('2041')
    expect(cleanReference('Ref annonce : EX 2041')).toBe('EX 2041')
    expect(cleanReference('Mandat n° 2041')).toBe('2041')
    expect(cleanReference('N° de mandat : 2041')).toBe('2041')
    expect(cleanReference('« EX-2041 »')).toBe('EX-2041')
    expect(cleanReference('REFUGE-12')).toBe('REFUGE-12')
    expect(cleanReference('MANDATAIRE-3')).toBe('MANDATAIRE-3')
    expect(cleanReference('Réf.')).toBeNull()
    expect(cleanReference(null)).toBeNull()
    expect(cleanReference(undefined)).toBeNull()
    expect(referenceKey('Réf. ex-2041')).toBe('EX2041')
    expect(referenceKey('EX 2041')).toBe('EX2041')
    expect(referenceKey('ex.20/41')).toBe('EX2041')
    expect(referenceKey('Réf. é1')).toBeNull()
    expect(referenceKey('')).toBeNull()
  })

  it('le nom d’une agence : « Agence X » et « X Immobilier » sont la même', () => {
    expect(agencyKey('Agence des Chartrons')).toBe('chartrons')
    expect(agencyKey('Agence immobilière')).toBeNull()
    expect(agencyKey(null)).toBeNull()
    expect(sameAgency('Agence Exemple', 'Exemple Immobilier')).toBe(true)
    expect(
      sameAgency(
        '[Exemple] Immobilier des Chartrons',
        'Immobilier des Chartrons'
      )
    ).toBe(true)
    expect(sameAgency('Exemple & Fils', 'EXEMPLE ET FILS')).toBe(true)
    expect(sameAgency('Exemple', 'Exemple Bordeaux Centre')).toBe(true)
    expect(sameAgency('Exemple', 'Exemple Bordeaux Centre Sud')).toBe(false)
    expect(
      sameAgency('Réseau Exemple Bordeaux', 'Réseau Exemple Mérignac')
    ).toBe(false)
    expect(sameAgency('Exemple', null)).toBe(false)
    expect(sameAgency('Agence', 'Agence')).toBe(false)
  })

  it('le vendeur enregistré : un particulier n’a ni agence ni référence', () => {
    expect(
      normalizeSeller({
        sellerType: 'agency',
        sellerName: '  [Exemple]   Agence  ',
        sellerReference: 'Réf. EX-1',
      })
    ).toEqual({
      sellerType: 'agency',
      sellerName: '[Exemple] Agence',
      sellerReference: 'EX-1',
      sellerReferenceKey: 'EX1',
    })
    expect(
      normalizeSeller({
        sellerType: 'private',
        sellerName: 'Mme [Exemple]',
        sellerReference: 'EX-1',
      })
    ).toEqual({
      sellerType: 'private',
      sellerName: null,
      sellerReference: null,
      sellerReferenceKey: null,
    })
    expect(normalizeSeller({ sellerType: 'unknown' })).toEqual({
      sellerType: 'unknown',
      sellerName: null,
      sellerReference: null,
      sellerReferenceKey: null,
    })
    expect(cleanSellerName('   ')).toBeNull()
    expect(cleanSellerName(undefined)).toBeNull()
  })

  it('les libellés du vendeur', () => {
    expect(sellerChipText(agency)).toBe(
      'Agence · [Exemple] Immobilier des Chartrons'
    )
    expect(sellerChipText({ sellerType: 'mandatary', sellerName: null })).toBe(
      'Mandataire'
    )
    expect(sellerChipText({ sellerType: 'private', sellerName: null })).toBe(
      'Particulier'
    )
    expect(sellerChipText(unknownSeller)).toBe('Vendeur inconnu')
    expect(
      sellerChipText({ sellerType: 'unknown', sellerName: '[Exemple] X' })
    ).toBe('Vendeur à préciser · [Exemple] X')
    expect(sellerListLabel('unknown')).toBe('À relever')
    expect(sellerListLabel('mandatary')).toBe('Mandataire')
    expect(sellerNameLabel('mandatary')).toBe('Réseau')
    expect(sellerNameLabel('agency')).toBe('Agence')
    expect(sellerNameLabel('unknown')).toBe('Agence ou réseau')
    expect(sellerText(agency)).toBe(
      'agence « [Exemple] Immobilier des Chartrons », réf. EX-2041'
    )
    expect(sellerText(unknownSeller)).toBe('vendeur inconnu')
    expect(
      sellerText({
        sellerType: 'private',
        sellerName: null,
        sellerReference: null,
      })
    ).toBe('particulier')
  })

  it('le vendeur lu : appliqué s’il est inconnu, proposé s’il contredit', () => {
    expect(sellerObservationDiff(agency, {})).toEqual({
      changes: [],
      patch: {},
    })
    const fresh = sellerObservationDiff(unknownSeller, {
      sellerType: 'mandatary',
      sellerName: '[Exemple] réseau',
      reference: 'EX-3310',
    })
    expect(fresh.patch).toEqual({
      sellerType: 'mandatary',
      sellerName: '[Exemple] réseau',
      sellerReference: 'EX-3310',
    })
    expect(fresh.changes.map(c => c.text)).toEqual([
      'Vendeur : Mandataire (nouveau)',
      'Réseau : [Exemple] réseau (nouveau)',
      'Référence : EX-3310 (nouvelle)',
    ])
    const same = sellerObservationDiff(agency, {
      sellerType: 'agency',
      sellerName: 'Immobilier des Chartrons',
      reference: 'ex 2041',
    })
    expect(same).toEqual({ changes: [], patch: {} })
    const other = sellerObservationDiff(agency, {
      sellerType: 'private',
    })
    expect(other.changes.map(c => [c.disposition, c.text])).toEqual([
      [
        'proposed',
        'Vendeur lu « Particulier », la fiche dit « Agence » : à vérifier',
      ],
    ])
    const contradict = sellerObservationDiff(agency, {
      sellerName: '[Exemple] Agence du port',
      reference: 'EX-9',
    })
    expect(contradict.patch).toEqual({})
    expect(contradict.changes.map(c => c.disposition)).toEqual([
      'proposed',
      'proposed',
    ])
    // Un particulier lu sur une fiche qui porte une agence : proposé.
    expect(
      sellerObservationDiff(
        { ...unknownSeller, sellerName: '[Exemple] X' },
        { sellerType: 'private' }
      ).changes[0]
    ).toMatchObject({
      disposition: 'proposed',
      text: 'Vendeur lu « Particulier », mais la fiche porte une agence ou une référence : à vérifier',
    })
    // Un particulier inconnu jusque-là : appliqué, sans nom ni référence.
    expect(
      sellerObservationDiff(unknownSeller, {
        sellerType: 'private',
        sellerName: 'Mme [Exemple]',
        reference: 'EX-1',
      })
    ).toEqual({
      patch: { sellerType: 'private' },
      changes: [
        expect.objectContaining({ text: 'Vendeur : Particulier (nouveau)' }),
      ],
    })
  })

  it('ce qui contredit la fiche, pour refuser un lien', () => {
    expect(sellerContradiction(agency, {})).toBeNull()
    expect(
      sellerContradiction(agency, {
        sellerType: 'agency',
        sellerName: 'Immobilier des Chartrons',
        reference: 'EX 2041',
      })
    ).toBeNull()
    expect(sellerContradiction(unknownSeller, { reference: 'EX-1' })).toBeNull()
    expect(
      sellerContradiction(agency, {
        sellerType: 'mandatary',
        sellerName: '[Exemple] Agence du port',
        reference: 'EX-9',
      })
    ).toBe(
      'le vendeur lu (Mandataire) n’est pas celui de la fiche (Agence) ; l’agence lue (« [Exemple] Agence du port ») n’est pas celle de la fiche (« [Exemple] Immobilier des Chartrons ») ; la référence lue (EX-9) n’est pas celle de la fiche (EX-2041)'
    )
  })

  it('d’où vient la référence', () => {
    expect(
      referenceProvenanceText({
        reference: 'EX-2041',
        provenance: {
          source: 'listing',
          evidence: 'Lue sur SeLoger par Claude',
          recordedAt: '2026-11-03T10:00:00.000Z',
        },
        links: [
          { portal: 'seloger', readReference: 'EX-2041' },
          { portal: 'leboncoin', readReference: 'Réf. EX 2041' },
          { portal: 'bienici', readReference: null },
        ],
      })
    ).toBe('Lue sur SeLoger par Claude le 3 nov., la même sur Leboncoin.')
    expect(
      referenceProvenanceText({
        reference: 'EX-2041',
        provenance: { source: 'user' },
        links: [],
      })
    ).toBe('Saisie à la main.')
    // Une date abrégée finit déjà par un point.
    expect(
      referenceProvenanceText({
        reference: 'EX-2041',
        provenance: {
          source: 'listing',
          evidence: 'Lue sur SeLoger par Claude',
          recordedAt: '2026-11-03T10:00:00.000Z',
        },
        links: [{ portal: 'seloger', readReference: 'EX-2041' }],
      })
    ).toBe('Lue sur SeLoger par Claude le 3 nov.')
    expect(
      referenceProvenanceText({
        reference: 'EX-2041',
        provenance: undefined,
        links: [{ portal: 'pap', readReference: 'EX-2041' }],
      })
    ).toBe('La même sur PAP.')
    expect(
      referenceProvenanceText({
        reference: 'EX-2041',
        provenance: undefined,
        links: [],
      })
    ).toBeNull()
    expect(
      referenceProvenanceText({
        reference: null,
        provenance: undefined,
        links: [],
      })
    ).toBeNull()
  })
})

describe('reconnaître la même annonce', () => {
  const row = (over: Partial<DuplicateRow> = {}): DuplicateRow => ({
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: '[Exemple] T3 68 m², balcon sud',
    status: 'to_study',
    price: 214_000,
    surface: 68,
    commune: 'Bordeaux',
    url: lbc.url,
    addressRaw: null,
    addressNormalized: null,
    links: [lbc.normalizedUrl, sl.normalizedUrl],
    sellerType: 'agency',
    sellerName: '[Exemple] Immobilier des Chartrons',
    sellerReference: 'EX-2041',
    ...over,
  })

  it('même lien : n’importe lequel de ses liens, certain', () => {
    const reasons = duplicateReasons(
      { url: `${sl.url}?xtor=AD-1` },
      row(),
      undefined
    )
    expect(reasons).toEqual([
      { kind: 'same_url', score: 1, detail: `Même lien : ${sl.normalizedUrl}` },
    ])
    expect(isCertainMatch(reasons)).toBe(true)
    const { links: _links, ...withoutLinks } = row()
    expect(rowLinkKeys(withoutLinks).size).toBe(1)
  })

  it('même agence et même référence : certain ; autre agence : probable', () => {
    expect(
      duplicateReasons(
        { reference: 'Réf. EX 2041', sellerName: 'Immobilier des Chartrons' },
        row(),
        undefined
      )
    ).toEqual([
      {
        kind: 'same_reference',
        score: 1,
        detail:
          'Même agence et même référence : EX 2041 (« [Exemple] Immobilier des Chartrons »)',
      },
    ])
    const other = referenceReason(
      { reference: 'EX-2041', sellerName: '[Exemple] Agence du port' },
      row()
    )
    expect(other).toMatchObject({
      kind: 'same_reference_other_agency',
      score: 0.85,
    })
    expect(other?.detail).toContain(
      '« [Exemple] Agence du port » contre « [Exemple] Immobilier des Chartrons »'
    )
    expect(referenceReason({ reference: 'EX-2041' }, row())?.detail).toContain(
      'agence inconnue d’un côté'
    )
    expect(
      referenceReason(
        {
          reference: 'EX-2041',
          sellerName: 'Immobilier des Chartrons',
          sellerType: 'mandatary',
        },
        row()
      )?.detail
    ).toContain('autre vendeur')
    // Un particulier n'a pas de référence ; une référence absente ne compte pas.
    expect(
      referenceReason({ reference: 'EX-2041', sellerType: 'private' }, row())
    ).toBeNull()
    expect(
      referenceReason({ reference: 'EX-2041' }, row({ sellerType: 'private' }))
    ).toBeNull()
    expect(referenceReason({ reference: 'EX-9' }, row())).toBeNull()
    expect(referenceReason({}, row())).toBeNull()
    expect(
      referenceReason(
        { reference: 'EX-2041', sellerName: 'Immobilier des Chartrons' },
        row({ sellerReferenceKey: 'EX2041', sellerReference: null })
      )
    ).toMatchObject({ kind: 'same_reference' })
  })

  it('les candidats : certains d’abord, avec le vendeur et le nombre de liens', () => {
    const rows = [
      row(),
      row({
        id: 'aaaaaaaa-0000-4000-8000-000000000002',
        title: '[Exemple] Autre',
        url: null,
        links: [],
        sellerName: null,
        sellerReference: null,
        sellerType: 'unknown',
        addressRaw: '1 rue de l’Exemple',
      }),
    ]
    const found = matchDuplicates(
      {
        reference: 'EX-2041',
        sellerName: 'Immobilier des Chartrons',
        address: '1 rue de l’Exemple',
        commune: 'Bordeaux',
      },
      rows
    )
    expect(found.map(c => [c.title, c.certain, c.linkCount])).toEqual([
      ['[Exemple] T3 68 m², balcon sud', true, 2],
      ['[Exemple] Autre', false, 0],
    ])
    expect(found[0]?.sellerReference).toBe('EX-2041')
    expect(referenceMatchOf(found)?.title).toBe(
      '[Exemple] T3 68 m², balcon sud'
    )
    expect(referenceMatchOf(found.slice(1))).toBeNull()
    expect(sameUrlMatchOf(found)).toBeNull()
    expect(sameUrlMatchOf(matchDuplicates({ url: lbc.url }, rows))?.title).toBe(
      '[Exemple] T3 68 m², balcon sud'
    )
    // Les lignes sans vendeur (lot 16) restent comparables.
    const {
      sellerType: _type,
      sellerName: _name,
      sellerReference: _reference,
      ...withoutSeller
    } = row()
    expect(matchDuplicates({ url: lbc.url }, [withoutSeller])[0]).toMatchObject(
      {
        sellerType: 'unknown',
        sellerName: null,
        sellerReference: null,
      }
    )
  })
})

describe('journal, notifications, ce qui a changé', () => {
  const members = new Map([
    ['m1', { displayName: 'Richard' }],
    ['m2', { displayName: 'Chloé' }],
  ])

  it('les phrases des liens', () => {
    const changes = (b: unknown, a: unknown) => activityChanges(b, a)
    expect(
      describeLinkActivity(
        'listing_link.added',
        { facts: { price: 214_000 } },
        {
          portal: 'seloger',
          origin: 'exploration',
          auto: true,
          summary:
            'Lien SeLoger ajouté : 209 000 € · Prix 214 000 € → 209 000 €',
          facts: { price: 209_000 },
        },
        changes
      )
    ).toMatchObject({
      summary: n(
        "a rattaché d'office le lien SeLoger (même agence, même référence) : 209 000 € · Prix 214 000 € → 209 000 €"
      ),
    })
    expect(
      describeLinkActivity(
        'listing_link.added',
        null,
        { portal: 'pap', origin: 'email', auto: true },
        changes
      )?.summary
    ).toBe(
      "a rattaché d'office le lien PAP d'une alerte e-mail (même agence, même référence)"
    )
    expect(
      describeLinkActivity(
        'listing_link.added',
        null,
        {
          portal: 'pap',
          origin: 'share',
          summary: 'Lien PAP ajouté (prix à relever)',
        },
        changes
      )?.summary
    ).toBe(
      'a ajouté le lien PAP (partagé depuis le téléphone) (prix à relever)'
    )
    expect(
      describeLinkActivity(
        'listing_link.added',
        null,
        { portal: 'pap', origin: 'exploration', summary: 'Écart' },
        changes
      )?.summary
    ).toBe('a reconnu la même annonce et ajouté le lien PAP : Écart')
    expect(
      describeLinkActivity(
        'listing_link.added',
        null,
        { portal: 'nope', origin: 'manual' },
        changes
      )?.summary
    ).toBe('a ajouté le lien de l’annonce')
    expect(
      describeLinkActivity(
        'listing_link.updated',
        { link: { portal: 'autre' } },
        { portal: 'agence', link: { portal: 'agence' } },
        changes
      )
    ).toEqual({
      summary: 'a modifié le lien Site d’agence',
      changes: [
        {
          field: 'portal',
          label: 'Portail',
          before: 'Autre site',
          after: 'Site d’agence',
        },
      ],
    })
    expect(
      describeLinkActivity(
        'listing_link.removed',
        { portal: 'bienici' },
        {},
        changes
      )?.summary
    ).toBe('a retiré le lien Bien’ici')
    expect(
      describeLinkActivity(
        'listing_link.detached',
        { portal: 'seloger' },
        {},
        changes
      )?.summary
    ).toContain("a détaché le lien SeLoger rattaché d'office")
    expect(
      describeLinkActivity('listing.updated', null, null, changes)
    ).toBeNull()
    expect(linkPortalName(null)).toBe('de l’annonce')
  })

  it('le journal lisible : kind « link », vérification d’un lien, vendeur', () => {
    const entry = describeActivity(
      {
        action: 'listing_link.removed',
        channel: 'web',
        actorMemberId: 'm1',
        before: { portal: 'bienici', facts: { price: 209_000 } },
        after: { facts: { price: 214_000 } },
      },
      members
    )
    expect(entry.kind).toBe('link')
    expect(entry.summary).toBe('a retiré le lien Bien’ici')
    expect(entry.changes.map(c => [c.label, n(c.before), n(c.after)])).toEqual([
      ['Prix', '209 000 €', '214 000 €'],
    ])
    expect(
      describeActivity({
        action: 'listing.checked',
        channel: 'mcp',
        actorMemberId: 'm1',
        before: null,
        after: { outcome: 'changed', portal: 'seloger', summary: 'x' },
      }).summary
    ).toBe("a vérifié l'annonce sur SeLoger : mise à jour")
    expect(
      describeActivity({
        action: 'listing.checked',
        channel: 'mcp',
        actorMemberId: 'm1',
        before: null,
        after: { outcome: 'link_added', portal: 'seloger' },
      }).summary
    ).toBe("a vérifié l'annonce sur SeLoger")
    expect(
      describeActivity({
        action: 'listing.updated',
        channel: 'web',
        actorMemberId: 'm1',
        before: { sellerType: 'unknown' },
        after: { sellerType: 'agency', sellerReference: 'EX-1' },
      }).changes.map(c => [c.label, c.before, c.after])
    ).toEqual([
      ['Vendeur', 'Inconnu', 'Agence'],
      ['Référence de l’annonce', null, 'EX-1'],
    ])
  })

  it('un lien ajouté par Claude prévient l’autre membre, jamais un lien collé', () => {
    const event = {
      action: 'listing_link.added',
      channel: 'mcp' as const,
      actorMemberId: 'm1',
      listingId: 'x',
      before: null,
      after: {
        portal: 'seloger',
        summary: 'Lien SeLoger ajouté : 219 000 €',
        auto: false,
      },
    }
    expect(notificationTypeOf(event)).toBe('listing_checked')
    expect(notificationTypeOf({ ...event, channel: 'web' })).toBeNull()
    const sent = notificationsForActivity(event, {
      members: [
        { id: 'm1', displayName: 'Richard' },
        { id: 'm2', displayName: 'Chloé' },
      ],
      listingTitle: '[Exemple] T3',
    })
    expect(sent).toEqual([
      expect.objectContaining({
        recipientId: 'm2',
        title: 'Nouveau lien : [Exemple] T3',
        url: '/annonces/x',
      }),
    ])
    expect(n(sent[0]?.body)).toBe(
      'Lien SeLoger ajouté : 219 000 € (ajouté par Claude (MCP, pour Richard)).'
    )
    const auto = notificationsForActivity(
      {
        ...event,
        channel: 'system',
        actorMemberId: null,
        after: { auto: true },
      },
      { members: [{ id: 'm1', displayName: 'Richard' }], listingTitle: null }
    )
    expect(auto[0]?.body).toBe('Lien ajouté (rattaché d’office par Système).')
  })

  it('ce qui a changé : un lien ajouté, un prix qui change, un retrait', () => {
    const base: WhatsNewEvent = {
      id: 'e1',
      action: 'listing_link.added',
      channel: 'mcp',
      actorMemberId: 'm1',
      listingId: 'x',
      before: null,
      after: { portal: 'seloger', summary: 'Lien SeLoger ajouté : 219 000 €' },
      createdAt: '2026-11-06T09:00:00.000Z',
    }
    expect(whatsNewKindOf(base, 'm2')).toBe('listing_check')
    expect(
      whatsNewKindOf(
        {
          ...base,
          before: { facts: { price: 214_000 } },
          after: { facts: { price: 209_000 } },
        },
        'm2'
      )
    ).toBe('price_change')
    expect(
      whatsNewKindOf(
        { ...base, action: 'listing_link.removed', after: {} },
        'm2'
      )
    ).toBeNull()
    expect(
      whatsNewKindOf(
        {
          ...base,
          action: 'listing_link.detached',
          after: { facts: { price: 214_000 } },
        },
        'm2'
      )
    ).toBe('price_change')
    const report = computeWhatsNew({
      memberId: 'm2',
      since: '2026-11-06T08:00:00.000Z',
      sinceSource: 'previous_visit',
      now: NOW,
      events: [
        {
          ...base,
          before: { facts: { price: 214_000 } },
          after: {
            portal: 'seloger',
            summary:
              'Lien SeLoger ajouté : 209 000 € · Prix 214 000 € → 209 000 €',
            facts: { price: 209_000 },
          },
        },
      ],
      listings: new Map([['x', { title: '[Exemple] T3', seenAt: null }]]),
      members: new Map([
        ['m1', { id: 'm1', handle: 'richard', displayName: 'Richard' }],
      ]),
    })
    expect(report.items[0]).toMatchObject({ kind: 'price_change' })
    expect(n(report.items[0]?.before)).toBe('214 000 €')
    expect(n(report.items[0]?.after)).toBe('209 000 €')
    expect(
      listingChangedFields(
        [{ ...base, createdAt: '2026-11-06T09:00:00.000Z' }],
        'm2',
        '2026-11-06T08:00:00.000Z'
      )
    ).toEqual(['links'])
  })
})
