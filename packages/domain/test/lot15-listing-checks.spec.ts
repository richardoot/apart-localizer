/**
 * Lot 15 : suivi des mises à jour des annonces. Comparaison de la page lue
 * avec la fiche (faits appliqués, statut proposé, notes), résultat, résumé,
 * fraîcheur, extrait-preuve masqué, republication et négociation cumulée,
 * journal, « ce qui a changé » et notifications. Données fictives.
 */
import { describe, expect, it } from 'vitest'
import type { ListingObserved } from '@apart/contracts'
import {
  LISTING_CHECK_FIELD_LABELS,
  chainPriceEvents,
  checkFreshness,
  checkReference,
  computeWhatsNew,
  describeActivity,
  effectiveObserved,
  formatCheckDay,
  isStale,
  listingChangedFields,
  listingCheckDiff,
  listingCheckSummary,
  negotiationBrief,
  normalizeCheckDate,
  notificationTypeOf,
  notificationsForActivity,
  observedFromExtraction,
  orderRepublication,
  republicationLinkProblem,
  republicationProposal,
  resolveCheckOutcome,
  sanitizeEvidence,
  targetPrice,
  whatsNewKindOf,
} from '../src/index.js'
import type {
  CheckableListing,
  NegotiationListing,
  WhatsNewEvent,
} from '../src/index.js'
import { ARTIFACT_ASSUMPTIONS, DOC_EXAMPLE } from './helpers.js'

