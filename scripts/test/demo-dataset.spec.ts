import {
  AssumptionsSchema,
  DEFAULT_OPINION_CRITERIA,
  ListingInputSchema,
  OPINION_CRITERIA_MAX,
  OfferInputSchema,
  OpinionCriterionSchema,
  OpinionInputSchema,
  OpinionScoresInputSchema,
  RentComparableInputSchema,
  ScenarioInputSchema,
  SearchCriteriaInputSchema,
  VisitInputSchema,
} from '@apart/contracts'
import {
  confrontOpinions,
  describeActivity,
  isFollowUpDue,
  lowestOnlinePrice,
  notificationsForActivity,
  primaryLink,
  splitOpinionsForViewer,
  stageOfStatus,
  visibleCriterionKeys,
} from '@apart/domain'
import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNTS } from '../lib/demo/accounts.js'
import {
  buildDemoDataset,
  currentAssumptions,
  demoMetrics,
} from '../lib/demo/dataset.js'
import { DEMO_WORKSPACE_ID, demoId } from '../lib/demo/ids.js'

const NOW = new Date('2026-11-03T15:00:00Z')
const dataset = buildDemoDataset(NOW)

/** Lot 18 : un lien fictif (exemple.invalid, chemin « exemple », identifiant impossible). */
const FICTIVE_LINK =
  /^https:\/\/(exemple\.invalid\/|www\.(bienici|seloger)\.com\/annonces?\/.*exemple-\d+(\.htm)?$|www\.pap\.fr\/annonces\/.*-exemple-r\d+$|www\.leboncoin\.fr\/ad\/ventes_immobilieres\/0000000\d+$)/
const plain = (value: string | undefined) =>
  (value ?? '').replace(/[\u202f\u00a0]/g, ' ')

/** Communes de Bordeaux Métropole utilisées par le jeu. */
const METROPOLE = new Set([
  'Bordeaux',
  'Talence',
  'Mérignac',
  'Pessac',
  'Bègles',
  'Le Bouscat',
  'Cenon',
  'Villenave-d’Ornon',
  'Lormont',
])

