/**
 * Lot 17 : questions aux agences. Tâches posables et phrase de chaque
 * question, questions ouvertes et regroupement, choix des questions d'un
 * brouillon, destinataire, canal, signature, message poli (jamais de
 * coordonnée de membre), transitions, jours ouvrés et fériés, relance due,
 * réponse appliquée ou proposée et tâches cochées, valeurs proposées puis
 * appliquées, état lisible d'une tâche, journal, notifications, « ce qui a
 * changé ». Données fictives.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOLLOW_UP_BUSINESS_DAYS,
  DEFAULT_TASKS,
  TASK_FIELD_BY_LABEL,
  taskFieldForLabel,
} from '@apart/contracts'
import type { AgencyRequestStatus } from '@apart/contracts'
import {
  AGENCY_REQUEST_TRANSITIONS,
  activeRequestOf,
  addBusinessDays,
  agencyAnswerSummary,
  applyProposed,
  businessDaysBetween,
  canTransition,
  computeWhatsNew,
  defaultAgencyMessage,
  defaultSignature,
  describeActivity,
  describeAgencyActivity,
  easterSunday,
  followUpDueOn,
  formatAnswerValue,
  formatParisDay,
  formatShortParisDay,
  frenchPublicHolidays,
  groupOpenQuestions,
  isAgencyAction,
  isAskableTask,
  isBusinessDay,
  isFollowUpDue,
  notificationTypeOf,
  notificationsForActivity,
  openQuestions,
  parisDay,
  planAgencyAnswer,
  preferredAgencyChannel,
  questionText,
  recipientDisplayName,
  recipientWord,
  resolveDraftQuestions,
  resolveSignature,
  sanitizeAnswerExcerpt,
  taskRequestState,
  transitionProblem,
  whatsNewKindOf,
} from '../src/index.js'
import type {
  AnswerableListing,
  QuestionTask,
  RequestLike,
  WhatsNewEvent,
} from '../src/index.js'

/** Espaces fines insécables de fr-FR → espaces simples, pour comparer. */
const n = (value: string | null | undefined) =>
  value?.replace(/[\u202f\u00a0]/g, ' ') ?? value

const CHARGES = DEFAULT_TASKS[0] as string
const TAX = DEFAULT_TASKS[1] as string
const PV = DEFAULT_TASKS[2] as string
const DTG = DEFAULT_TASKS[3] as string

const task = (
  id: string,
  label: string,
  over: Partial<QuestionTask> = {}
): QuestionTask => ({
  id,
  label,
  field: taskFieldForLabel(label),
  done: false,
  ...over,
})

const TASKS: QuestionTask[] = [
  task('t-charges', CHARGES),
  task('t-tax', TAX),
  task('t-pv', PV),
  task('t-dtg', DTG),
  task('t-works', "Évaluer l'ampleur réelle des travaux"),
  task('t-dpe', 'Demander le DPE (classe, consommation, date du diagnostic)'),
  task('t-done', 'Demander le nombre de lots', { done: true }),
]

const request = (
  id: string,
  status: AgencyRequestStatus,
  taskIds: string[],
  over: Partial<RequestLike> = {}
): RequestLike => ({
  id,
  status,
  taskIds,
  createdAt: '2026-11-02T09:00:00.000Z',
  sentAt:
    status === 'draft' || status === 'approved'
      ? null
      : '2026-11-02T10:00:00.000Z',
  answeredAt: null,
  ...over,
})

describe('tâches liées à un champ et questions', () => {
  it('relie la checklist et les champs manquants à leur champ, libellé exact seulement', () => {
    expect(TASK_FIELD_BY_LABEL[CHARGES]).toBe('annualCharges')
    expect(taskFieldForLabel(TAX)).toBe('propertyTax')
    expect(taskFieldForLabel(PV)).toBe('proceedings')
    expect(taskFieldForLabel("Demander l'adresse exacte du bien")).toBe(
      'addressRaw'
    )
    expect(taskFieldForLabel('Demander la surface loi Carrez')).toBe('surface')
    expect(taskFieldForLabel(DTG)).toBeNull()
    expect(
      taskFieldForLabel(
        'Fixer le loyer visé (phase 2) à partir du marché locatif'
      )
    ).toBeNull()
    expect(
      taskFieldForLabel('demander le montant de la taxe foncière')
    ).toBeNull()
  })

  it('une tâche se pose si elle a un champ ou commence par « Demander »', () => {
    expect(isAskableTask(task('a', CHARGES))).toBe(true)
    expect(isAskableTask(task('b', DTG))).toBe(true)
    expect(isAskableTask(task('c', 'Vérifier la desserte (tram, bus)'))).toBe(
      false
    )
    expect(
      isAskableTask({ label: 'Appeler pour le parking', field: 'addressRaw' })
    ).toBe(true)
  })

  it('écrit chaque question en français dans le message', () => {
    expect(questionText(task('a', CHARGES))).toBe(
      'le montant des charges de copropriété annuelles (budget prévisionnel)'
    )
    expect(questionText(task('b', DTG))).toMatch(
      /^le diagnostic technique global/
    )
    expect(questionText(task('c', 'Demander si la cave est privative.'))).toBe(
      'si la cave est privative'
    )
    expect(questionText(task('d', 'La date de disponibilité ?'))).toBe(
      'la date de disponibilité'
    )
    expect(questionText(task('e', 'DPE à jour'))).toBe('DPE à jour')
  })
})