/** Espaces fines insécables de fr-FR → espaces simples, pour comparer. */
const n = (value: string | null | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? value

const stored: CheckableListing = {
  status: 'to_study',
  price: 215_000,
  annualCharges: 1_320,
  propertyTax: null,
  surface: 45.2,
  rooms: 2,
  dpeClass: 'D',
  gesClass: 'D',
  dpeConsumption: 210,
  description: 'T2 lumineux,  balcon.',
  publishedAt: '2026-10-12T00:00:00.000Z',
  sourceUpdatedAt: null,
  url: 'https://annonces.exemple.invalid/t2-talence-1/',
}

const diff = (
  observed: ListingObserved,
  over: Partial<CheckableListing> = {}
) => listingCheckDiff({ ...stored, ...over }, observed)

describe('listingCheckDiff : faits appliqués', () => {
  it('rien de fourni, rien de changé', () => {
    const d = diff({})
    expect(d.changes).toEqual([])
    expect(d.patch).toEqual({})
    expect(d.price).toBeNull()
    expect(d.online).toBeNull()
    expect(d.suggestedStatus).toBeNull()
  })

  it('un prix qui baisse : « Prix 215 000 € → 205 000 € », appliqué', () => {
    const d = diff({ price: 205_000, online: true })
    expect(d.price).toEqual({ from: 215_000, to: 205_000 })
    expect(d.patch).toEqual({ price: 205_000 })
    expect(d.online).toBe(true)
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0]).toMatchObject({
      field: 'price',
      label: 'Prix',
      before: 215_000,
      after: 205_000,
      disposition: 'applied',
    })
    expect(n(d.changes[0]?.text)).toBe('Prix 215 000 € → 205 000 €')
  })

  it('tolérance d’arrondi : prix à l’euro, charges à 12 €, surface au demi-mètre', () => {
    const same = diff({
      price: 215_000.4,
      annualCharges: 1_331,
      surface: 45,
      dpeConsumption: 210.5,
      rooms: 2,
      dpeClass: 'D',
      gesClass: 'D',
    })
    expect(same.changes).toEqual([])
    const moved = diff({ price: 215_001, annualCharges: 1_332, surface: 44.7 })
    expect(moved.changes.map(c => c.field)).toEqual([
      'price',
      'annualCharges',
      'surface',
    ])
    expect(n(moved.changes[2]?.text)).toBe('Surface Carrez 45,2 m² → 44,7 m²')
  })

  it('une valeur jusque-là absente est « nouvelle »', () => {
    const d = diff({ propertyTax: 820 })
    expect(n(d.changes[0]?.text)).toBe('Taxe foncière : 820 € (nouveau)')
    expect(d.patch.propertyTax).toBe(820)
  })

  it('pièces, DPE, GES et consommation', () => {
    const d = diff({
      rooms: 3,
      dpeClass: 'E',
      gesClass: 'C',
      dpeConsumption: 260,
    })
    expect(d.changes.map(c => n(c.text))).toEqual([
      'Consommation énergétique 210 kWh/m²/an → 260 kWh/m²/an',
      'Pièces 2 → 3',
      'DPE D → E',
      'GES D → C',
    ])
    expect(d.patch).toEqual({
      rooms: 3,
      dpeClass: 'E',
      gesClass: 'C',
      dpeConsumption: 260,
    })
  })

  it('description : espaces ignorés ; modifiée ou ajoutée, extrait tronqué et masqué', () => {
    expect(diff({ description: 'T2 lumineux, balcon.' }).changes).toEqual([])
    expect(diff({ description: '   ' }).changes).toEqual([])
    const changed = diff({
      description: `${'Très lumineux. '.repeat(30)} Contact 06 12 34 56 78`,
    })
    expect(changed.changes[0]?.text).toBe('Description modifiée')
    expect(changed.changes[0]?.before).toBe('T2 lumineux, balcon.')
    expect(String(changed.changes[0]?.after).length).toBeLessThanOrEqual(200)
    const added = diff({ description: 'Calme.' }, { description: null })
    expect(added.changes[0]).toMatchObject({
      text: 'Description ajoutée',
      before: null,
      after: 'Calme.',
    })
    expect(added.patch.description).toBe('Calme.')
  })

  it('date de publication : ajoutée, plus ancienne appliquée, plus récente notée (remontée)', () => {
    const added = diff({ publishedAt: '2026-10-01' }, { publishedAt: null })
    expect(added.changes[0]?.disposition).toBe('applied')
    expect(added.changes[0]?.text).toBe(
      'Date de publication : 1 octobre 2026 (nouveau)'
    )
    expect(added.patch.publishedAt).toBe('2026-10-01T00:00:00.000Z')

    const earlier = diff({ publishedAt: '2026-09-20T08:00:00+02:00' })
    expect(earlier.changes[0]).toMatchObject({
      disposition: 'applied',
      before: '2026-10-12',
      after: '2026-09-20',
      text: 'Date de publication 12 octobre 2026 → 20 septembre 2026',
    })

    const later = diff({ publishedAt: '2026-11-03' })
    expect(later.changes[0]?.disposition).toBe('noted')
    expect(later.changes[0]?.text).toBe(
      'Date de publication affichée 3 novembre 2026 : annonce remontée, première publication gardée (12 octobre 2026)'
    )
    expect(later.patch).toEqual({})

    expect(diff({ publishedAt: '2026-10-12' }).changes).toEqual([])
    expect(diff({ publishedAt: 'pas une date' }).changes).toEqual([])
  })

  it('mise à jour sur le portail : appliquée quand le jour change', () => {
    const first = diff({ sourceUpdatedAt: '2026-11-04' })
    expect(first.changes[0]?.text).toBe(
      'Mise à jour sur le portail : 4 novembre 2026 (nouveau)'
    )
    const next = diff(
      { sourceUpdatedAt: '2026-11-04' },
      { sourceUpdatedAt: '2026-10-28T09:00:00.000Z' }
    )
    expect(next.changes[0]?.text).toBe(
      'Mise à jour sur le portail 28 octobre 2026 → 4 novembre 2026'
    )
    expect(
      diff(
        { sourceUpdatedAt: '2026-11-04T18:00:00Z' },
        { sourceUpdatedAt: '2026-11-04T09:00:00.000Z' }
      ).changes
    ).toEqual([])
  })

  it('lien : barre finale ignorée ; modifié ou ajouté', () => {
    expect(
      diff({ url: 'https://annonces.exemple.invalid/t2-talence-1' }).changes
    ).toEqual([])
    const moved = diff({
      url: ' https://annonces.exemple.invalid/t2-talence-2 ',
    })
    expect(moved.changes[0]?.text).toBe('Lien de l’annonce modifié')
    expect(moved.patch.url).toBe(
      'https://annonces.exemple.invalid/t2-talence-2'
    )
    expect(
      diff({ url: 'https://a.exemple.invalid/x' }, { url: null }).changes[0]
        ?.text
    ).toBe('Lien de l’annonce ajouté')
  })
})

describe('listingCheckDiff : statut proposé, jamais appliqué', () => {
  it('plus en ligne : « Vendu ou retiré » proposé', () => {
    const d = diff({ online: false })
    expect(d.suggestedStatus).toBe('sold_or_withdrawn')
    expect(d.patch).toEqual({})
    expect(d.changes).toEqual([
      {
        field: 'status',
        label: 'Statut',
        before: 'to_study',
        after: 'sold_or_withdrawn',
        disposition: 'proposed',
        text: 'Plus en ligne : statut proposé « Vendu ou retiré »',
      },
    ])
  })

  it('déjà sortie du suivi : rien n’est proposé, c’est noté', () => {
    const d = diff({ online: false }, { status: 'discarded' })
    expect(d.suggestedStatus).toBeNull()
    expect(d.changes[0]).toMatchObject({
      field: 'online',
      disposition: 'noted',
      text: 'Plus en ligne (statut déjà « Écarté »)',
    })
    const back = diff({ online: true }, { status: 'sold_or_withdrawn' })
    expect(back.changes[0]?.text).toBe(
      'Toujours en ligne alors que l’annonce est « Vendu ou retiré »'
    )
  })
})

