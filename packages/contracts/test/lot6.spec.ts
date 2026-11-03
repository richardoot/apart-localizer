import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_RULES,
  ActivityQuerySchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
  EXPORT_FORMAT_VERSION,
  ExportQuerySchema,
  InboundEmailSchema,
  ListingDraftDecisionSchema,
  McpAddVisitInputSchema,
  McpWhatsNewInputSchema,
  NotificationQuerySchema,
  PushSubscriptionInputSchema,
  VISIT_PHOTO_MAX_BYTES,
  VisitInputSchema,
  VisitPhotoUploadRequestSchema,
  VisitUpdateSchema,
  activityKindOf,
  extractUrls,
  htmlToText,
  isListingUrl,
  listingFieldLabel,
  mergeNotificationPreferences,
  parseAlertEmail,
  parseSharedListing,
  readAlertFacts,
  resolveNotificationPreferences,
} from '../src/index.js'

describe('visites', () => {
  it('valide une visite et ses valeurs par défaut', () => {
    const visit = VisitInputSchema.parse({
      visitedAt: '2026-11-12T18:00:00+01:00',
    })
    expect(visit).toMatchObject({
      status: 'done',
      participantIds: [],
      rating: 0,
      report: null,
      createPrepTask: false,
    })
    expect(
      VisitInputSchema.safeParse({ visitedAt: 'demain', rating: 6 }).success
    ).toBe(false)
  })

  it('refuse une mise à jour vide, garde-fou seul compris', () => {
    expect(VisitUpdateSchema.safeParse({}).success).toBe(false)
    expect(
      VisitUpdateSchema.safeParse({
        expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
      }).success
    ).toBe(false)
    expect(VisitUpdateSchema.safeParse({ report: null }).success).toBe(true)
  })

  it('borne la taille et le type des photos', () => {
    const ok = {
      contentType: 'image/jpeg',
      sizeBytes: 1_000_000,
      thumbnail: { contentType: 'image/webp', sizeBytes: 30_000 },
    }
    expect(VisitPhotoUploadRequestSchema.parse(ok)).toMatchObject({
      width: null,
      caption: null,
    })
    expect(
      VisitPhotoUploadRequestSchema.safeParse({
        ...ok,
        sizeBytes: VISIT_PHOTO_MAX_BYTES + 1,
      }).success
    ).toBe(false)
    expect(
      VisitPhotoUploadRequestSchema.safeParse({
        ...ok,
        contentType: 'image/gif',
      }).success
    ).toBe(false)
    expect(
      VisitPhotoUploadRequestSchema.safeParse({
        ...ok,
        thumbnail: { contentType: 'image/jpeg', sizeBytes: 600_000 },
      }).success
    ).toBe(false)
  })

  it('add_visit désigne les participants par identifiant court', () => {
    const input = McpAddVisitInputSchema.parse({
      listingId: '11111111-1111-4111-8111-111111111111',
      visitedAt: '2026-11-12T17:00:00.000Z',
      participantHandles: ['richard', 'chloe'],
    })
    expect(input.participantHandles).toEqual(['richard', 'chloe'])
    expect('participantIds' in input).toBe(false)
    expect(McpWhatsNewInputSchema.parse({}).limit).toBe(50)
  })
})

describe('journal', () => {
  it('classe les actions par sorte', () => {
    expect(activityKindOf('listing.status_changed')).toBe('status')
    expect(activityKindOf('listing.price_changed')).toBe('price')
    expect(activityKindOf('listing.updated')).toBe('listing')
    expect(activityKindOf('visit.photo_added')).toBe('visit')
    expect(activityKindOf('rent_comparable.created')).toBe('study')
    expect(activityKindOf('draft.received')).toBe('draft')
    expect(activityKindOf('weird')).toBe('other')
    expect(Object.keys(ACTIVITY_KIND_RULES)).not.toContain('other')
    expect(listingFieldLabel('price')).toBe('Prix')
    expect(listingFieldLabel('inconnu')).toBe('inconnu')
  })

  it('lit les filtres du journal depuis une chaîne de requête', () => {
    expect(
      ActivityQuerySchema.parse({ page: '2', limit: '10', channel: 'mcp' })
    ).toEqual({ page: 2, limit: 10, channel: 'mcp' })
    expect(ActivityQuerySchema.safeParse({ kind: 'nope' }).success).toBe(false)
  })
})