describe('questions ouvertes', () => {
  it('donne l’état de chaque question posable : à poser, à valider, validée, demandée', () => {
    const requests = [
      request('r-draft', 'draft', ['t-charges'], {
        createdAt: '2026-11-04T09:00:00.000Z',
      }),
      request('r-ok', 'approved', ['t-tax']),
      request('r-sent', 'sent', ['t-pv']),
    ]
    const open = openQuestions(TASKS, requests)
    expect(open.map(q => [q.taskId, q.state])).toEqual([
      ['t-charges', 'draft'],
      ['t-tax', 'approved'],
      ['t-pv', 'requested'],
      ['t-dtg', 'open'],
      ['t-dpe', 'open'],
    ])
    expect(open[2]?.requestedAt).toBe('2026-11-02T10:00:00.000Z')
    expect(open[3]?.requestId).toBeNull()
  })

  it('une demande annulée ne compte pas ; sans réponse, la question est rouverte ; une réponse partielle la garde demandée', () => {
    const older = request('r-old', 'sent', ['t-charges'], {
      createdAt: '2026-10-20T09:00:00.000Z',
    })
    const cancelled = request('r-cancel', 'cancelled', ['t-charges'], {
      createdAt: '2026-11-03T09:00:00.000Z',
    })
    expect(
      activeRequestOf(TASKS[0] as QuestionTask, [older, cancelled])?.id
    ).toBe('r-old')
    const closed = request('r-closed', 'no_answer', ['t-tax'])
    expect(activeRequestOf(TASKS[1] as QuestionTask, [closed])).toBeNull()
    const partial = request('r-partial', 'answered', ['t-pv'])
    expect(activeRequestOf(TASKS[2] as QuestionTask, [partial])?.id).toBe(
      'r-partial'
    )
    expect(activeRequestOf({ id: 't-done', done: true }, [partial])).toBeNull()
    // Une tâche demandée avant, sans demande connue : sa date reste.
    const [q] = openQuestions(
      [task('x', TAX, { requestedAt: '2026-10-01T08:00:00.000Z' })],
      []
    )
    expect(q?.requestedAt).toBe('2026-10-01T08:00:00.000Z')
  })

  it('regroupe les questions à poser par annonce et destinataire', () => {
    const groups = groupOpenQuestions([
      {
        listingId: 'l1',
        title: 'T2 fictif',
        recipientName: 'Agence [Exemple]',
        channel: 'email',
        tasks: TASKS,
        requests: [request('r', 'sent', ['t-charges'])],
      },
      {
        listingId: 'l1',
        title: 'T2 fictif',
        recipientName: 'agence [exemple]',
        channel: 'email',
        tasks: [task('t-extra', 'Demander la date de disponibilité')],
        requests: [],
      },
      {
        listingId: 'l2',
        title: 'Rien à demander',
        recipientName: null,
        channel: 'portal_message',
        tasks: [task('t-x', 'Vérifier la desserte')],
        requests: [],
      },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.questions.map(q => q.taskId)).toEqual([
      't-tax',
      't-pv',
      't-dtg',
      't-dpe',
      't-extra',
    ])
  })
})

describe('choix des questions d’un brouillon', () => {
  it('par défaut, toutes les questions encore à poser', () => {
    const result = resolveDraftQuestions({
      tasks: TASKS,
      requests: [request('r', 'draft', ['t-charges'])],
    })
    expect(result).toEqual({
      ok: true,
      taskIds: ['t-tax', 't-pv', 't-dtg', 't-dpe'],
    })
    expect(
      resolveDraftQuestions({
        tasks: [task('v', 'Vérifier la desserte')],
        requests: [],
      })
    ).toEqual({
      ok: false,
      problem: 'Aucune question ouverte à poser pour cette annonce.',
    })
  })

  it('refuse une tâche inconnue, faite, non posable ou déjà en cours', () => {
    const base = { tasks: TASKS, requests: [request('r', 'sent', ['t-tax'])] }
    expect(resolveDraftQuestions({ ...base, taskIds: ['nope'] })).toMatchObject(
      {
        ok: false,
        problem: expect.stringContaining('inconnue'),
      }
    )
    expect(
      resolveDraftQuestions({ ...base, taskIds: ['t-done'] })
    ).toMatchObject({
      problem: expect.stringContaining('déjà faite'),
    })
    expect(
      resolveDraftQuestions({ ...base, taskIds: ['t-works'] })
    ).toMatchObject({
      problem: expect.stringContaining('ne se pose pas'),
    })
    expect(
      resolveDraftQuestions({ ...base, taskIds: ['t-tax'] })
    ).toMatchObject({
      problem: expect.stringContaining('relancez'),
    })
    expect(
      resolveDraftQuestions({
        ...base,
        taskIds: ['t-charges', 't-charges', 't-dpe'],
      })
    ).toEqual({ ok: true, taskIds: ['t-charges', 't-dpe'] })
    expect(resolveDraftQuestions({ ...base, taskIds: [] })).toEqual({
      ok: false,
      problem: 'Aucune question à poser dans ce message.',
    })
  })

  it('une relance reprend les questions encore ouvertes de la demande relancée', () => {
    const sent = request('r-sent', 'sent', ['t-charges', 't-done'])
    expect(
      resolveDraftQuestions({
        tasks: TASKS,
        requests: [sent],
        followUpOf: sent,
      })
    ).toEqual({ ok: true, taskIds: ['t-charges'] })
    expect(
      resolveDraftQuestions({
        tasks: TASKS,
        requests: [sent],
        followUpOf: sent,
        taskIds: ['t-charges', 't-dpe'],
      })
    ).toEqual({ ok: true, taskIds: ['t-charges', 't-dpe'] })
    const draft = request('r-draft', 'draft', ['t-tax'])
    expect(
      resolveDraftQuestions({
        tasks: TASKS,
        requests: [draft],
        followUpOf: draft,
      })
    ).toMatchObject({ ok: false, problem: expect.stringContaining('envoyée') })
    const allDone = request('r-done', 'sent', ['t-done'])
    expect(
      resolveDraftQuestions({
        tasks: TASKS,
        requests: [allDone],
        followUpOf: allDone,
      })
    ).toMatchObject({ ok: false })
    const pending = request('r-follow', 'draft', ['t-charges'], {
      followUpOfId: 'r-sent',
    })
    expect(
      resolveDraftQuestions({
        tasks: TASKS,
        requests: [sent, pending],
        followUpOf: sent,
      })
    ).toMatchObject({
      ok: false,
      problem: expect.stringContaining('attend déjà'),
    })
  })
})

describe('destinataire, canal, signature', () => {
  it('nom affiché seulement', () => {
    expect(
      recipientDisplayName({
        agencyName: 'Agence [Exemple]',
        contactName: ' Mme [Exemple] ',
      })
    ).toBe('Mme [Exemple], Agence [Exemple]')
    expect(
      recipientDisplayName({ agencyName: '  ', contactName: null })
    ).toBeNull()
    expect(recipientDisplayName(null)).toBeNull()
  })

  it('canal : préféré, puis e-mail, messagerie, téléphone, sinon selon le lien', () => {
    expect(
      preferredAgencyChannel(
        { preferredChannel: 'phone', email: 'a@b.invalid' },
        true
      )
    ).toBe('phone')
    expect(
      preferredAgencyChannel({ email: 'contact@agence.exemple.invalid' }, true)
    ).toBe('email')
    expect(
      preferredAgencyChannel(
        { portalMessageUrl: 'https://portail.exemple.invalid/m/1' },
        false
      )
    ).toBe('portal_message')
    expect(preferredAgencyChannel({ phone: '05 00 00 00 00' }, false)).toBe(
      'phone'
    )
    expect(preferredAgencyChannel(null, true)).toBe('portal_message')
    expect(preferredAgencyChannel({}, false)).toBe('other')
  })

  it('« à l’agence » ou « au vendeur »', () => {
    expect(recipientWord('Agence [Exemple]')).toBe('à l’agence')
    expect(recipientWord('Particulier')).toBe('au vendeur')
    expect(recipientWord('M. [Exemple], propriétaire')).toBe('au vendeur')
    expect(recipientWord(null)).toBe('à l’agence')
  })

  it('signature : celle de l’espace, sinon les prénoms des membres', () => {
    expect(defaultSignature([])).toBe('')
    expect(defaultSignature(['Richard'])).toBe('Richard')
    expect(defaultSignature(['Richard', ' Chloé '])).toBe('Richard et Chloé')
    expect(defaultSignature(['Richard', 'Chloé', 'Léa'])).toBe(
      'Richard, Chloé et Léa'
    )
    expect(resolveSignature(null, ['Richard', 'Chloé'])).toBe(
      'Richard et Chloé'
    )
    expect(resolveSignature('  ', ['Richard', 'Chloé'])).toBe(
      'Richard et Chloé'
    )
    expect(resolveSignature('R. et C. [Exemple]', ['Richard'])).toBe(
      'R. et C. [Exemple]'
    )
  })
})

describe('message par défaut', () => {
  const listing = {
    title: 'T2 fictif Bègles',
    url: 'https://annonces.exemple.invalid/t2-begles',
    externalId: 'EX-123',
    commune: 'Bègles',
    price: 189_000,
  }

  it('formule polie, annonce, questions, signature ; aucune coordonnée de membre', () => {
    const { subject, body } = defaultAgencyMessage({
      listing,
      questions: [
        'le montant de la taxe foncière',
        'le nombre de lots de la copropriété',
      ],
      signature: 'Richard et Chloé',
    })
    expect(subject).toBe(
      'Votre annonce « T2 fictif Bègles » (réf. EX-123) : quelques questions'
    )
    expect(n(body)).toBe(
      [
        'Bonjour Madame, Monsieur,',
        '',
        'Nous sommes intéressés par votre annonce « T2 fictif Bègles » (à Bègles, affichée à 189 000 €), référence EX-123 :',
        'https://annonces.exemple.invalid/t2-begles',
        '',
        "Avant d'aller plus loin, pourriez-vous nous indiquer :",
        '- le montant de la taxe foncière ;',
        '- le nombre de lots de la copropriété.',
        '',
        "Merci d'avance pour votre retour.",
        '',
        'Bien cordialement,',
        'Richard et Chloé',
      ].join('\n')
    )
    expect(body).not.toMatch(/@|\+33|0\d \d\d/)
  })

  it('nom de l’interlocuteur, sans référence ni lien ni prix, sans signature', () => {
    const { subject, body } = defaultAgencyMessage({
      listing: {
        title: 'Maison fictive',
        url: null,
        externalId: null,
        commune: null,
        price: 0,
      },
      contactName: 'Mme [Exemple]',
      questions: ['la surface loi Carrez'],
      signature: '',
    })
    expect(subject).toBe(
      'Votre annonce « Maison fictive » : quelques questions'
    )
    expect(body).toContain('Bonjour Mme [Exemple],')
    expect(body).toContain(
      'Nous sommes intéressés par votre annonce « Maison fictive ».'
    )
    expect(body.endsWith('Bien cordialement.')).toBe(true)
  })

  it('une relance rappelle la date du premier message', () => {
    const { subject, body } = defaultAgencyMessage({
      listing,
      questions: ['le montant de la taxe foncière'],
      signature: 'Richard et Chloé',
      followUpOf: { sentAt: '2026-10-28T09:00:00.000Z' },
    })
    expect(subject).toBe(
      'Relance : votre annonce « T2 fictif Bègles » (réf. EX-123)'
    )
    expect(body).toContain(
      'au sujet de notre message du 28 octobre 2026 concernant votre annonce'
    )
    expect(body).toContain(
      'Pourriez-vous nous indiquer, quand vous le pourrez :'
    )
    const undated = defaultAgencyMessage({
      listing: { ...listing, url: null, externalId: null },
      questions: ['x'],
      signature: 'R',
      followUpOf: { sentAt: null },
    })
    expect(undated.subject).toBe('Relance : votre annonce « T2 fictif Bègles »')
    expect(undated.body).toContain(
      'au sujet de notre message concernant votre annonce'
    )
  })

  it('tronque un objet trop long', () => {
    const { subject } = defaultAgencyMessage({
      listing: { ...listing, title: 'x'.repeat(400) },
      questions: ['q'],
      signature: '',
    })
    expect(subject).toHaveLength(200)
    expect(subject.endsWith('…')).toBe(true)
  })
})

describe('transitions', () => {
  it('suit draft → approved → sent → answered | no_answer, annulation avant l’envoi', () => {
    expect(canTransition('draft', 'approved')).toBe(true)
    expect(canTransition('approved', 'sent')).toBe(true)
    expect(canTransition('approved', 'draft')).toBe(true)
    expect(canTransition('sent', 'answered')).toBe(true)
    expect(canTransition('sent', 'no_answer')).toBe(true)
    expect(canTransition('no_answer', 'answered')).toBe(true)
    expect(canTransition('answered', 'answered')).toBe(true)
    expect(canTransition('draft', 'sent')).toBe(false)
    expect(AGENCY_REQUEST_TRANSITIONS.cancelled).toEqual([])
    expect(transitionProblem('draft', 'approved')).toBeNull()
  })

  it('dit pourquoi un passage est refusé', () => {
    expect(transitionProblem('sent', 'approved')).toContain('« Envoyée »')
    expect(transitionProblem('draft', 'sent')).toContain("n'est pas validé")
    expect(transitionProblem('cancelled', 'sent')).toContain('« Annulée »')
    expect(transitionProblem('cancelled', 'answered')).toContain('annulée')
    expect(transitionProblem('approved', 'answered')).toContain(
      "enregistrez d'abord l'envoi"
    )
    expect(transitionProblem('draft', 'no_answer')).toContain(
      'Seule une demande envoyée'
    )
    expect(transitionProblem('cancelled', 'cancelled')).toContain(
      'déjà annulée'
    )
    expect(transitionProblem('sent', 'cancelled')).toContain("ne s'annule pas")
    expect(transitionProblem('sent', 'draft')).toContain('ne se modifie plus')
  })
})

describe('jours ouvrés et relances', () => {
  it('jour de Paris et dates lisibles', () => {
    expect(parisDay('2026-11-05T23:30:00.000Z')).toBe('2026-11-06')
    expect(formatParisDay('2026-11-05T10:00:00.000Z')).toBe('5 novembre 2026')
    expect(formatShortParisDay('2026-11-05T10:00:00.000Z')).toBe('5 nov.')
  })

  it('Pâques et jours fériés de métropole', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    const days = frenchPublicHolidays(2026)
    expect([...days].sort()).toEqual([
      '2026-01-01',
      '2026-04-06',
      '2026-05-01',
      '2026-05-08',
      '2026-05-14',
      '2026-05-25',
      '2026-07-14',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
    ])
    expect(isBusinessDay('2026-11-11')).toBe(false)
    expect(isBusinessDay('2026-11-07')).toBe(false)
    expect(isBusinessDay('2026-11-08')).toBe(false)
    expect(isBusinessDay('2026-11-09')).toBe(true)
    expect(() => isBusinessDay('11/09/2026')).toThrow(RangeError)
  })

  it('compte les jours ouvrés, week-end et 11 novembre exclus', () => {
    // Jeudi 5 novembre 2026 + 5 jours ouvrés : 6, 9, 10, 12, 13 → vendredi 13.
    expect(addBusinessDays('2026-11-05', 5)).toBe('2026-11-13')
    expect(addBusinessDays('2026-11-05', 0)).toBe('2026-11-05')
    expect(businessDaysBetween('2026-11-05', '2026-11-13')).toBe(5)
    expect(businessDaysBetween('2026-11-13', '2026-11-05')).toBe(0)
  })

  it('relance due cinq jours ouvrés après l’envoi, ou après une réponse partielle', () => {
    expect(DEFAULT_FOLLOW_UP_BUSINESS_DAYS).toBe(5)
    const sent = {
      status: 'sent' as const,
      sentAt: '2026-11-05T09:00:00.000Z',
      answeredAt: null,
      pendingQuestions: 2,
      followedUp: false,
    }
    expect(followUpDueOn(sent)).toBe('2026-11-13')
    expect(isFollowUpDue(sent, new Date('2026-11-12T20:00:00.000Z'))).toBe(
      false
    )
    expect(isFollowUpDue(sent, new Date('2026-11-13T07:00:00.000Z'))).toBe(true)
    expect(isFollowUpDue(sent, new Date('2026-11-09T07:00:00.000Z'), 2)).toBe(
      true
    )
    const partial = {
      ...sent,
      status: 'answered' as const,
      answeredAt: '2026-11-09T09:00:00.000Z',
      pendingQuestions: 1,
    }
    expect(followUpDueOn(partial)).toBe('2026-11-17')
    expect(followUpDueOn({ ...partial, pendingQuestions: 0 })).toBeNull()
    expect(followUpDueOn({ ...sent, followedUp: true })).toBeNull()
    expect(followUpDueOn({ ...sent, status: 'draft' })).toBeNull()
    expect(followUpDueOn({ ...sent, sentAt: null })).toBeNull()
    expect(isFollowUpDue({ ...sent, status: 'no_answer' })).toBe(false)
  })
})