describe('resolveCheckOutcome', () => {
  const resolve = (
    observed: ListingObserved,
    declared?: Parameters<typeof resolveCheckOutcome>[0]['declared'],
    linked = false
  ) =>
    resolveCheckOutcome({
      declared,
      observed,
      diff: diff(observed),
      linked,
    })

  it('déduit : inchangée, mise à jour, plus en ligne, republiée', () => {
    expect(resolve({ online: true })).toEqual({
      ok: true,
      outcome: 'unchanged',
      seenOnline: true,
      applyFacts: true,
    })
    expect(resolve({ price: 205_000 })).toMatchObject({
      outcome: 'changed',
      seenOnline: true,
    })
    expect(resolve({ online: false })).toMatchObject({
      outcome: 'offline',
      seenOnline: false,
    })
    expect(resolve({}, undefined, true)).toMatchObject({
      outcome: 'republished',
      seenOnline: false,
    })
    expect(resolve({ online: true }, undefined, true)).toMatchObject({
      outcome: 'republished',
      seenOnline: true,
    })
    // Une simple note (annonce remontée) ne fait pas une mise à jour.
    expect(resolve({ publishedAt: '2026-11-03' })).toMatchObject({
      outcome: 'unchanged',
    })
  })

  it('inaccessible : rien d’observé, rien d’appliqué', () => {
    expect(resolve({}, 'inaccessible')).toEqual({
      ok: true,
      outcome: 'inaccessible',
      seenOnline: false,
      applyFacts: false,
    })
    expect(
      resolve({ url: 'https://a.exemple.invalid/x' }, 'inaccessible')
    ).toMatchObject({ ok: true })
    for (const [observed, linked] of [
      [{ price: 1 }, false],
      [{ online: false }, false],
      [{}, true],
    ] as const) {
      const r = resolve(observed, 'inaccessible', linked)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.problem).toContain('page inaccessible')
    }
  })

  it('offline déclaré : refusé si la page est notée en ligne', () => {
    expect(resolve({}, 'offline')).toMatchObject({
      ok: true,
      outcome: 'offline',
    })
    expect(resolve({ online: true }, 'offline')).toMatchObject({ ok: false })
  })

  it('republished déclaré : une annonce rattachée ou un nouveau lien', () => {
    expect(resolve({}, 'republished')).toMatchObject({ ok: false })
    expect(
      resolve(
        { url: 'https://annonces.exemple.invalid/t2-talence-9' },
        'republished'
      )
    ).toMatchObject({ ok: true, outcome: 'republished', seenOnline: true })
    expect(
      resolve(
        { url: 'https://annonces.exemple.invalid/t2-talence-9', online: false },
        'republished'
      )
    ).toMatchObject({ ok: true, seenOnline: false })
    expect(resolve({ online: false }, 'republished', true)).toMatchObject({
      ok: true,
      seenOnline: false,
    })
  })

  it('changed et unchanged déclarés doivent coller à ce qui a été lu', () => {
    expect(resolve({ price: 205_000 }, 'changed')).toMatchObject({
      ok: true,
      outcome: 'changed',
    })
    expect(resolve({ online: true }, 'unchanged')).toMatchObject({
      ok: true,
      outcome: 'unchanged',
    })
    const wrongUnchanged = resolve({ price: 205_000 }, 'unchanged')
    expect(wrongUnchanged.ok).toBe(false)
    if (!wrongUnchanged.ok) {
      expect(n(wrongUnchanged.problem)).toContain('Prix 215 000 € → 205 000 €')
    }
    expect(resolve({}, 'changed')).toMatchObject({ ok: false })
    expect(resolve({ online: false }, 'changed')).toMatchObject({ ok: false })
    expect(resolve({}, 'unchanged', true)).toMatchObject({ ok: false })
  })

  it('effectiveObserved : le résultat déclaré complète « en ligne »', () => {
    expect(effectiveObserved({}, 'offline')).toEqual({ online: false })
    expect(effectiveObserved({ price: 1 }, 'unchanged')).toEqual({
      price: 1,
      online: true,
    })
    expect(effectiveObserved({}, 'changed')).toEqual({ online: true })
    expect(effectiveObserved({ online: true }, 'offline')).toEqual({
      online: true,
    })
    expect(effectiveObserved({}, 'inaccessible')).toEqual({})
    expect(effectiveObserved({})).toEqual({})
  })
})