describe('jeu de démonstration', () => {
  it('a 12 à 15 annonces, un espace « Démo » à deux membres, des identifiants stables', () => {
    expect(dataset.listings.length).toBeGreaterThanOrEqual(12)
    expect(dataset.listings.length).toBeLessThanOrEqual(15)
    expect(dataset.workspace).toMatchObject({
      id: DEMO_WORKSPACE_ID,
      name: 'Démo',
    })
    expect(dataset.members.map(m => m.email)).toEqual(
      DEMO_ACCOUNTS.map(a => a.email)
    )
    expect(buildDemoDataset(NOW)).toEqual(dataset)
    expect(demoId('x')).toBe(demoId('x'))
    expect(demoId('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    const ids = [
      ...dataset.listings.flatMap(l => [
        l.id,
        ...l.tasks.map(t => t.id),
        ...l.offers.map(o => o.id),
        ...l.visits.map(v => v.id),
        ...l.rentComparables.map(c => c.id),
      ]),
      ...dataset.activity.map(a => a.id),
      ...dataset.criteria.map(c => c.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('valide chaque objet par les schémas de contracts', () => {
    for (const a of dataset.assumptions)
      expect(AssumptionsSchema.parse(a.values)).toEqual(a.values)
    for (const l of dataset.listings) {
      expect(ListingInputSchema.parse(l.input)).toEqual(l.input)
      for (const o of l.opinions)
        OpinionInputSchema.parse({ rating: o.rating, text: o.text })
      for (const o of l.offers)
        OfferInputSchema.parse({
          amount: o.amount,
          channel: o.channel,
          response: o.response,
          counterAmount: o.counterAmount,
          notes: o.notes,
        })
      for (const v of l.visits)
        VisitInputSchema.parse({
          visitedAt: v.visitedAt,
          status: v.status,
          rating: v.rating,
          report: v.report,
        })
      for (const c of l.rentComparables)
        expect(RentComparableInputSchema.parse(c.input)).toEqual(c.input)
    }
    for (const c of dataset.criteria)
      expect(SearchCriteriaInputSchema.parse(c.input)).toEqual(c.input)
    for (const s of dataset.scenarios)
      expect(ScenarioInputSchema.parse(s.input)).toEqual(s.input)
    for (const d of dataset.drafts)
      expect(ListingInputSchema.parse(d.input)).toEqual(d.input)
  })

  it('calcule les indicateurs par domain, avec des verdicts variés', () => {
    const assumptions = currentAssumptions(dataset)
    const verdicts = new Set<string>()
    for (const l of dataset.listings) {
      const m = demoMetrics(l, assumptions, NOW)
      expect(Number.isFinite(m.grossYield)).toBe(true)
      expect(Number.isFinite(m.totalCost)).toBe(true)
      verdicts.add(m.verdict)
    }
    expect([...verdicts].sort()).toEqual(['off_target', 'target', 'to_dig'])
  })

  it('varie les statuts et couvre travaux, phase 2, avis à deux, tâches, offres, prix, visites, comparables', () => {
    const l = dataset.listings
    expect(new Set(l.map(x => x.input.status)).size).toBeGreaterThanOrEqual(7)
    expect(
      l.filter(x => x.input.renovation?.items.length).length
    ).toBeGreaterThanOrEqual(3)
    expect(l.every(x => x.input.rentalPlan?.targetRent)).toBe(true)
    expect(l.some(x => new Set(x.opinions.map(o => o.handle)).size === 2)).toBe(
      true
    )
    expect(l.some(x => x.tasks.some(t => t.assignee === 'demo2'))).toBe(true)
    expect(l.flatMap(x => x.offers).map(o => o.response)).toEqual(
      expect.arrayContaining([
        'pending',
        'accepted',
        'refused',
        'counter_offer',
      ])
    )
    expect(l.filter(x => x.prices.length > 1).length).toBeGreaterThanOrEqual(3)
    const visits = l.flatMap(x => x.visits)
    expect(
      visits.some(
        v => v.status === 'planned' && v.visitedAt > NOW.toISOString()
      )
    ).toBe(true)
    expect(visits.some(v => v.status === 'done')).toBe(true)
    expect(l.flatMap(x => x.rentComparables).length).toBeGreaterThanOrEqual(6)
    expect(dataset.criteria.map(c => c.input.perimeter?.type).sort()).toEqual([
      'point_radius',
      'point_radius',
      'polygon',
    ])
    // Lot 14 : un critère montre une marge de tolérance réglée.
    expect(
      dataset.criteria.some(c => c.input.tolerance.perimeterMeters === 400)
    ).toBe(true)
  })

  it('est fictif : adresses marquées, liens en .invalid, points dans la métropole', () => {
    for (const l of dataset.listings) {
      expect(l.input.location.addressRaw).toMatch(/\(adresse fictive\)$/)
      expect(l.input.url).toMatch(/^https:\/\/exemple\.invalid\//)
      expect(METROPOLE.has(l.input.location.commune ?? '')).toBe(true)
      const [lon, lat] = l.input.location.point?.coordinates ?? [0, 0]
      expect(lon).toBeGreaterThan(-0.75)
      expect(lon).toBeLessThan(-0.45)
      expect(lat).toBeGreaterThan(44.75)
      expect(lat).toBeLessThan(44.95)
    }
    expect(dataset.drafts.every(d => d.url.includes('exemple.invalid'))).toBe(
      true
    )
    expect(dataset.members.every(m => m.email.endsWith('@apart.local'))).toBe(
      true
    )
  })

  it('a un journal lisible et des notifications pour les deux membres (règles de domain)', () => {
    const members = dataset.members.map(m => ({
      id: m.id,
      displayName: m.displayName,
    }))
    const names = new Map(
      members.map(m => [m.id, { displayName: m.displayName }])
    )
    const memberOf = new Map(dataset.members.map(m => [m.handle, m.id]))
    const recipients = new Map<string, number>()
    const actions = new Set<string>()
    for (const a of dataset.activity) {
      const event = {
        action: a.action,
        channel: a.channel,
        actorMemberId: a.actor ? (memberOf.get(a.actor) ?? null) : null,
        before: a.before,
        after: a.after,
      }
      actions.add(a.action)
      expect(describeActivity(event, names).summary).not.toBe(a.action)
      const listing = dataset.listings.find(l => l.key === a.listingKey)
      for (const n of notificationsForActivity(
        { ...event, listingId: listing?.id ?? null },
        { members, listingTitle: listing?.input.title ?? null }
      )) {
        recipients.set(n.recipientId, (recipients.get(n.recipientId) ?? 0) + 1)
      }
    }
    expect(dataset.activity.length).toBeGreaterThan(50)
    expect([...recipients.keys()].sort()).toEqual(
      dataset.members.map(m => m.id).sort()
    )
    for (const action of [
      'listing.created',
      'listing.status_changed',
      'listing.price_changed',
      'opinion.created',
      'offer.created',
      'offer.updated',
      'visit.created',
      'task.created',
      'criteria.created',
      'assumptions.updated',
      'draft.received',
      'listing.checked',
    ]) {
      expect(actions).toContain(action)
    }
  })

  it('lot 15 : des vérifications fictives (prix trouvé, inchangée, plus en ligne, republiée, inaccessible)', () => {
    const byKey = new Map(dataset.listings.map(l => [l.key, l]))
    const peixotto = byKey.get('talence-peixotto-t3')
    expect(peixotto?.checks.map(c => c.outcome)).toEqual([
      'unchanged',
      'changed',
      'unchanged',
    ])
    expect(peixotto?.checks[1]?.changes[0]).toMatchObject({
      field: 'price',
      before: 239_000,
      after: 225_000,
      disposition: 'applied',
    })
    expect(peixotto?.lastCheckedAt).toBe(peixotto?.checks[2]?.at)
    expect(peixotto?.lastSeenOnlineAt).toBe(peixotto?.checks[2]?.at)
    // Le changement de prix trouvé par la vérification n'est journalisé qu'une fois.
    expect(
      dataset.activity.filter(
        a =>
          a.listingKey === 'talence-peixotto-t3' &&
          a.action === 'listing.price_changed'
      )
    ).toEqual([])
    // La publication d'origine : inchangée, prix, plus en ligne, republiée.
    const origin = byKey.get('cenon-t3-origine')
    const republished = byKey.get('cenon-t3')
    expect(origin?.checks.map(c => c.outcome)).toEqual([
      'unchanged',
      'changed',
      'offline',
      'republished',
    ])
    expect(origin?.checks[2]?.suggestedStatus).toBe('sold_or_withdrawn')
    expect(origin?.checks[3]).toMatchObject({
      linkedListingId: republished?.id,
      suggestedStatus: null,
      summary: expect.stringContaining(
        'Republiée : reprise par « T3 avec vue sur la ville, Cenon »'
      ),
    })
    expect(origin?.lastSeenOnlineAt).toBe(origin?.checks[1]?.at)
    expect(republished?.republishedFromId).toBe(origin?.id)
    expect(republished?.input.publishedAt).not.toBeNull()
    expect(byKey.get('talence-forum-t2')?.checks[0]?.summary).toBe(
      'Non vérifiée : page inaccessible'
    )
    for (const listing of dataset.listings) {
      for (const check of listing.checks) {
        expect(check.evidence?.length ?? 0).toBeLessThanOrEqual(500)
        expect(check.checkedUrl).toMatch(FICTIVE_LINK)
        // Lot 18 : chaque vérification porte sur un lien de l'annonce.
        expect(listing.links.find(l => l.id === check.linkId)?.url).toBe(
          check.checkedUrl
        )
      }
    }
  })

  it('lot 16 : des explorations fictives, toutes les sortes de lignes, un portail bloqué', () => {
    expect(dataset.explorations).toHaveLength(2)
    const [old, recent] = dataset.explorations
    expect((old?.finishedAt ?? '') < (recent?.finishedAt ?? '')).toBe(true)
    expect(recent?.lines.map(l => l.outcome)).toEqual([
      'new',
      'duplicate_probable',
      'new',
      'new',
      'known',
      'known',
      'dismissed',
      'dismissed',
      'out',
      'out',
      'out',
      'attached',
      'duplicate_probable',
    ])
    expect(recent?.lines.slice(0, 4).map(l => l.level)).toEqual([
      'in',
      'in',
      'margin',
      'to_confirm',
    ])
    expect(recent?.counts).toMatchObject({
      seen: 13,
      toValidate: 5,
      known: 2,
      attached: 1,
      dismissed: 2,
      out: 3,
      draftsCreated: 5,
      checksChanged: 1,
      blockedPortals: 1,
    })
    expect(recent?.summary).toBe(
      '13 annonces vues : 5 à valider, 2 déjà suivies, 1 rattachée d’office, 2 déjà écartées, 3 hors critères ; Logic-Immo bloqué'
    )
    expect(recent?.portals.find(p => p.status === 'blocked')?.portal).toBe(
      'logicimmo'
    )
    // La baisse de prix vue au même lien est une vérification (lot 15).
    const merignac = dataset.listings.find(l => l.key === 'merignac-t2')
    expect(merignac?.input.price).toBe(152_000)
    expect(merignac?.checks.find(c => c.outcome === 'changed')).toMatchObject({
      at: recent?.finishedAt,
      channel: 'mcp',
    })
    expect(
      dataset.listings.find(l => l.key === 'begles-t3')?.checks.at(-1)?.outcome
    ).toBe('unchanged')
    // Brouillons : cinq à valider (dont deux doublons), un écarté avec sa
    // raison, un reconnu (lot 18 : rattaché d'office).
    const drafts = dataset.explorationDrafts
    expect(drafts.filter(d => d.status === 'pending')).toHaveLength(5)
    expect(drafts.filter(d => d.status === 'merged')).toHaveLength(1)
    expect(drafts.find(d => d.status === 'dismissed')).toMatchObject({
      dismissReason: 'rez-de-chaussée sur rue',
      decidedBy: 'demo2',
    })
    expect(
      drafts.filter(d => d.status === 'pending' && d.duplicates.length)
    ).toHaveLength(2)
    for (const d of drafts) {
      expect(ListingInputSchema.parse(d.input)).toEqual(d.input)
      expect(d.input.title.startsWith('[Exemple]')).toBe(true)
      expect(d.excerpt ?? '').toMatch(/^Exemple fictif/)
    }
    for (const e of dataset.explorations) {
      for (const line of e.lines) {
        expect(
          line.title.startsWith('[Exemple]') || line.listingKey !== null
        ).toBe(true)
        expect(line.url).toMatch(FICTIVE_LINK)
      }
    }
    // Sacha est prévenu de l'exploration de Camille (pas Camille).
    const recorded = dataset.activity.filter(
      a => a.action === 'exploration.recorded'
    )
    expect(recorded).toHaveLength(2)
    const members = dataset.members.map(m => ({
      id: m.id,
      displayName: m.displayName,
    }))
    const sent = notificationsForActivity(
      {
        action: 'exploration.recorded',
        channel: 'mcp',
        actorMemberId: dataset.members[0]?.id ?? null,
        before: null,
        after: recorded[1]?.after,
        listingId: null,
      },
      { members, listingTitle: null }
    )
    expect(sent.map(s => [s.recipientId, s.title])).toEqual([
      [dataset.members[1]?.id, 'Claude a trouvé 5 annonces à valider'],
    ])
  })

  it('lot 17 : contacts fictifs, une réponse qui a rempli les charges, un message à valider, une relance due', () => {
    expect(dataset.contacts).toHaveLength(3)
    for (const c of dataset.contacts) {
      expect(c.agencyName).toMatch(/\[Exemple\]/)
      // Lot 18 : le nom de l'agence du contact est celui de l'annonce.
      expect(c.agencyName).toBe(
        dataset.listings.find(l => l.id === c.listingId)?.input.sellerName
      )
      if (c.email) expect(c.email).toMatch(/@agence\.exemple\.invalid$/)
      if (c.portalMessageUrl)
        expect(c.portalMessageUrl).toMatch(/^https:\/\/exemple\.invalid\//)
    }
    const byKey = new Map(dataset.listings.map(l => [l.key, l]))
    const requests = new Map(dataset.agencyRequests.map(r => [r.listingKey, r]))
    expect(dataset.agencyRequests.map(r => [r.listingKey, r.status])).toEqual([
      ['bastide-t2', 'answered'],
      ['merignac-t2', 'draft'],
      ['chartrons-t2', 'sent'],
    ])
    // La réponse a rempli les charges (source « agence ») et coché les
    // tâches ; la taxe foncière, saisie à la main, est proposée.
    const bastide = byKey.get('bastide-t2')
    const answered = requests.get('bastide-t2')
    expect(bastide?.input.annualCharges).toBe(1_680)
    expect(bastide?.input.propertyTax).toBe(950)
    expect(bastide?.input.fieldSources.annualCharges?.source).toBe('agency')
    expect(ListingInputSchema.parse(bastide?.input)).toEqual(bastide?.input)
    expect(
      answered?.answers[0]?.changes.map(c => [c.key, c.disposition])
    ).toEqual([
      ['annualCharges', 'applied'],
      ['propertyTax', 'proposed'],
    ])
    expect(answered?.answers[0]?.excerpt).toContain('[téléphone masqué]')
    expect(answered?.approvedVia).toBe('chat')
    const charges = bastide?.tasks.find(t => t.field === 'annualCharges')
    expect(charges).toMatchObject({
      done: true,
      answeredAt: answered?.answeredAt,
      requestId: answered?.id,
    })
    expect(bastide?.updatedAt).toBe(answered?.answeredAt)
    // Le message à valider : texte poli, signature des membres, sans e-mail.
    const draft = requests.get('merignac-t2')
    expect(draft?.body).toContain('Bonjour Madame, Monsieur,')
    expect(draft?.body).toContain('Camille (démo) et Sacha (démo)')
    expect(draft?.body).not.toContain('@apart.local')
    expect(draft?.channel).toBe('portal_message')
    // La relance due : envoyée il y a douze jours, sans réponse.
    const due = requests.get('chartrons-t2')
    expect(
      isFollowUpDue(
        {
          status: due?.status ?? 'draft',
          sentAt: due?.sentAt ?? null,
          answeredAt: null,
          pendingQuestions: due?.taskIds.length ?? 0,
          followedUp: false,
        },
        NOW
      )
    ).toBe(true)
    const dtg = byKey
      .get('chartrons-t2')
      ?.tasks.find(t => t.id === due?.taskIds[0])
    expect(dtg).toMatchObject({ done: false, requestId: due?.id })
    // Le journal ne garde aucune coordonnée du contact.
    const agency = dataset.activity.filter(
      a =>
        a.action.startsWith('agency_request.') ||
        a.action.startsWith('contact.')
    )
    expect(agency.map(a => a.action)).toEqual(
      expect.arrayContaining([
        'contact.updated',
        'agency_request.drafted',
        'agency_request.approved',
        'agency_request.sent',
        'agency_request.answered',
      ])
    )
    expect(JSON.stringify(agency)).not.toContain('exemple.invalid')
  })

  it('lot 27 : l’annonce des Chartrons est aussi confiée à une seconde agence fictive, avec sa référence', () => {
    const chartrons = dataset.listings.find(l => l.key === 'chartrons-t2')
    expect(chartrons?.otherSellers).toHaveLength(1)
    expect(chartrons?.otherSellers[0]).toMatchObject({
      sellerType: 'agency',
      sellerName: '[Exemple] Agence du Jardin public',
      sellerReference: 'EX-5512',
      sellerReferenceKey: 'EX5512',
      origin: 'manual',
    })
    // L'agence principale reste la sienne ; les autres annonces n'en ont qu'une.
    expect(chartrons?.input.sellerReference).toBe('EX-2041')
    expect(
      dataset.listings.filter(l => l.otherSellers.length > 0)
    ).toHaveLength(1)
    const logged = dataset.activity.filter(
      a => a.action === 'listing.seller_added'
    )
    expect(logged).toHaveLength(1)
    expect(logged[0]?.after).toMatchObject({
      seller: '« [Exemple] Agence du Jardin public », réf. EX-5512',
    })
  })

  it('lot 18 : une annonce sur trois portails, un particulier sur deux, un mandataire rattaché d’office, des vendeurs inconnus', () => {
    const byKey = new Map(dataset.listings.map(l => [l.key, l]))
    const chartrons = byKey.get('chartrons-t2')
    expect(
      chartrons?.links.map(l => [l.portal, l.origin, l.online, l.price])
    ).toEqual([
      ['seloger', 'original', true, 172_000],
      ['bienici', 'manual', false, 172_000],
      ['leboncoin', 'claude', true, 177_000],
    ])
    expect(chartrons?.input).toMatchObject({
      price: 172_000,
      sellerType: 'agency',
      sellerName: '[Exemple] Immobilier des Chartrons',
      sellerReference: 'EX-2041',
    })
    expect(chartrons?.sellerReferenceKey).toBe('EX2041')
    expect(chartrons?.links[2]?.readReference).toBe('EX-2041')
    // Un lien hors ligne parmi d'autres est une mise à jour, sans statut
    // proposé ; l'écart entre portails est noté, jamais résolu.
    expect(chartrons?.checks.map(c => c.outcome)).toEqual([
      'link_added',
      'changed',
      'link_added',
    ])
    expect(chartrons?.checks[1]).toMatchObject({
      suggestedStatus: null,
      linkId: chartrons?.links[1]?.id,
    })
    expect(plain(chartrons?.checks[1]?.summary)).toBe(
      'Plus en ligne sur Bien’ici (toujours en ligne sur SeLoger)'
    )
    const gap = chartrons?.checks[2]?.changes.find(c => c.field === 'priceGap')
    expect(gap?.disposition).toBe('noted')
    expect(plain(gap?.text)).toContain('+5 000 € par rapport à SeLoger')
    expect(plain(gap?.text)).toContain('frais inclus ?')

    // Partout : le lien d'origine en tête, le lien principal recopié dans la
    // fiche, le prix de la fiche = le plus bas des liens en ligne, des liens
    // fictifs et uniques dans l'espace.
    const keys = new Set<string>()
    for (const l of dataset.listings) {
      expect(l.links[0]?.origin).toBe('original')
      expect(primaryLink(l.links)?.url).toBe(l.input.url)
      const lowest = lowestOnlinePrice(l.links)
      if (lowest) expect(lowest.price).toBe(l.input.price)
      for (const link of l.links) {
        expect(link.url).toMatch(FICTIVE_LINK)
        expect(keys.has(link.normalizedUrl)).toBe(false)
        keys.add(link.normalizedUrl)
      }
    }

    // Un particulier sur PAP et Leboncoin (partagé depuis le téléphone) : ni
    // agence ni référence.
    const cauderan = byKey.get('cauderan-t3')
    expect(cauderan?.input).toMatchObject({
      sellerType: 'private',
      sellerName: null,
      sellerReference: null,
    })
    expect(cauderan?.links.map(l => [l.portal, l.origin])).toEqual([
      ['pap', 'original'],
      ['leboncoin', 'share'],
    ])

    // Le mandataire : le lien Bien'ici rattaché d'office par l'exploration,
    // avec son brouillon reconnu (« Ce n'est pas la même » le détache).
    const merignac = byKey.get('merignac-t2')
    expect(merignac?.input.sellerType).toBe('mandatary')
    const attached = merignac?.links.find(l => l.origin === 'exploration')
    const merged = dataset.explorationDrafts.find(d => d.status === 'merged')
    expect(attached?.draftId).toBe(merged?.id)
    expect(merged).toMatchObject({
      listingId: merignac?.id,
      attachedLinkId: attached?.id,
      mergedCheckId: merignac?.checks.find(c => c.linkId === attached?.id)?.id,
    })
    expect(merged?.duplicates[0]).toMatchObject({
      listingId: merignac?.id,
      certain: true,
    })
    expect(merged?.duplicates[0]?.reasons.map(r => r.kind)).toContain(
      'same_reference'
    )
    expect(
      dataset.explorations[1]?.lines.find(l => l.outcome === 'attached')
    ).toMatchObject({ listingKey: 'merignac-t2', draftId: merged?.id })

    // Même référence, autre agence : un doublon probable à trancher.
    const reference = dataset.explorationDrafts.find(
      d => d.input.sellerName === '[Exemple] Agence du Jardin public'
    )
    expect(reference?.status).toBe('pending')
    expect(reference?.duplicates[0]).toMatchObject({
      listingId: chartrons?.id,
      certain: false,
    })
    expect(reference?.duplicates[0]?.reasons[0]?.kind).toBe(
      'same_reference_other_agency'
    )

    // Les autres : vendeur inconnu, jamais deviné.
    expect(
      dataset.listings.filter(l => l.input.sellerType === 'unknown').length
    ).toBeGreaterThanOrEqual(8)

    // Journal : les liens ajoutés ; l'autre membre est prévenu d'un lien
    // ajouté par Claude, jamais d'un lien collé dans l'application.
    const added = dataset.activity.filter(
      a => a.action === 'listing_link.added'
    )
    expect(
      added.map(a => [a.listingKey, a.channel, a.after?.origin, a.after?.auto])
    ).toEqual([
      ['chartrons-t2', 'web', 'manual', false],
      ['chartrons-t2', 'mcp', 'claude', false],
      ['merignac-t2', 'mcp', 'exploration', true],
      ['cauderan-t3', 'web', 'share', false],
    ])
    const members = dataset.members.map(m => ({
      id: m.id,
      displayName: m.displayName,
    }))
    const sent = added.map(a =>
      notificationsForActivity(
        {
          action: a.action,
          channel: a.channel,
          actorMemberId: demoId(`member:${a.actor}`),
          before: a.before,
          after: a.after,
          listingId: null,
        },
        { members, listingTitle: '[Exemple]' }
      ).map(s => [s.recipientId, s.type])
    )
    expect(sent).toEqual([
      [],
      [[dataset.members[1]?.id, 'listing_checked']],
      [[dataset.members[1]?.id, 'listing_checked']],
      [],
    ])
  })

  it('laisse des annonces « nouvelles » à chacun : sans vue du membre', () => {
    for (const handle of ['demo', 'demo2'] as const) {
      expect(
        dataset.listings.filter(l => !l.views.some(v => v.handle === handle))
          .length
      ).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('lot 20 : nos avis, critère par critère', () => {
  const members = dataset.members.map(m => ({
    id: m.id,
    displayName: m.displayName,
  }))
  const names = new Map(
    members.map(m => [m.id, { displayName: m.displayName }])
  )
  const memberOf = (handle: string) => demoId(`member:${handle}`)
  const byKey = new Map(dataset.listings.map(l => [l.key, l]))
  const opinionsOf = (key: string) =>
    (byKey.get(key)?.opinions ?? []).map(o => ({
      memberId: memberOf(o.handle),
      rating: o.rating,
      text: o.text,
      scores: o.scores,
      updatedAt: o.updatedAt,
    }))
  const confront = (key: string, viewer: 'demo' | 'demo2' | null = null) => {
    const opinions = opinionsOf(key)
    const visibleKeys = visibleCriterionKeys(dataset.opinionCriteria)
    const split = viewer
      ? splitOpinionsForViewer(opinions, {
          viewerId: memberOf(viewer),
          blind: dataset.opinionsBlind,
          revealed: false,
          visibleKeys,
        })
      : { visible: opinions, masked: [], viewerRated: true }
    return confrontOpinions({
      criteria: dataset.opinionCriteria,
      members,
      visible: split.visible,
      masked: split.masked,
      blind: dataset.opinionsBlind,
      revealed: false,
      viewerRated: split.viewerRated,
    })
  }

  it('les huit critères par défaut et « Cuisine », ajouté par l’espace, dix au plus', () => {
    const criteria = dataset.opinionCriteria
    expect(criteria.length).toBeLessThanOrEqual(OPINION_CRITERIA_MAX)
    expect(criteria.map(c => c.key)).toEqual([
      ...DEFAULT_OPINION_CRITERIA.map(c => c.key),
      'custom_cuisine',
    ])
    expect(criteria.map(c => c.position)).toEqual(criteria.map((_, i) => i))
    for (const c of criteria) {
      const { id: _id, createdAt: _at, ...criterion } = c
      expect(OpinionCriterionSchema.parse(criterion)).toEqual(criterion)
    }
    expect(criteria.filter(c => c.origin === 'custom')).toEqual([
      expect.objectContaining({ label: 'Cuisine', hidden: false }),
    ])
    expect(dataset.opinionsBlind).toBe(true)
    const added = dataset.activity.filter(
      a => a.action === 'opinion_settings.criterion_added'
    )
    expect(added).toHaveLength(1)
    expect(
      describeActivity(
        {
          action: added[0]?.action ?? '',
          channel: 'web',
          actorMemberId: memberOf('demo'),
          before: null,
          after: added[0]?.after ?? null,
        },
        names
      ).summary
    ).toBe('a ajouté le critère d’avis « Cuisine »')
  })

  it('des notes valides (1 à 5, mots courts), jamais avant que le critère existe', () => {
    const cuisine = dataset.opinionCriteria.find(c => c.origin === 'custom')
    let scored = 0
    for (const l of dataset.listings) {
      for (const o of l.opinions) {
        OpinionScoresInputSchema.parse(
          Object.fromEntries(
            o.scores.map(s => [s.key, { score: s.score, word: s.word }])
          )
        )
        for (const s of o.scores) {
          expect(dataset.opinionCriteria.some(c => c.key === s.key)).toBe(true)
          if (s.key === cuisine?.key) {
            expect(s.createdAt >= (cuisine?.createdAt ?? '')).toBe(true)
            scored += 1
          }
        }
        if (o.rating > 0 || o.scores.length > 0)
          expect(o.ratedAt).not.toBeNull()
      }
    }
    expect(scored).toBeGreaterThanOrEqual(3)
  })

  it('Saint-Michel : deux désaccords (calme, « on s’y voit ») après la visite', () => {
    const s = confront('saint-michel-t3')
    expect(s.status).toBe('ready')
    expect(s.disagreementKeys).toEqual(['quiet', 'feel'])
    expect(s.commonScore).not.toBeNull()
    expect(s.members.every(m => m.state === 'rated')).toBe(true)
    const journal = dataset.activity.filter(
      a => a.listingKey === 'saint-michel-t3' && a.action.startsWith('opinion.')
    )
    expect(journal.map(a => a.action)).toEqual([
      'opinion.created',
      'opinion.created',
      'opinion.updated',
    ])
    const say = (index: number) => {
      const a = journal[index]
      return describeActivity(
        {
          action: a?.action ?? '',
          channel: 'web',
          actorMemberId: a?.actor ? memberOf(a.actor) : null,
          before: a?.before ?? null,
          after: a?.after ?? null,
        },
        names
      ).summary
    }
    expect(say(0)).toBe('a donné son avis après la visite : 3/5, 8 critères.')
    expect(say(1)).toBe(
      'a donné son avis après la visite : 4/5, 8 critères. Deux désaccords avec Camille (démo) : calme, on s’y voit.'
    )
    expect(say(2)).toBe(
      'a mis à jour son avis après la visite : 3/5, 8 critères (état 3 → 2). Deux désaccords avec Sacha (démo) : calme, on s’y voit.'
    )
    // Les notifications ne disent jamais les notes.
    const after = journal[1]?.after ?? null
    const sent = notificationsForActivity(
      {
        action: 'opinion.created',
        channel: 'web',
        actorMemberId: memberOf('demo2'),
        before: null,
        after,
        listingId: byKey.get('saint-michel-t3')?.id ?? null,
      },
      { members, listingTitle: '[Exemple] T3' }
    )
    expect(sent.map(n => [n.recipientId, n.type, n.title, n.body])).toEqual([
      [
        memberOf('demo'),
        'opinion_added',
        'Sacha (démo) a donné son avis',
        '[Exemple] T3 : 2 désaccords à discuter.',
      ],
    ])
  })

  it('Bastide : en attente de Camille, et masqué pour elle à l’aveugle', () => {
    expect(confront('bastide-t2').status).toBe('pending')
    const forCamille = confront('bastide-t2', 'demo')
    expect(forCamille.masked).toBe(true)
    const sacha = forCamille.members.find(m => m.memberId === memberOf('demo2'))
    expect(sacha).toMatchObject({
      state: 'masked',
      rating: null,
      ratedCount: 9,
    })
    expect(JSON.stringify(forCamille)).not.toContain('rien à prévoir')
    expect(confront('bastide-t2', 'demo2').masked).toBe(false)
  })

  it('d’accord ailleurs : Talence Forum et Le Bouscat sans désaccord, Chartrons sur la luminosité', () => {
    for (const key of ['talence-forum-t2', 'le-bouscat-t2']) {
      const s = confront(key)
      expect(s.status).toBe('ready')
      expect(s.disagreementKeys).toEqual([])
      expect(s.agreements).toBeGreaterThanOrEqual(8)
    }
    expect(confront('le-bouscat-t2').rows.map(r => r.key)).toContain(
      'custom_cuisine'
    )
    expect(confront('chartrons-t2').disagreementKeys).toEqual(['luminosity'])
  })
})

describe('lot 21 : suivre ses annonces, étape par étape', () => {
  const { decisions } = dataset

  it('une proposition dans chaque état, chaque résolution, des deux côtés', () => {
    expect(new Set(decisions.map(d => d.state))).toEqual(
      new Set(['open', 'to_settle', 'applied', 'withdrawn'])
    )
    expect(new Set(decisions.map(d => d.resolution))).toEqual(
      new Set([null, 'agreed', 'without_waiting'])
    )
    const open = decisions.filter(d => d.state === 'open')
    expect(new Set(open.map(d => d.author))).toEqual(new Set(['demo', 'demo2']))
    expect(open.some(d => d.draftId !== null)).toBe(true)
    expect(open.some(d => d.listingKey !== null)).toBe(true)
  })

  it('vise une annonce ou un brouillon, au plus une en cours par cible', () => {
    for (const d of decisions) {
      expect((d.listingKey === null) !== (d.draftId === null)).toBe(true)
    }
    const running = decisions
      .filter(d => d.state === 'open' || d.state === 'to_settle')
      .map(d => d.listingKey ?? d.draftId)
    expect(new Set(running).size).toBe(running.length)
  })

  it('un écart a toujours sa raison, un désaccord porte l’autre choix', () => {
    for (const d of decisions.filter(x => x.choice === 'discard')) {
      expect(d.reason?.trim()).toBeTruthy()
    }
    const clash = decisions.find(d => d.state === 'to_settle')
    expect(clash?.responses).toEqual([
      expect.objectContaining({ agrees: false, choice: 'discard' }),
    ])
  })

  it('une proposition en cours ne change pas le statut de son annonce', () => {
    for (const d of decisions) {
      if (d.state !== 'open' && d.state !== 'to_settle') continue
      if (d.listingKey === null) continue
      const row = dataset.listings.find(l => l.key === d.listingKey)
      expect(row?.input.status).toBe(d.fromStatus)
    }
  })

  it('remplit chaque étape à annonces', () => {
    const stages = new Set(
      dataset.listings.map(l => stageOfStatus(l.input.status))
    )
    expect(stages).toEqual(
      new Set(['a-etudier', 'a-visiter', 'visitees', 'offres', 'archives'])
    )
  })
})

describe('Lot 24 : la visite du jour', () => {
  it('une visite planifiée aujourd’hui à Paris (même seedée à minuit passé) et une à venir sans compte rendu', () => {
    const today = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    for (const now of [NOW, new Date('2026-11-10T23:30:00Z')]) {
      const data = buildDemoDataset(now)
      const bastide = data.listings.find(l => l.key === 'bastide-t2')
      const visit = bastide?.visits[0]
      expect(visit?.status).toBe('planned')
      expect(today(visit?.visitedAt ?? '')).toBe(today(now.toISOString()))
      expect(bastide?.input.status).toBe('to_visit')
    }
    const merignac = dataset.listings.find(l => l.key === 'merignac-t2')
    expect(merignac?.visits[0]).toMatchObject({
      status: 'planned',
      report: null,
    })
    // Des points à vérifier sur place pour le mode visite.
    expect(
      dataset.listings
        .find(l => l.key === 'bastide-t2')
        ?.tasks.some(t => /^vérifier/i.test(t.label) && !t.done)
    ).toBe(true)
  })
})