describe('notifications', () => {
  it('complète les préférences enregistrées par les défauts', () => {
    expect(resolveNotificationPreferences(null)).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES
    )
    expect(resolveNotificationPreferences([1, 2])).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES
    )
    const prefs = resolveNotificationPreferences({
      status_changed: { push: false },
      task_assigned: { email: 'oui' },
    })
    expect(prefs.status_changed).toEqual({
      in_app: true,
      push: false,
      email: false,
    })
    expect(prefs.task_assigned).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES.task_assigned
    )
    const merged = mergeNotificationPreferences(prefs, {
      listing_created: { email: true },
      status_changed: { push: undefined },
    })
    expect(merged.listing_created.email).toBe(true)
    expect(merged.status_changed.push).toBe(false)
  })

  it('valide un abonnement push en https', () => {
    expect(
      PushSubscriptionInputSchema.safeParse({
        endpoint: 'http://push.example/abc',
        keys: { p256dh: 'k', auth: 'a' },
      }).success
    ).toBe(false)
    expect(
      PushSubscriptionInputSchema.parse({
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'k', auth: 'a' },
      }).userAgent
    ).toBeNull()
    expect(NotificationQuerySchema.parse({}).unreadOnly).toBe(false)
    expect(
      NotificationQuerySchema.parse({ unreadOnly: 'true' }).unreadOnly
    ).toBe(true)
  })
})