describe('listingCheckSummary', () => {
  const t = (text: string) => ({ text })
  it('une phrase par résultat', () => {
    expect(listingCheckSummary('inaccessible', [t('x')])).toBe(
      'Non vérifiée : page inaccessible'
    )
    expect(listingCheckSummary('unchanged', [])).toBe('Inchangée')
    expect(listingCheckSummary('unchanged', [t('Remontée')])).toBe(
      'Inchangée (Remontée)'
    )
    expect(
      listingCheckSummary('changed', [t('Prix A → B'), t('DPE D → E')])
    ).toBe('Prix A → B · DPE D → E')
    expect(listingCheckSummary('changed', [])).toBe('Mise à jour')
    expect(listingCheckSummary('offline', [])).toBe('Plus en ligne')
    expect(
      listingCheckSummary('offline', [t('Plus en ligne : statut proposé')])
    ).toBe('Plus en ligne : statut proposé')
    expect(listingCheckSummary('republished', [])).toBe(
      'Republiée sous un autre lien'
    )
    expect(
      listingCheckSummary('republished', [t('Prix A → B')], {
        title: 'T2 bis',
        role: 'successor',
      })
    ).toBe('Republiée : reprise par « T2 bis » · Prix A → B')
    expect(
      listingCheckSummary('republished', [], {
        title: 'T2',
        role: 'predecessor',
      })
    ).toBe('Republication de « T2 »')
  })
})

describe('sanitizeEvidence', () => {
  it('masque téléphones et e-mails, resserre, tronque à 500', () => {
    expect(sanitizeEvidence(null)).toBeNull()
    expect(sanitizeEvidence(undefined)).toBeNull()
    expect(sanitizeEvidence('   ')).toBeNull()
    expect(
      sanitizeEvidence(
        'Annonce expirée.\n Contact : 06 12 34 56 78, +33 5.56.00.11.22, 0033 612345678 ou agent.fictif@exemple.invalid'
      )
    ).toBe(
      'Annonce expirée. Contact : [téléphone masqué], [téléphone masqué], [téléphone masqué] ou [e-mail masqué]'
    )
    const long = sanitizeEvidence('a'.repeat(800))
    expect(long).toHaveLength(500)
    expect(long?.endsWith('…')).toBe(true)
    expect(sanitizeEvidence('Prix : 205 000 €')).toBe('Prix : 205 000 €')
    expect(sanitizeEvidence('abcdef', 4)).toBe('abc…')
  })
})

describe('dates', () => {
  it('normalise AAAA-MM-JJ et ISO 8601 ; illisible : null', () => {
    expect(normalizeCheckDate('2026-10-12')).toBe('2026-10-12T00:00:00.000Z')
    expect(normalizeCheckDate('2026-10-12T10:00:00+02:00')).toBe(
      '2026-10-12T08:00:00.000Z'
    )
    expect(normalizeCheckDate('hier')).toBeNull()
    expect(formatCheckDay('2026-11-05T23:30:00.000Z')).toBe('5 novembre 2026')
  })
  it('libellés des champs', () => {
    expect(LISTING_CHECK_FIELD_LABELS.annualCharges).toBe('Charges annuelles')
  })
})

