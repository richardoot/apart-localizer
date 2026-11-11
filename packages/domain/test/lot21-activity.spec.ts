/**
 * Lot 21 au journal et dans les notifications : une proposition n'est pas un
 * changement de statut ; l'application cite l'auteur et qui confirme ; une
 * session de tri ne fait qu'une notification, dans chaque sens. Prénoms de
 * la maquette, données fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  CONFIRM_URL,
  DRAFTS_INBOX_URL,
  DRAFTS_STAGE_URL,
  SETTLE_URL,
  activityActorName,
  appliedDecisionSummary,
  createdByDecision,
  decisionJournalOf,
  decisionNotificationText,
  decisionNotificationType,
  decisionRecipients,
  describeActivity,
  describeDecisionActivity,
  draftDecisionSummary,
  notificationTypeOf,
  notificationsForActivity,
  sessionAnsweredText,
  sessionProposedText,
  statusChangeSummary,
} from '../src/index.js'
import type { DecisionJournal } from '../src/index.js'

const RICHARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CHLOE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LISTING = '22222222-2222-4222-8222-222222222222'
const members = [
  { id: RICHARD, displayName: 'Richard' },
  { id: CHLOE, displayName: 'Chloé' },
]

const journal = (over: Partial<DecisionJournal> = {}): DecisionJournal => ({
  proposalId: 'p1',
  resolution: 'agreed',
  authorName: 'Richard',
  choiceLabel: 'À visiter',
  session: false,
  ...over,
})

const event = (
  action: string,
  after: unknown,
  actor: string | null = CHLOE,
  before: unknown = null,
  listingId: string | null = LISTING
) => ({
  action,
  channel: 'web' as const,
  actorMemberId: actor,
  before,
  after,
  listingId,
})

const context = {
  members: members.map(m => ({ ...m, role: 'member' as const })),
  listingTitle: '[Exemple] T3 Bacalan',
}

describe('le journal', () => {
  const names = new Map(members.map(m => [m.id, m]))
  const describeIt = (action: string, after: unknown, before: unknown = null) =>
    describeActivity(event(action, after, RICHARD, before), names)

  it('une proposition n’est pas un changement de statut', () => {
    const line = describeIt('decision.proposed', {
      choiceLabel: 'À visiter',
      reason: 'Prix correct, à voir sur place.',
      target: 'listing',
      title: 'x',
    })
    expect(line.kind).toBe('decision')
    expect(line.summary).toBe(
      'propose À visiter : « Prix correct, à voir sur place. »'
    )
    expect(
      describeIt('decision.proposed', {
        choiceLabel: 'À étudier',
        target: 'draft',
        title: '[Exemple] T2',
      }).summary
    ).toBe('propose À étudier (brouillon « [Exemple] T2 »)')
    expect(describeIt('decision.proposed', {}).summary).toBe(
      'propose une décision'
    )
  })

  it('l’application cite l’auteur et celui qui confirme, sur la ligne de statut', () => {
    const line = describeIt(
      'listing.status_changed',
      { status: 'to_visit', reason: null, decision: journal() },
      { status: 'to_study' }
    )
    expect(line.kind).toBe('status')
    expect(line.summary).toBe(
      'a confirmé : À étudier vers À visiter, proposé par Richard'
    )
    expect(line.changes.map(c => c.field)).toEqual(['status'])
    expect(
      describeIt(
        'listing.status_changed',
        { status: 'to_visit', reason: null },
        { status: 'to_study' }
      ).summary
    ).toBe('a changé le statut')
    expect(
      describeIt(
        'listing.status_changed',
        {
          status: 'to_visit',
          decision: journal({ authorName: null }),
        },
        {}
      ).summary
    ).toBe('a confirmé : — vers À visiter')
  })

  it('décider sans attendre, trancher, annuler', () => {
    expect(
      appliedDecisionSummary(
        journal({
          resolution: 'without_waiting',
          waitedForNames: ['Chloé'],
        }),
        'À étudier',
        'À visiter'
      )
    ).toBe('a décidé sans attendre Chloé : À visiter')
    expect(
      appliedDecisionSummary(
        journal({ resolution: 'without_waiting' }),
        'À étudier',
        'À visiter'
      )
    ).toBe('a décidé sans attendre les autres : À visiter')
    expect(
      appliedDecisionSummary(
        journal({
          resolution: 'settled',
          sides: [
            { name: 'Richard', label: 'À visiter' },
            { name: 'Chloé', label: 'Écarter' },
          ],
        }),
        'À étudier',
        'Écarté'
      )
    ).toBe('a tranché : Écarté (Richard : À visiter, Chloé : Écarter)')
    expect(
      appliedDecisionSummary(
        journal({ resolution: 'settled' }),
        'À étudier',
        'Écarté'
      )
    ).toBe('a tranché : Écarté')
    expect(
      appliedDecisionSummary(
        journal({ resolution: 'undone' }),
        'À visiter',
        'À étudier'
      )
    ).toBe('a annulé sa décision : retour À étudier')
  })

  it('un brouillon gardé ou écarté par une décision', () => {
    expect(
      describeIt('draft.accepted', {
        origin: 'exploration',
        decision: journal(),
      }).summary
    ).toBe('a confirmé : À valider vers À étudier, proposé par Richard')
    expect(
      describeIt('draft.dismissed', {
        origin: 'exploration',
        reason: 'quartier',
        decision: journal({
          resolution: 'without_waiting',
          waitedForNames: ['Chloé'],
        }),
      }).summary
    ).toBe('a décidé sans attendre Chloé : Écartée : « quartier »')
    expect(
      describeIt('draft.accepted', { origin: 'exploration' }).summary
    ).toBe('a ajouté à la liste une annonce trouvée par Claude')
    expect(draftDecisionSummary('draft.accepted', {})).toBeNull()
    expect(statusChangeSummary({}, {})).toBeNull()
  })

  it('les autres lignes', () => {
    expect(
      describeDecisionActivity('decision.disagreed', {
        choiceLabel: 'Écarter',
        authorName: 'Richard',
        proposedLabel: 'À visiter',
        reason: 'trop bruyant',
      })?.summary
    ).toBe(
      'n’est pas d’accord : Écarter, Richard proposait À visiter : « trop bruyant »'
    )
    expect(describeDecisionActivity('decision.disagreed', {})?.summary).toBe(
      'n’est pas d’accord : autre choix'
    )
    expect(
      describeDecisionActivity('decision.disagreed', { authorName: 'Richard' })
        ?.summary
    ).toBe('n’est pas d’accord : autre choix, Richard proposait')
    expect(
      describeDecisionActivity('decision.answered', {
        choiceLabel: 'À visiter',
      })?.summary
    ).toBe('est d’accord : À visiter')
    expect(describeDecisionActivity('decision.answered', {})?.summary).toBe(
      'est d’accord : la proposition'
    )
    expect(
      describeDecisionActivity('decision.response_undone', {
        choiceLabel: 'À visiter',
      })?.summary
    ).toBe('a annulé sa réponse sur « À visiter »')
    expect(
      describeDecisionActivity('decision.response_undone', {})?.summary
    ).toBe('a annulé sa réponse sur «  »')
    expect(describeDecisionActivity('decision.kept', {})?.summary).toBe(
      'a tranché : on la garde où elle est'
    )
    expect(
      describeDecisionActivity('decision.withdrawn', {
        choiceLabel: 'À visiter',
      })?.summary
    ).toBe('a retiré sa proposition « À visiter »')
    expect(
      describeDecisionActivity('decision.withdrawn', {
        choiceLabel: 'À visiter',
        via: 'departure',
      })?.summary
    ).toBe('a retiré sa proposition « À visiter » (membre parti)')
    expect(describeDecisionActivity('decision.withdrawn', {})?.summary).toBe(
      'a retiré sa proposition «  »'
    )
    expect(
      describeDecisionActivity('decision.stale', {
        choiceLabel: 'À visiter',
        why: 'l’annonce est passée « Vendu ou retiré »',
      })?.summary
    ).toBe(
      'proposition « À visiter » devenue caduque : l’annonce est passée « Vendu ou retiré »'
    )
    expect(describeDecisionActivity('decision.stale', {})?.summary).toBe(
      'proposition «  » devenue caduque : l’annonce a changé'
    )
    expect(
      describeDecisionActivity('decision.session_finished', {
        keep: 2,
        discard: 1,
      })?.summary
    ).toBe('a trié 3 annonces : 2 à garder, 1 à écarter')
    expect(
      describeDecisionActivity('decision.session_answered', {
        authorNames: 'Richard',
        changed: 2,
        toSettle: 1,
        waiting: 0,
      })?.summary
    ).toBe(
      'a répondu au tri de Richard : 2 annonces changent d’étape, 1 reste à trancher'
    )
    expect(
      describeDecisionActivity('decision.session_answered', {})?.summary
    ).toBe('a répondu au tri : rien ne change')
    expect(
      describeDecisionActivity('workspace.decide_together_changed', {
        decideTogether: true,
      })?.summary
    ).toBe('a activé « Décider à plusieurs »')
    expect(
      describeDecisionActivity('workspace.decide_together_changed', {
        decideTogether: false,
      })?.summary
    ).toBe('a désactivé « Décider à plusieurs »')
    expect(describeDecisionActivity('autre', {})).toBeNull()
    expect(
      describeDecisionActivity('decision.disagreed', 'pas un objet')?.summary
    ).toBe('n’est pas d’accord : autre choix')
  })

  it('les mots d’une session', () => {
    expect(sessionProposedText(1, 0)).toBe('a trié 1 annonce : 1 à garder')
    expect(sessionProposedText(0, 2)).toBe('a trié 2 annonces : 2 à écarter')
    expect(sessionAnsweredText(1, 0, 0)).toBe('1 annonce change d’étape')
    expect(sessionAnsweredText(2, 2, 2)).toBe(
      '2 annonces changent d’étape, 2 restent à trancher, 2 attendent encore'
    )
    expect(sessionAnsweredText(0, 0, 1)).toBe('1 attend encore')
    expect(sessionAnsweredText(0, 0, 0)).toBe('rien ne change')
  })

  it('l’acteur reste nommé sans marque de genre', () => {
    expect(activityActorName(event('x', null), names)).toBe('Chloé')
  })
})

describe('les notifications', () => {
  it('hors session : aussitôt ; en session : à la fin seulement', () => {
    expect(decisionNotificationType('decision.proposed', {})).toBe(
      'decision_proposed'
    )
    expect(
      decisionNotificationType('decision.proposed', { session: true })
    ).toBeNull()
    expect(decisionNotificationType('decision.session_finished', {})).toBe(
      'decision_proposed'
    )
    expect(decisionNotificationType('decision.disagreed', {})).toBe(
      'decision_resolved'
    )
    expect(
      decisionNotificationType('decision.disagreed', { session: true })
    ).toBeNull()
    expect(decisionNotificationType('decision.session_answered', {})).toBe(
      'decision_resolved'
    )
    expect(
      decisionNotificationType('decision.withdrawn', { notified: true })
    ).toBe('decision_resolved')
    expect(decisionNotificationType('decision.withdrawn', {})).toBeNull()
    expect(
      decisionNotificationType('listing.status_changed', {
        decision: journal(),
      })
    ).toBe('decision_resolved')
    expect(
      decisionNotificationType('draft.accepted', {
        decision: journal({ session: true }),
      })
    ).toBeNull()
    expect(
      decisionNotificationType('decision.kept', {
        decision: journal({ resolution: 'undone' }),
      })
    ).toBeNull()
    // Un changement de statut ordinaire suit sa règle habituelle.
    expect(
      decisionNotificationType('listing.status_changed', { status: 'visited' })
    ).toBeUndefined()
    expect(decisionNotificationType('autre', {})).toBeUndefined()
  })

  it('une annonce créée par une décision et un critère au calme ne notifient pas', () => {
    expect(createdByDecision({ viaDecision: true })).toBe(true)
    expect(createdByDecision({})).toBe(false)
    expect(
      notificationTypeOf(event('listing.created', { viaDecision: true }))
    ).toBeNull()
    expect(notificationTypeOf(event('listing.created', {}))).toBe(
      'listing_created'
    )
    expect(
      notificationTypeOf(
        event('criteria.matched', { cause: 'listing', quiet: true })
      )
    ).toBeNull()
    expect(
      notificationTypeOf(event('criteria.matched', { cause: 'listing' }))
    ).toBe('criteria_matched')
    // Le statut d'une décision a sa propre notification, pas `status_changed`.
    expect(
      notificationTypeOf(
        event('listing.status_changed', { decision: journal() })
      )
    ).toBe('decision_resolved')
    expect(
      notificationTypeOf(event('listing.status_changed', { status: 'visited' }))
    ).toBe('status_changed')
  })

  it('« Richard a trié 3 annonces : 2 à garder, 1 à écarter, à toi de confirmer »', () => {
    const [note] = notificationsForActivity(
      event(
        'decision.session_finished',
        { keep: 2, discard: 1 },
        RICHARD,
        null,
        null
      ),
      context
    )
    expect(note).toMatchObject({
      recipientId: CHLOE,
      type: 'decision_proposed',
      title: 'Richard a trié 3 annonces',
      body: '2 à garder, 1 à écarter : à toi de confirmer.',
      url: CONFIRM_URL,
    })
    expect(
      decisionNotificationText({
        action: 'decision.session_finished',
        before: null,
        after: { keep: 1, discard: 0 },
        actorName: 'Richard',
        listingId: null,
        listingTitle: null,
        recipientId: CHLOE,
      }).title
    ).toBe('Richard a trié 1 annonce')
  })

  it('« Chloé a confirmé ton tri : 2 annonces changent d’étape, 1 reste à trancher »', () => {
    const after = {
      perAuthor: [{ authorId: RICHARD, changed: 2, toSettle: 1, waiting: 0 }],
    }
    const notes = notificationsForActivity(
      event('decision.session_answered', after, CHLOE, null, null),
      context
    )
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      recipientId: RICHARD,
      type: 'decision_resolved',
      title: 'Chloé a confirmé ton tri',
      body: '2 annonces changent d’étape, 1 reste à trancher.',
      url: SETTLE_URL,
    })
    expect(
      decisionNotificationText({
        action: 'decision.session_answered',
        before: null,
        after: {
          perAuthor: [
            { authorId: RICHARD, changed: 0, toSettle: 1, waiting: 0 },
          ],
        },
        actorName: 'Chloé',
        listingId: null,
        listingTitle: null,
        recipientId: RICHARD,
      }).title
    ).toBe('Chloé a répondu à ton tri')
    expect(
      decisionNotificationText({
        action: 'decision.session_answered',
        before: null,
        after: {
          perAuthor: [
            { authorId: RICHARD, changed: 2, toSettle: 0, waiting: 0 },
          ],
        },
        actorName: 'Chloé',
        listingId: null,
        listingTitle: null,
        recipientId: RICHARD,
      }).url
    ).toBe('/annonces')
    expect(
      decisionNotificationText({
        action: 'decision.session_answered',
        before: null,
        after: {},
        actorName: 'Chloé',
        listingId: null,
        listingTitle: null,
        recipientId: RICHARD,
      }).body
    ).toBe('rien ne change.')
    expect(
      decisionRecipients(
        'decision.session_answered',
        { perAuthor: 'x' },
        CHLOE,
        [RICHARD, CHLOE]
      )
    ).toEqual([])
  })

  it('hors session, chaque moment a son texte', () => {
    const text = (
      action: string,
      after: unknown,
      before: unknown = null,
      listingId: string | null = LISTING,
      listingTitle: string | null = '[Exemple] T3'
    ) =>
      decisionNotificationText({
        action,
        before,
        after,
        actorName: 'Chloé',
        listingId,
        listingTitle,
        recipientId: RICHARD,
      })
    expect(
      text('decision.proposed', {
        choiceLabel: 'À visiter',
        reason: 'Prix correct',
      })
    ).toEqual({
      title: 'Chloé propose À visiter : [Exemple] T3',
      body: '« Prix correct » À toi de confirmer.',
      url: `/annonces/${LISTING}`,
    })
    expect(text('decision.proposed', {}).body).toBe('À toi de confirmer.')
    expect(
      text(
        'decision.proposed',
        { title: '[Exemple] Brouillon' },
        null,
        null,
        null
      )
    ).toMatchObject({
      title: 'Chloé propose  : [Exemple] Brouillon',
      url: DRAFTS_STAGE_URL,
    })
    expect(text('decision.proposed', {}, null, null, null).title).toContain(
      'une annonce'
    )
    expect(text('decision.disagreed', {})).toEqual({
      title: 'Chloé n’est pas d’accord : [Exemple] T3',
      body: 'Les choix diffèrent : à trancher ensemble.',
      url: SETTLE_URL,
    })
    expect(text('decision.withdrawn', { choiceLabel: 'À visiter' }).title).toBe(
      'Chloé a retiré sa proposition : [Exemple] T3'
    )
    expect(text('decision.withdrawn', {}).body).toBe('«  » n’est plus proposé.')
    expect(text('decision.kept', {}).body).toBe('On la garde où elle est.')
    expect(
      text(
        'listing.status_changed',
        { status: 'to_visit', decision: journal() },
        { status: 'to_study' }
      )
    ).toEqual({
      title: 'Chloé a confirmé : [Exemple] T3',
      body: 'Chloé a confirmé : À étudier vers À visiter, proposé par Richard.',
      url: `/annonces/${LISTING}`,
    })
    expect(
      text(
        'listing.status_changed',
        {
          status: 'to_visit',
          decision: journal({
            resolution: 'without_waiting',
            waitedForNames: ['Richard'],
          }),
        },
        { status: 'to_study' }
      ).title
    ).toBe('Chloé a décidé sans attendre : [Exemple] T3')
    expect(
      text(
        'draft.accepted',
        { decision: journal({ resolution: 'settled' }) },
        null,
        LISTING
      ).title
    ).toBe('Chloé a tranché : [Exemple] T3')
  })

  it('on ne se notifie pas soi-même ; le lien des brouillons est celui de l’étape', () => {
    const notes = notificationsForActivity(
      event('decision.proposed', { choiceLabel: 'À visiter' }, RICHARD),
      context
    )
    expect(notes.map(n => n.recipientId)).toEqual([CHLOE])
    const noActor = notificationsForActivity(
      event('decision.proposed', { choiceLabel: 'À visiter' }, null),
      context
    )
    expect(noActor[0]?.title).toContain('Un membre')
    expect(DRAFTS_INBOX_URL).toBe('/annonces?etape=a-valider')
    expect(decisionJournalOf('x')).toBeNull()
    expect(decisionJournalOf({ decision: 3 })).toBeNull()
  })
})