describe('partage et alertes e-mail', () => {
  it('trouve les liens d’un texte, sans ponctuation ni doublon', () => {
    expect(
      extractUrls(
        'Vu sur https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456. Et https://leboncoin.fr/ad/ventes_immobilieres/2890123456 !'
      )
    ).toEqual(['https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456'])
    expect(extractUrls(null)).toEqual([])
  })

  it('lit un partage dont le lien est dans le texte ou dans `url`', () => {
    expect(
      parseSharedListing({
        title: 'Appartement 2 pièces 45 m²',
        text: 'Regarde cette annonce : https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      })
    ).toEqual({
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      text: 'Appartement 2 pièces 45 m²\nRegarde cette annonce :',
      title: 'Appartement 2 pièces 45 m²',
      source: 'leboncoin',
    })
    const seloger = parseSharedListing({
      url: 'https://www.seloger.com/annonces/achat/appartement/talence-33/123456789.htm',
      text: 'T3 lumineux',
    })
    expect(seloger.url).toContain('seloger.com')
    expect(seloger.source).toBe('seloger')
    expect(parseSharedListing({ url: 'pas un lien', text: '' })).toEqual({
      url: null,
      text: '',
      title: null,
      source: 'autre',
    })
  })

  it('met un HTML d’e-mail en texte, liens gardés', () => {
    expect(
      htmlToText(
        '<html><head><style>p{}</style></head><body><p>T2 &amp; balcon&nbsp;: 180&nbsp;000&euro;</p><a href="https://pap.fr/annonces/r123456">Voir</a></body></html>'
      )
    ).toBe('T2 & balcon : 180 000€\nVoir https://pap.fr/annonces/r123456')
  })

  it('reconnaît une page d’annonce et écarte les liens de service', () => {
    expect(
      isListingUrl(
        'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/218765432.htm'
      )
    ).toBe(true)
    expect(
      isListingUrl('https://www.seloger.com/desabonnement?id=12345678')
    ).toBe(false)
    expect(isListingUrl('https://www.seloger.com/aide')).toBe(false)
    expect(isListingUrl('https://exemple.invalid/123456')).toBe(false)
    expect(isListingUrl('pas une url')).toBe(false)
  })

  it('lit prix, surface, pièces et commune sans rien deviner', () => {
    expect(
      readAlertFacts('Appartement T2 45,5 m² à Talence – 189 000 €')
    ).toEqual({ price: 189000, surface: 45.5, rooms: 2, commune: 'Talence' })
    expect(readAlertFacts('3 pièces, Merignac, loyer 850 €')).toEqual({
      price: null,
      surface: null,
      rooms: 3,
      commune: 'Mérignac',
    })
    expect(readAlertFacts('villenave d’ornon 210000€')).toMatchObject({
      price: 210000,
      commune: "Villenave-d'Ornon",
    })
    expect(readAlertFacts('Le bouscat').commune).toBe('Le Bouscat')
    expect(readAlertFacts('rien').commune).toBeNull()
  })

  it("repère les annonces d'un e-mail d'alerte (texte et HTML), au plus `max`", () => {
    const email = {
      subject: '3 nouvelles annonces pour votre recherche',
      text: [
        'Bonjour,',
        'Appartement 2 pièces 45 m² Talence',
        '189 000 €',
        'https://www.seloger.com/annonces/achat/appartement/talence-33/218765432.htm',
        '',
        'T3 Pessac 62 m² 235 000 €',
        'https://www.seloger.com/annonces/achat/appartement/pessac-33/218765999.htm',
        'Se désabonner : https://www.seloger.com/desabonnement?u=123456789',
      ].join('\n'),
      html: '<p>Bègles T2 40 m² 165 000 € <a href="https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456">Voir</a></p>',
    }
    const all = parseAlertEmail(email)
    expect(all.map(c => [c.source, c.price, c.surface, c.commune])).toEqual([
      ['seloger', 189000, 45, 'Talence'],
      ['seloger', 235000, 62, 'Pessac'],
      ['leboncoin', 165000, 40, 'Bègles'],
    ])
    expect(all[0]?.title).toBe('Appartement 2 pièces 45 m² Talence')
    expect(all[0]?.snippet).not.toContain('https://')
    expect(all[2]?.title).toBe('Bègles T2 40 m² 165 000 € Voir')
    expect(parseAlertEmail(email, 1)).toHaveLength(1)
    expect(parseAlertEmail({ subject: 'vide', text: 'aucun lien' })).toEqual([])
    // Lien d'abord, détails ensuite : le bloc qui suit le lien.
    const after = parseAlertEmail({
      text: 'Nouvelle annonce PAP\nhttps://www.pap.fr/annonces/appartement-bordeaux-r412345678\nT2 Bordeaux 38 m²\n172 000 €\nhttps://www.pap.fr/aide',
    })
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({
      source: 'pap',
      price: 172000,
      surface: 38,
      rooms: 2,
      commune: 'Bordeaux',
      title: 'T2 Bordeaux 38 m²',
    })
  })

  it('refuse un e-mail sans contenu et lit une décision de brouillon', () => {
    expect(InboundEmailSchema.safeParse({ subject: 'x' }).success).toBe(false)
    expect(
      InboundEmailSchema.parse({ subject: 'x', text: 'y' }).receivedAt
    ).toBeNull()
    expect(
      ListingDraftDecisionSchema.safeParse({ status: 'accepted' }).success
    ).toBe(false)
    expect(
      ListingDraftDecisionSchema.parse({ status: 'dismissed' }).status
    ).toBe('dismissed')
  })
})

describe('export', () => {
  it('lit format, portée et sélection depuis une chaîne de requête', () => {
    const query = ExportQuerySchema.parse({
      format: 'csv',
      scope: 'selection',
      ids: '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222',
      status: 'to_visit',
    })
    expect(query.format).toBe('csv')
    expect(query.ids).toHaveLength(2)
    expect(query.status).toEqual(['to_visit'])
    expect(ExportQuerySchema.parse({})).toMatchObject({
      format: 'json',
      scope: 'workspace',
    })
    expect(ExportQuerySchema.safeParse({ format: 'xlsx' }).success).toBe(false)
    expect(EXPORT_FORMAT_VERSION).toBe(1)
  })
})