describe('À revérifier', () => {
  const NOW = new Date('2026-11-05T12:00:00.000Z')
  const listing = {
    status: 'to_study' as const,
    lastCheckedAt: null as string | null,
    createdAt: '2026-10-01T10:00:00.000Z',
  }

  it('isStale : plus de 7 jours sans vérification (à défaut depuis l’ajout), annonces actives seulement', () => {
    expect(checkReference(listing)).toBe(listing.createdAt)
    expect(isStale(listing, NOW)).toBe(true)
    expect(
      isStale({ ...listing, lastCheckedAt: '2026-11-01T09:00:00.000Z' }, NOW)
    ).toBe(false)
    expect(
      isStale({ ...listing, lastCheckedAt: '2026-10-29T11:00:00.000Z' }, NOW)
    ).toBe(true)
    expect(
      isStale(
        { ...listing, lastCheckedAt: '2026-10-29T11:00:00.000Z' },
        NOW,
        10
      )
    ).toBe(false)
    expect(
      isStale({ ...listing, createdAt: '2026-11-04T10:00:00.000Z' }, NOW)
    ).toBe(false)
    expect(isStale({ ...listing, status: 'discarded' }, NOW)).toBe(false)
    expect(isStale({ ...listing, createdAt: 'illisible' }, NOW)).toBe(true)
  })

  it('checkFreshness : « Vérifiée il y a 3 j », « hier », « aujourd’hui », « À revérifier »', () => {
    const at = (iso: string) =>
      checkFreshness({ ...listing, lastCheckedAt: iso }, NOW)
    expect(at('2026-11-02T10:00:00.000Z')).toMatchObject({
      stale: false,
      checked: true,
      ageDays: 3,
      label: 'Vérifiée il y a 3 j',
      title: 'Dernière vérification sur le portail le 2 novembre 2026',
    })
    expect(at('2026-11-04T10:00:00.000Z').label).toBe('Vérifiée hier')
    expect(at('2026-11-05T08:00:00.000Z').label).toBe('Vérifiée aujourd’hui')
    const old = at('2026-10-20T08:00:00.000Z')
    expect(old.label).toBe('À revérifier')
    expect(old.title).toContain('à revérifier (plus de 7 jours)')
    const never = checkFreshness(listing, NOW)
    expect(never).toMatchObject({ stale: true, checked: false, ageDays: null })
    expect(never.title).toContain(
      'Jamais revérifiée depuis l’ajout le 1 octobre 2026'
    )
    const blocked = checkFreshness(
      { ...listing, lastCheckedAt: '2026-11-03T10:00:00.000Z' },
      NOW,
      7,
      'inaccessible'
    )
    expect(blocked.label).toBe('Page inaccessible il y a 2 j')
    expect(blocked.title).toContain('page inaccessible, rien n’a été vérifié')
    expect(
      checkFreshness(
        { ...listing, lastCheckedAt: '2026-11-05T10:00:00.000Z' },
        NOW,
        7,
        'inaccessible'
      ).label
    ).toBe('Page inaccessible aujourd’hui')
    const fresh = checkFreshness(
      { ...listing, createdAt: '2026-11-04T10:00:00.000Z' },
      NOW
    )
    expect(fresh.label).toBeNull()
    // Une annonce écartée n'est jamais « à revérifier », sa vérification reste dite.
    expect(
      checkFreshness(
        {
          ...listing,
          status: 'discarded',
          lastCheckedAt: '2026-10-01T10:00:00.000Z',
        },
        NOW
      ).label
    ).toBe('Vérifiée il y a 35 j')
  })
})

describe('extraction vers valeurs observées', () => {
  it('seules les valeurs lues ; ni description ni lien', () => {
    expect(
      observedFromExtraction({
        price: 0,
        annualCharges: null,
        propertyTax: null,
        surface: null,
        rooms: null,
        dpeClass: null,
        gesClass: null,
        dpeConsumption: null,
        publishedAt: null,
        sourceUpdatedAt: null,
      })
    ).toEqual({})
    expect(
      observedFromExtraction({
        price: 205_000,
        annualCharges: 1_440,
        propertyTax: 820,
        surface: 45,
        rooms: 2,
        dpeClass: 'D',
        gesClass: 'E',
        dpeConsumption: 230,
        publishedAt: '2026-10-12T00:00:00.000Z',
        sourceUpdatedAt: '2026-11-04T00:00:00.000Z',
      })
    ).toEqual({
      price: 205_000,
      annualCharges: 1_440,
      propertyTax: 820,
      surface: 45,
      rooms: 2,
      dpeClass: 'D',
      gesClass: 'E',
      dpeConsumption: 230,
      publishedAt: '2026-10-12T00:00:00.000Z',
      sourceUpdatedAt: '2026-11-04T00:00:00.000Z',
    })
  })
})

describe('republication', () => {
  const a = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: 'T2 Talence (1re publication)',
    status: 'to_study' as const,
    publishedAt: '2026-08-02T00:00:00.000Z',
    createdAt: '2026-08-05T10:00:00.000Z',
  }
  const b = {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    title: 'T2 Talence (republiée)',
    status: 'to_study' as const,
    publishedAt: '2026-10-20T00:00:00.000Z',
    createdAt: '2026-10-21T10:00:00.000Z',
  }

  it('la plus ancienne publication est l’origine, dans un sens comme dans l’autre', () => {
    expect(orderRepublication(a, b)).toEqual({ predecessor: a, successor: b })
    expect(orderRepublication(b, a)).toEqual({ predecessor: a, successor: b })
    // Sans date de publication : la date d'ajout, puis l'identifiant.
    const a2 = { ...a, publishedAt: null }
    const b2 = { ...b, publishedAt: null }
    expect(orderRepublication(b2, a2).predecessor.id).toBe(a.id)
    const same = { ...b2, createdAt: a2.createdAt }
    expect(orderRepublication(same, a2).predecessor.id).toBe(a.id)
  })

  it('rattachements refusés : soi-même, déjà rattachée, déjà reprise, boucle', () => {
    const base = {
      predecessor: a,
      successor: b,
      successorFromId: null,
      predecessorToId: null,
      predecessorAncestors: [],
    }
    expect(republicationLinkProblem(base)).toBeNull()
    expect(
      republicationLinkProblem({
        ...base,
        successorFromId: a.id,
        predecessorToId: b.id,
      })
    ).toBeNull()
    expect(republicationLinkProblem({ ...base, successor: a })).toContain(
      'sa propre republication'
    )
    expect(
      republicationLinkProblem({ ...base, successorFromId: 'autre' })
    ).toContain('déjà rattachée')
    expect(
      republicationLinkProblem({ ...base, predecessorToId: 'autre' })
    ).toContain('déjà reprise')
    expect(
      republicationLinkProblem({ ...base, predecessorAncestors: [b.id] })
    ).toContain('boucle')
  })

  it('propose « Vendu ou retiré » pour l’origine, sauf si elle est déjà sortie du suivi', () => {
    expect(republicationProposal(a, b)).toMatchObject({
      field: 'status',
      disposition: 'proposed',
      before: 'to_study',
      after: 'sold_or_withdrawn',
      text: 'Statut proposé pour « T2 Talence (1re publication) » : « Vendu ou retiré » (republiée sous « T2 Talence (republiée) »)',
    })
    expect(
      republicationProposal({ ...a, status: 'sold_or_withdrawn' }, b)
    ).toBeNull()
  })
})