const LISTING: AnswerableListing = {
  addressRaw: null,
  surface: 42,
  annualCharges: 1_200,
  propertyTax: 900,
  dpeClass: 'D',
  dpeConsumption: null,
  gesClass: null,
  dpeDate: '2023-03-01',
  floor: 2,
  elevator: null,
  constructionYear: null,
  lotsCount: null,
  votedWorks: 'Aucun',
  proceedings: null,
  heatingType: null,
  fieldSources: {
    surface: { source: 'user' },
    annualCharges: { source: 'ai', confidence: 0.7 },
    propertyTax: { source: 'user' },
    dpeClass: { source: 'open_data' },
    floor: { source: 'listing' },
    votedWorks: { source: 'ai' },
  },
}

describe('réponse de l’annonceur', () => {
  it('applique, garde ou propose chaque valeur, et coche les tâches répondues', () => {
    const plan = planAgencyAnswer({
      listing: LISTING,
      values: {
        annualCharges: 1_680,
        propertyTax: 950,
        surface: 42.3,
        dpeClass: 'C',
        dpeConsumption: 180,
        dpeDate: '2023-03-01',
        floor: 3,
        elevator: true,
        lotsCount: 24,
        votedWorks: '  aucun ',
        addressRaw: '12 rue [Exemple], Bègles',
      },
      tasks: TASKS,
      answeredTaskIds: ['t-dtg'],
    })
    const by = Object.fromEntries(plan.changes.map(c => [c.key, c]))
    expect(by.annualCharges?.disposition).toBe('applied')
    expect(n(by.annualCharges?.text)).toBe(
      'Charges annuelles : 1 200 € → 1 680 €'
    )
    expect(by.propertyTax?.disposition).toBe('proposed')
    expect(n(by.propertyTax?.text)).toBe(
      'Taxe foncière : 950 € proposé, la fiche garde 900 € (saisi à la main)'
    )
    expect(by.surface?.disposition).toBe('unchanged')
    expect(by.dpeClass?.disposition).toBe('proposed')
    expect(by.dpeConsumption?.disposition).toBe('applied')
    expect(by.dpeDate?.disposition).toBe('unchanged')
    expect(by.floor?.disposition).toBe('applied')
    expect(by.floor?.text).toBe('Étage : 2e → 3e')
    expect(by.elevator?.text).toBe('Ascenseur : oui')
    expect(by.votedWorks?.disposition).toBe('unchanged')
    expect(by.votedWorks?.text).toBe('Travaux votés : aucun, confirmé')
    expect(by.addressRaw?.disposition).toBe('applied')
    expect(plan.patch).toEqual({
      annualCharges: 1_680,
      dpeConsumption: 180,
      floor: 3,
      elevator: true,
      lotsCount: 24,
      addressRaw: '12 rue [Exemple], Bègles',
    })
    // Charges, taxe (proposée : la question a sa réponse), DPE, DTG.
    expect(plan.completedTaskIds).toEqual([
      't-charges',
      't-tax',
      't-dtg',
      't-dpe',
    ])
    expect(plan.answeredFields).toContain('floor')
    expect(n(plan.summary)).toContain('4 tâches cochées')
  })

  it('une valeur sans provenance est gardée ; une valeur de l’annonceur se met à jour', () => {
    const plan = planAgencyAnswer({
      listing: {
        ...LISTING,
        lotsCount: 10,
        heatingType: 'Gaz',
        elevator: true,
        fieldSources: { heatingType: { source: 'agency' } },
      },
      values: {
        elevator: true,
        lotsCount: 12,
        heatingType: 'Électrique individuel',
      },
      tasks: [],
    })
    expect(plan.changes.map(c => c.disposition)).toEqual([
      'unchanged',
      'proposed',
      'applied',
    ])
    plan.changes.shift()
    expect(plan.changes[0]?.previousSource).toBeNull()
    expect(plan.completedTaskIds).toEqual([])
  })

  it('résumé d’une réponse sans valeur', () => {
    expect(agencyAnswerSummary([], 0)).toBe(
      'Réponse enregistrée, sans valeur pour la fiche'
    )
    expect(agencyAnswerSummary([], 1)).toBe('1 tâche cochée')
  })

  it('met en forme chaque valeur', () => {
    expect(n(formatAnswerValue('propertyTax', 950))).toBe('950 €')
    expect(formatAnswerValue('surface', 42.25)).toBe('42,25 m²')
    expect(n(formatAnswerValue('dpeConsumption', 180))).toBe('180 kWh/m²/an')
    expect(formatAnswerValue('dpeDate', '2023-03-01')).toBe('1 mars 2023')
    expect(formatAnswerValue('floor', 0)).toBe('rez-de-chaussée')
    expect(formatAnswerValue('floor', 1)).toBe('1er')
    expect(formatAnswerValue('constructionYear', 1965)).toBe('1965')
    expect(formatAnswerValue('lotsCount', 24)).toBe('24')
    expect(formatAnswerValue('elevator', false)).toBe('non')
    expect(formatAnswerValue('votedWorks', null)).toBe('—')
    expect(formatAnswerValue('proceedings', 'x'.repeat(200))).toHaveLength(120)
    expect(formatAnswerValue('dpeClass', 'C')).toBe('C')
  })

  it('masque téléphones et e-mails dans l’extrait, 1 000 caractères au plus', () => {
    expect(
      sanitizeAnswerExcerpt(
        'Charges 140 €/mois. Rappelez-moi au 06 12 34 56 78 ou contact@agence.exemple.invalid'
      )
    ).toBe(
      'Charges 140 €/mois. Rappelez-moi au [téléphone masqué] ou [e-mail masqué]'
    )
    expect(sanitizeAnswerExcerpt('x'.repeat(2000))).toHaveLength(1000)
    expect(sanitizeAnswerExcerpt(null)).toBeNull()
  })

  it('applique une valeur proposée à la demande du membre', () => {
    const plan = planAgencyAnswer({
      listing: LISTING,
      values: { propertyTax: 950, annualCharges: 1_680 },
      tasks: [],
    })
    const now = new Date('2026-11-07T10:00:00.000Z')
    const result = applyProposed(
      plan.changes,
      ['propertyTax', 'annualCharges'],
      now
    )
    expect(result.patch).toEqual({ propertyTax: 950 })
    expect(result.applied).toHaveLength(1)
    const tax = result.changes.find(c => c.key === 'propertyTax')
    expect(tax?.disposition).toBe('applied')
    expect(tax?.appliedAt).toBe(now.toISOString())
    expect(n(tax?.text)).toBe(
      'Taxe foncière : 900 € → 950 € (proposé, appliqué)'
    )
    expect(applyProposed(plan.changes, ['surface']).patch).toEqual({})
    expect(applyProposed(plan.changes, ['propertyTax']).applied).toHaveLength(1)
  })
})