describe('négociation sur la chaîne de republication', () => {
  const A = ARTIFACT_ASSUMPTIONS
  const NOW = new Date('2026-11-03T12:00:00.000Z')
  const target = targetPrice(DOC_EXAMPLE, A)
  const current: NegotiationListing = {
    price: 200_000,
    publishedAt: '2026-10-20T00:00:00.000Z',
    createdAt: '2026-10-21T10:00:00.000Z',
    dpeClass: null,
    renovationTotal: 0,
    annualCharges: null,
    surface: 45,
    priceEvents: [
      {
        occurredAt: '2026-10-21T10:00:00.000Z',
        oldPrice: null,
        newPrice: 205_000,
      },
      {
        occurredAt: '2026-10-30T10:00:00.000Z',
        oldPrice: 205_000,
        newPrice: 200_000,
      },
    ],
    offers: [],
  }
  const origin = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: 'T2 Talence (1re publication)',
    publishedAt: '2026-08-02T00:00:00.000Z',
    createdAt: '2026-08-05T10:00:00.000Z',
    priceEvents: [
      {
        occurredAt: '2026-08-05T10:00:00.000Z',
        oldPrice: null,
        newPrice: 220_000,
      },
    ],
  }

  it('chainPriceEvents : la republication moins chère est une baisse', () => {
    expect(chainPriceEvents([origin.priceEvents, current.priceEvents])).toEqual(
      [
        {
          occurredAt: '2026-08-05T10:00:00.000Z',
          oldPrice: null,
          newPrice: 220_000,
        },
        {
          occurredAt: '2026-10-21T10:00:00.000Z',
          oldPrice: 220_000,
          newPrice: 205_000,
        },
        {
          occurredAt: '2026-10-30T10:00:00.000Z',
          oldPrice: 205_000,
          newPrice: 200_000,
        },
      ]
    )
    expect(chainPriceEvents([[], current.priceEvents])[0]?.oldPrice).toBeNull()
  })

  it('sans republication : 14 jours en ligne, une baisse de 5 000 €', () => {
    const brief = negotiationBrief(current, target, A, { now: NOW })
    expect(brief.daysOnline).toBe(14)
    expect(brief.priceDrops).toMatchObject({
      count: 1,
      firstPrice: 205_000,
      totalDrop: 5_000,
    })
    expect(brief.republication).toBeNull()
    expect(brief.arguments.map(x => x.kind)).toEqual(['price_drops'])
  })

  it('avec la publication d’origine : 93 jours en ligne, deux baisses, 20 000 € cumulés', () => {
    const brief = negotiationBrief(
      { ...current, predecessors: [origin] },
      target,
      A,
      { now: NOW }
    )
    expect(brief.daysOnline).toBe(93)
    expect(brief.daysOnlineSince).toBe('published')
    expect(brief.priceDrops).toMatchObject({
      count: 2,
      firstPrice: 220_000,
      totalDrop: 20_000,
    })
    expect(brief.republication).toEqual({
      count: 1,
      firstListingId: origin.id,
      firstTitle: origin.title,
      firstSeenAt: '2026-08-02T00:00:00.000Z',
    })
    const texts = brief.arguments.map(x => n(x.text))
    expect(brief.arguments.map(x => x.kind)).toEqual([
      'time_on_market',
      'republished',
      'price_drops',
    ])
    expect(texts[0]).toBe(
      'En ligne depuis 93 jours sans vente, republication comprise.'
    )
    expect(texts[1]).toBe(
      "Annonce republiée : le bien n'a pas trouvé preneur à sa première publication (« T2 Talence (1re publication) », le 2 août 2026)."
    )
    expect(texts[2]).toContain('(220 000 €), republication comprise')
  })

  it('origine sans date de publication : depuis son ajout ; chaîne de deux', () => {
    const brief = negotiationBrief(
      {
        ...current,
        predecessors: [
          {
            publishedAt: null,
            createdAt: '2026-08-05T10:00:00.000Z',
            priceEvents: [],
          },
          { ...origin, publishedAt: null },
        ],
      },
      target,
      A,
      { now: NOW }
    )
    expect(brief.daysOnlineSince).toBe('added')
    expect(brief.republication).toMatchObject({
      count: 2,
      firstListingId: null,
      firstTitle: null,
      firstSeenAt: '2026-08-05T10:00:00.000Z',
    })
    expect(n(brief.arguments[0]?.text)).toContain(
      'Suivie depuis 90 jours, republication comprise'
    )
    expect(n(brief.arguments.find(x => x.kind === 'republished')?.text)).toBe(
      "Annonce republiée 2 fois : le bien n'a pas trouvé preneur à sa première publication."
    )
  })

  it('origine sans aucune date : pas de durée en ligne', () => {
    const brief = negotiationBrief(
      {
        ...current,
        predecessors: [
          {
            id: 'x',
            title: 'Ancienne',
            publishedAt: null,
            createdAt: null,
            priceEvents: [],
          },
        ],
      },
      target,
      A,
      { now: NOW }
    )
    expect(brief.daysOnline).toBeNull()
    expect(brief.republication?.firstSeenAt).toBeNull()
    expect(n(brief.arguments.find(x => x.kind === 'republished')?.text)).toBe(
      "Annonce republiée : le bien n'a pas trouvé preneur à sa première publication (« Ancienne »)."
    )
  })
})