describe('état lisible d’une tâche', () => {
  const requests = [
    request('r-draft', 'draft', ['t-charges'], {
      createdAt: '2026-11-04T09:00:00.000Z',
    }),
    request('r-ok', 'approved', ['t-tax']),
    request('r-sent', 'sent', ['t-pv'], {
      sentAt: '2026-11-05T09:00:00.000Z',
      recipientName: 'Agence [Exemple]',
    }),
    request('r-pap', 'sent', ['t-dpe'], {
      sentAt: null,
      recipientName: 'Particulier',
    }),
    request('r-none', 'no_answer', ['t-dtg']),
  ]
  it('à valider, validée, demandée le …, réponse du …, sans réponse', () => {
    expect(taskRequestState(TASKS[0] as QuestionTask, requests).label).toBe(
      'Message à valider'
    )
    expect(taskRequestState(TASKS[1] as QuestionTask, requests).kind).toBe(
      'approved'
    )
    expect(taskRequestState(TASKS[2] as QuestionTask, requests).label).toBe(
      'Demandée le 5 nov. à l’agence'
    )
    expect(taskRequestState(TASKS[5] as QuestionTask, requests).label).toBe(
      'Demandée au vendeur'
    )
    expect(taskRequestState(TASKS[3] as QuestionTask, requests).label).toBe(
      'Sans réponse (demandée le 2 nov.)'
    )
    expect(
      taskRequestState(
        task('t-x', CHARGES, {
          done: true,
          answeredAt: '2026-11-07T15:00:00.000Z',
          requestId: 'r-sent',
        }),
        requests
      )
    ).toEqual({
      kind: 'answered',
      label: 'Réponse du 7 nov.',
      requestId: 'r-sent',
    })
    expect(
      taskRequestState(task('t-y', CHARGES, { done: true }), requests).kind
    ).toBe('none')
    expect(taskRequestState(task('t-z', TAX), []).label).toBeNull()
    expect(
      taskRequestState(task('t-w', TAX), [
        request('r-closed', 'no_answer', ['t-w'], { sentAt: null }),
      ]).label
    ).toBe('Sans réponse')
  })
})