describe('journal, « ce qui a changé » et notifications', () => {
  const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const L1 = '11111111-1111-4111-8111-111111111111'
  const members = new Map([
    [RICHARD, { id: RICHARD, handle: 'richard', displayName: 'Richard' }],
    [CHLOE, { id: CHLOE, handle: 'chloe', displayName: 'Chloé' }],
  ])
  const checked = (outcome: string, extra: Record<string, unknown> = {}) => ({
    action: 'listing.checked',
    channel: 'mcp' as const,
    actorMemberId: RICHARD,
    listingId: L1,
    before: { facts: { price: 215_000, annualCharges: 1_320 } },
    after: {
      outcome,
      summary:
        'Prix 215 000 € → 205 000 € · Charges annuelles 1 320 € → 1 440 €',
      facts: { price: 205_000, annualCharges: 1_440 },
      ...extra,
    },
  })

  it('describeActivity : la phrase par résultat et le détail des faits', () => {
    const d = describeActivity(checked('changed'), members)
    expect(d.kind).toBe('check')
    expect(d.summary).toBe("a vérifié l'annonce sur le portail : mise à jour")
    expect(d.changes.map(c => [c.label, n(c.before), n(c.after)])).toEqual([
      ['Prix', '215 000 €', '205 000 €'],
      ['Charges annuelles', '1 320 €', '1 440 €'],
    ])
    const offline = describeActivity(
      {
        ...checked('offline', { suggestedStatus: 'sold_or_withdrawn' }),
        before: null,
        after: { outcome: 'offline', suggestedStatus: 'sold_or_withdrawn' },
      },
      members
    )
    expect(offline.summary).toBe(
      "a vérifié l'annonce sur le portail : plus en ligne ; statut proposé « Vendu ou retiré » (non appliqué)"
    )
    expect(offline.changes).toEqual([])
    expect(
      describeActivity({
        ...checked('inaccessible'),
        after: { outcome: 'inaccessible' },
      }).summary
    ).toContain('page inaccessible')
    expect(describeActivity({ ...checked('?'), after: null }).summary).toBe(
      "a vérifié l'annonce sur le portail"
    )
    for (const outcome of ['unchanged', 'republished']) {
      expect(
        describeActivity({ ...checked(outcome), after: { outcome } }).summary
      ).toContain("a vérifié l'annonce sur le portail")
    }
  })

  it('« ce qui a changé » : prix → changement de prix, le reste → mise à jour, inchangée → rien', () => {
    const event = (over: Partial<WhatsNewEvent>): WhatsNewEvent => ({
      id: 'e1',
      createdAt: '2026-11-05T10:00:00.000Z',
      ...checked('changed'),
      ...over,
    })
    expect(whatsNewKindOf(event({}), CHLOE)).toBe('price_change')
    expect(
      whatsNewKindOf(
        event({ after: { outcome: 'offline', summary: 'Plus en ligne' } }),
        CHLOE
      )
    ).toBe('listing_check')
    expect(
      whatsNewKindOf(
        event({ after: { outcome: 'republished', facts: null } }),
        CHLOE
      )
    ).toBe('listing_check')
    expect(
      whatsNewKindOf(event({ after: { outcome: 'unchanged' } }), CHLOE)
    ).toBeNull()
    expect(whatsNewKindOf(event({ after: null }), CHLOE)).toBeNull()

    const report = computeWhatsNew({
      memberId: CHLOE,
      since: '2026-11-01T00:00:00.000Z',
      sinceSource: 'previous_visit',
      now: '2026-11-05T12:00:00.000Z',
      events: [
        event({ id: 'a' }),
        event({
          id: 'b',
          createdAt: '2026-11-05T11:00:00.000Z',
          before: null,
          after: {
            outcome: 'offline',
            summary: 'Plus en ligne : statut proposé « Vendu ou retiré »',
          },
        }),
        event({
          id: 'c',
          after: { outcome: 'unchanged', summary: 'Inchangée' },
        }),
      ],
      listings: new Map([[L1, { title: 'T2 Talence', seenAt: null }]]),
      members,
    })
    expect(report.counts.price_change).toBe(1)
    expect(report.counts.listing_check).toBe(1)
    expect(report.items[0]?.summary).toBe(
      'Vérifiée sur le portail par Claude (MCP, pour Richard) : Plus en ligne : statut proposé « Vendu ou retiré »'
    )
    expect(n(report.items[1]?.before)).toBe('215 000 €')
    expect(n(report.items[1]?.after)).toBe('205 000 €')
    // Sans résumé, la phrase reste lisible.
    const bare = computeWhatsNew({
      memberId: CHLOE,
      since: '2026-11-01T00:00:00.000Z',
      sinceSource: 'previous_visit',
      now: '2026-11-05T12:00:00.000Z',
      events: [
        event({ after: { outcome: 'changed', facts: { surface: 44 } } }),
      ],
      listings: new Map([[L1, { title: 'T2 Talence', seenAt: null }]]),
      members,
    })
    expect(bare.items[0]?.kind).toBe('listing_check')
    expect(bare.items[0]?.summary).toBe(
      'Vérifiée sur le portail par Claude (MCP, pour Richard) : '
    )
  })

  it('champs modifiés de la fiche depuis la dernière ouverture', () => {
    const fields = listingChangedFields(
      [
        {
          id: 'e1',
          createdAt: '2026-11-05T10:00:00.000Z',
          ...checked('changed'),
        },
        {
          id: 'e2',
          createdAt: '2026-11-05T10:00:00.000Z',
          ...checked('unchanged'),
          before: null,
          after: null,
        },
      ],
      CHLOE,
      '2026-11-01T00:00:00.000Z'
    )
    expect(fields).toEqual(['annualCharges', 'price'])
  })

  it('notifications : une vérification qui trouve quelque chose prévient l’autre membre, vers l’onglet Suivi', () => {
    expect(notificationTypeOf(checked('changed'))).toBe('listing_checked')
    expect(notificationTypeOf(checked('offline'))).toBe('listing_checked')
    expect(notificationTypeOf(checked('republished'))).toBe('listing_checked')
    expect(notificationTypeOf(checked('unchanged'))).toBeNull()
    expect(notificationTypeOf(checked('inaccessible'))).toBeNull()
    const drafts = notificationsForActivity(checked('changed'), {
      members: [
        { id: RICHARD, displayName: 'Richard' },
        { id: CHLOE, displayName: 'Chloé' },
      ],
      listingTitle: 'T2 Talence',
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      recipientId: CHLOE,
      type: 'listing_checked',
      title: 'Mise à jour : T2 Talence',
      url: `/annonces/${L1}?onglet=suivi`,
    })
    expect(n(drafts[0]?.body)).toBe(
      'Prix 215 000 € → 205 000 € · Charges annuelles 1 320 € → 1 440 € (vérifiée par Claude (MCP, pour Richard)).'
    )
    const bare = notificationsForActivity(
      { ...checked('offline'), after: { outcome: 'offline' }, listingId: null },
      { members: [{ id: CHLOE, displayName: 'Chloé' }], listingTitle: null }
    )
    expect(bare[0]?.body).toBe(
      'Annonce vérifiée sur le portail (vérifiée par Claude (MCP, pour Un membre)).'
    )
    expect(bare[0]?.url).toBeNull()
  })
})