describe('journal, notifications et « ce qui a changé »', () => {
  const members = new Map([
    ['m-richard', { displayName: 'Richard' }],
    ['m-chloe', { displayName: 'Chloé' }],
  ])
  const record = (action: string, before: unknown, after: unknown) =>
    describeActivity(
      { action, channel: 'mcp', actorMemberId: 'm-richard', before, after },
      members
    )

  it('dit chaque action des échanges, sans coordonnée du contact', () => {
    expect(isAgencyAction('contact.updated')).toBe(true)
    expect(isAgencyAction('listing.updated')).toBe(false)
    const contact = record(
      'contact.updated',
      { state: 'none' },
      { fields: ['email', 'phone', 'other'] }
    )
    expect(contact.kind).toBe('agency')
    expect(contact.summary).toBe(
      "a ajouté le contact de l'annonceur (e-mail, téléphone, other)"
    )
    expect(
      record('contact.updated', { state: 'some' }, { fields: [] }).summary
    ).toBe("a mis à jour le contact de l'annonceur")
    expect(record('contact.updated', null, { fields: [3] }).summary).toBe(
      "a mis à jour le contact de l'annonceur"
    )
    expect(record('contact.updated', null, null).summary).toBe(
      "a mis à jour le contact de l'annonceur"
    )
    expect(record('agency_request.sent', null, null).summary).toBe(
      "a envoyé le message à l'annonceur ; 0 question demandée"
    )
    expect(record('contact.cleared', null, null).summary).toBe(
      "a effacé le contact de l'annonceur"
    )
    expect(
      record('agency_request.drafted', null, {
        taskIds: ['a', 'b'],
        channel: 'email',
      }).summary
    ).toBe(
      "a préparé un message pour l'annonceur, à valider (2 questions, e-mail)"
    )
    expect(
      record('agency_request.drafted', null, {
        taskIds: ['a'],
        followUpOf: 'r',
      }).summary
    ).toBe("a préparé une relance pour l'annonceur, à valider (1 question)")
    expect(
      record('agency_request.updated', { status: 'approved' }, {}).summary
    ).toContain('repasse « à valider »')
    expect(
      record('agency_request.updated', { status: 'draft' }, {}).summary
    ).toBe("a modifié le message à l'annonceur")
    expect(
      record('agency_request.approved', null, { approvedVia: 'app' }).summary
    ).toBe("a validé l'envoi du message à l'annonceur (dans l'application)")
    expect(
      record('agency_request.approved', null, { approvedVia: 'autre' }).summary
    ).toContain('(autre)')
    expect(record('agency_request.approved', null, {}).summary).toBe(
      "a validé l'envoi du message à l'annonceur"
    )
    expect(record('agency_request.cancelled', null, null).summary).toBe(
      "a annulé le message à l'annonceur"
    )
    expect(
      record('agency_request.sent', null, {
        channel: 'portal_message',
        approvedVia: 'chat',
        taskIds: ['a', 'b'],
      }).summary
    ).toBe(
      "a envoyé le message à l'annonceur (messagerie du portail), validé dans la conversation ; 2 questions demandées"
    )
    expect(
      record('agency_request.sent', null, { channel: 'fax', taskIds: 1 })
        .summary
    ).toBe("a envoyé le message à l'annonceur (fax) ; 1 question demandée")
    const answered = record(
      'agency_request.answered',
      { facts: { annualCharges: 1200 } },
      {
        summary: 'Charges annuelles : 1 680 €',
        proposed: ['propertyTax'],
        facts: { annualCharges: 1680 },
      }
    )
    expect(answered.summary).toBe(
      "a enregistré la réponse de l'annonceur : Charges annuelles : 1 680 € (1 valeur proposée, à confirmer)"
    )
    expect(answered.changes).toEqual([
      expect.objectContaining({
        field: 'annualCharges',
        before: '1 200 €'.replace(' ', ' '),
        after: '1 680 €'.replace(' ', ' '),
      }),
    ])
    expect(
      record('agency_request.answered', null, { proposed: ['a', 'b'] }).summary
    ).toBe(
      "a enregistré la réponse de l'annonceur (2 valeurs proposées, à confirmer)"
    )
    expect(
      record('agency_request.no_answer', null, { followUpId: 'r2' }).summary
    ).toContain('relancé')
    expect(record('agency_request.no_answer', null, null).summary).toBe(
      "a noté que l'annonceur n'a pas répondu"
    )
    expect(
      record(
        'agency_request.value_applied',
        { facts: { propertyTax: 900 } },
        { facts: { propertyTax: 950 } }
      ).changes
    ).toHaveLength(1)
    expect(
      record('agency_request.signature_changed', null, { signature: 'R et C' })
        .summary
    ).toContain('a changé la signature')
    expect(
      record('agency_request.signature_changed', null, { signature: null })
        .summary
    ).toContain('par défaut')
    expect(
      record('agency_request.unknown', null, { status: 'sent' }).summary
    ).toBe("échange avec l'annonceur (envoyée)")
    expect(record('agency_request.unknown', null, null).summary).toBe(
      "échange avec l'annonceur"
    )
    expect(
      describeAgencyActivity('task.created', null, null, () => [])
    ).toBeNull()
  })

  const event = {
    action: 'agency_request.answered',
    channel: 'mcp' as const,
    actorMemberId: 'm-richard',
    listingId: 'l1',
    before: null,
    after: { summary: 'Charges annuelles : 1 680 €' },
  }

  it('prévient l’autre membre d’une réponse, vers l’onglet À faire (lot 19)', () => {
    expect(notificationTypeOf(event)).toBe('agency_answer')
    const drafts = notificationsForActivity(event, {
      members: [
        { id: 'm-richard', displayName: 'Richard' },
        { id: 'm-chloe', displayName: 'Chloé' },
      ],
      listingTitle: 'T2 fictif',
    })
    expect(drafts).toEqual([
      {
        recipientId: 'm-chloe',
        type: 'agency_answer',
        title: "Réponse de l'agence : T2 fictif",
        body: 'Charges annuelles : 1 680 € (enregistrée par Claude (MCP, pour Richard)).',
        url: '/annonces/l1?onglet=a-faire',
        listingId: 'l1',
      },
    ])
    const bare = notificationsForActivity(
      { ...event, after: null, listingId: null },
      { members: [{ id: 'm-chloe', displayName: 'Chloé' }], listingTitle: null }
    )
    expect(bare[0]?.body).toBe(
      'Réponse enregistrée (enregistrée par Claude (MCP, pour Un membre)).'
    )
    expect(bare[0]?.url).toBeNull()
  })

  it('compte une réponse dans « ce qui a changé »', () => {
    const whatsNew: WhatsNewEvent = {
      ...event,
      id: 'e1',
      createdAt: '2026-11-07T10:00:00.000Z',
    }
    expect(whatsNewKindOf(whatsNew, 'm-chloe')).toBe('agency_answer')
    expect(
      whatsNewKindOf({ ...whatsNew, channel: 'web' }, 'm-richard')
    ).toBeNull()
    const report = computeWhatsNew({
      memberId: 'm-chloe',
      since: '2026-11-01T00:00:00.000Z',
      sinceSource: 'previous_visit',
      now: '2026-11-08T00:00:00.000Z',
      events: [whatsNew, { ...whatsNew, id: 'e2', after: null }],
      listings: new Map([['l1', { title: 'T2 fictif', seenAt: null }]]),
      members: new Map([
        [
          'm-richard',
          { id: 'm-richard', handle: 'richard', displayName: 'Richard' },
        ],
      ]),
    })
    expect(report.counts.agency_answer).toBe(2)
    expect(report.items.map(i => i.summary)).toEqual(
      expect.arrayContaining([
        "Réponse de l'annonceur enregistrée par Claude (MCP, pour Richard) : Charges annuelles : 1 680 €",
        "Réponse de l'annonceur enregistrée par Claude (MCP, pour Richard)",
      ])
    )
  })
})
