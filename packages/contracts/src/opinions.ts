import { z } from 'zod'

/**
 * Lot 20 : nos avis, critère par critère (ADR 0030). Chaque membre note
 * plusieurs critères d'une annonce sur une échelle en mots (1 rédhibitoire à
 * 5 excellent ; « — » = pas d'avis, jamais 0 en base), avec un mot facultatif
 * par critère ; la note globale (`rating`) et la phrase (`text`) restent à
 * part. Les critères sont ceux de l'espace : huit par défaut (clés stables),
 * renommables, masquables, réordonnables, et des critères ajoutés, dix au plus
 * en tout. Avis à l'aveugle par défaut : tant qu'un membre n'a rien noté sur
 * une annonce, les notes des autres lui sont masquées, côté serveur. La
 * confrontation (moyennes, écarts, désaccords, note commune, phrase de bilan)
 * est calculée par `domain`. Le verdict ne change pas.
 */

/** Les notes possibles d'un critère. */
export const OPINION_SCORES = [1, 2, 3, 4, 5] as const
export type OpinionScoreLevel = (typeof OPINION_SCORES)[number]

export const OpinionScoreSchema = z
  .number()
  .int()
  .min(1)
  .max(5)
  .describe(
    'Note du critère, de 1 à 5 : 1 rédhibitoire, 2 bof, 3 correct, 4 bien, 5 excellent'
  )

/** Les mots de l'échelle. */
export const OPINION_SCORE_LABELS: Record<OpinionScoreLevel, string> = {
  1: 'rédhibitoire',
  2: 'bof',
  3: 'correct',
  4: 'bien',
  5: 'excellent',
}

/** « — » : pas encore d'avis sur ce critère. */
export const OPINION_NO_SCORE_LABEL = 'pas d’avis'

/** Dix critères au plus par espace, masqués compris. */
export const OPINION_CRITERIA_MAX = 10
/** Longueur maximale du mot facultatif d'un critère. */
export const OPINION_WORD_MAX = 80
/** Longueur maximale du libellé d'un critère. */
export const OPINION_CRITERION_LABEL_MAX = 40
/** Longueur maximale de l'aide d'un critère. */
export const OPINION_CRITERION_HINT_MAX = 120
/** Longueur maximale du contexte d'une tâche (tâche proposée depuis les avis). */
export const TASK_DETAILS_MAX = 600

export const OpinionCriterionKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Clé de critère invalide')
  .describe(
    'Clé stable du critère dans l’espace (« luminosity », « quiet », « custom_cuisine »)'
  )
export type OpinionCriterionKey = z.infer<typeof OpinionCriterionKeySchema>

export const OpinionCriterionOriginSchema = z
  .enum(['default', 'custom'])
  .describe('Critère par défaut, ou ajouté par l’espace')
export type OpinionCriterionOrigin = z.infer<
  typeof OpinionCriterionOriginSchema
>

export interface DefaultOpinionCriterion {
  key: string
  label: string
  hint: string
  /** Le critère dans une phrase (« le calme »), tant que son libellé n'a pas changé. */
  inSentence: string
}

/** Les huit critères par défaut, dans l'ordre des fiches. */
export const DEFAULT_OPINION_CRITERIA: readonly DefaultOpinionCriterion[] = [
  {
    key: 'luminosity',
    label: 'Luminosité',
    hint: 'exposition, lumière dans les pièces de vie',
    inSentence: 'la luminosité',
  },
  {
    key: 'layout',
    label: 'Agencement',
    hint: 'plan, circulation, rangements',
    inSentence: 'l’agencement',
  },
  {
    key: 'condition',
    label: 'État',
    hint: 'impression générale, finitions',
    inSentence: 'l’état',
  },
  {
    key: 'quiet',
    label: 'Calme',
    hint: 'rue, voisins, isolation ressentie',
    inSentence: 'le calme',
  },
  {
    key: 'outdoor',
    label: 'Extérieur et vue',
    hint: 'balcon, vis-à-vis',
    inSentence: 'l’extérieur et la vue',
  },
  {
    key: 'building',
    label: 'Immeuble',
    hint: 'entrée, parties communes',
    inSentence: 'l’immeuble',
  },
  {
    key: 'street',
    label: 'Rue et ambiance',
    hint: 'le ressenti en arrivant',
    inSentence: 'la rue',
  },
  {
    key: 'feel',
    label: 'On s’y voit',
    hint: 'le coup de cœur',
    inSentence: '« on s’y voit »',
  },
]

/** Un critère des avis de l'espace. */
export const OpinionCriterionSchema = z.object({
  key: OpinionCriterionKeySchema,
  label: z
    .string()
    .trim()
    .min(1)
    .max(OPINION_CRITERION_LABEL_MAX)
    .describe('Libellé affiché (« Calme »)'),
  hint: z
    .string()
    .max(OPINION_CRITERION_HINT_MAX)
    .describe('Aide sous le libellé (« rue, voisins, isolation ressentie »)'),
  position: z.number().int().min(0).describe('Ordre dans les fiches'),
  hidden: z
    .boolean()
    .describe(
      'Masqué : retiré des fiches et des calculs, ses notes restent en base'
    ),
  origin: OpinionCriterionOriginSchema,
})
export type OpinionCriterion = z.infer<typeof OpinionCriterionSchema>

/** Un critère dans la page de réglage : combien de notes, s'il peut être retiré. */
export const OpinionCriterionSettingSchema = OpinionCriterionSchema.extend({
  scoreCount: z
    .number()
    .int()
    .min(0)
    .describe('Notes données sur ce critère dans l’espace (masqué compris)'),
  removable: z
    .boolean()
    .describe(
      'Vrai pour un critère ajouté jamais noté : il peut être retiré (un critère noté se masque)'
    ),
})
export type OpinionCriterionSetting = z.infer<
  typeof OpinionCriterionSettingSchema
>

/** `GET /workspace/opinion-criteria` : critères et règles des avis de l'espace. */
export const OpinionSettingsSchema = z.object({
  blind: z
    .boolean()
    .describe(
      'Avis à l’aveugle : l’avis des autres est masqué tant qu’on n’a pas noté'
    ),
  criteria: z
    .array(OpinionCriterionSettingSchema)
    .describe('Tous les critères, masqués compris, dans l’ordre des fiches'),
  max: z.number().int().describe('Nombre maximal de critères (10)'),
  disagreementGap: z
    .number()
    .int()
    .describe('Écart à partir duquel deux notes sont un désaccord (2 points)'),
  canEdit: z
    .boolean()
    .describe('Le membre connecté est propriétaire : il règle les critères'),
})
export type OpinionSettings = z.infer<typeof OpinionSettingsSchema>

/** Avis à l'aveugle, activé ou non (propriétaire). */
export const OpinionSettingsUpdateSchema = z
  .object({
    blind: z
      .boolean()
      .describe('Avis à l’aveugle : masquer l’avis des autres avant de noter'),
  })
  .strict()
export type OpinionSettingsUpdate = z.infer<typeof OpinionSettingsUpdateSchema>

const criterionLabel = z
  .string()
  .trim()
  .min(1, 'Donne un nom au critère')
  .max(OPINION_CRITERION_LABEL_MAX)
  .describe('Libellé du critère')
const criterionHint = z
  .string()
  .trim()
  .max(OPINION_CRITERION_HINT_MAX)
  .describe('Aide sous le libellé')

/** Un critère ajouté par l'espace (propriétaire) ; sa clé est générée. */
export const OpinionCriterionCreateSchema = z
  .object({ label: criterionLabel, hint: criterionHint.default('') })
  .strict()
export type OpinionCriterionCreate = z.infer<
  typeof OpinionCriterionCreateSchema
>

/** Renommer, changer l'aide, masquer ou afficher un critère (propriétaire). */
export const OpinionCriterionUpdateSchema = z
  .object({
    label: criterionLabel.optional(),
    hint: criterionHint.optional(),
    hidden: z.boolean().optional().describe('Vrai = masquer, faux = afficher'),
  })
  .strict()
  .refine(
    value =>
      value.label !== undefined ||
      value.hint !== undefined ||
      value.hidden !== undefined,
    { message: 'Au moins un champ à modifier (label, hint, hidden)' }
  )
export type OpinionCriterionUpdate = z.infer<
  typeof OpinionCriterionUpdateSchema
>

/** Le nouvel ordre des critères : toutes les clés, chacune une fois (propriétaire). */
export const OpinionCriteriaOrderSchema = z
  .object({
    keys: z
      .array(OpinionCriterionKeySchema)
      .min(1)
      .max(OPINION_CRITERIA_MAX)
      .describe(
        'Toutes les clés des critères de l’espace, dans le nouvel ordre'
      ),
  })
  .strict()
export type OpinionCriteriaOrder = z.infer<typeof OpinionCriteriaOrderSchema>

/** Le mot facultatif d'un critère ; vide = pas de mot. */
export const OpinionWordSchema = z
  .string()
  .trim()
  .max(OPINION_WORD_MAX)
  .transform(value => (value === '' ? null : value))
  .nullable()
  .describe(
    `Un mot sur le critère (${OPINION_WORD_MAX} caractères au plus) ; null ou vide = pas de mot`
  )

/**
 * La note d'un critère à écrire : `score` null = « — » (pas d'avis), `word`
 * absent = mot inchangé, null ou vide = mot effacé.
 */
export const OpinionScoreEntryInputSchema = z
  .object({
    score: OpinionScoreSchema.nullable().describe(
      'Note de 1 à 5 ; null = pas d’avis (la note est effacée)'
    ),
    word: OpinionWordSchema.optional(),
  })
  .strict()
export type OpinionScoreEntryInput = z.infer<
  typeof OpinionScoreEntryInputSchema
>

/**
 * Les notes à écrire, par clé de critère : seules les clés données changent ;
 * une entrée null efface la note et le mot du critère.
 */
export const OpinionScoresInputSchema = z
  .record(OpinionCriterionKeySchema, OpinionScoreEntryInputSchema.nullable())
  .refine(value => Object.keys(value).length <= OPINION_CRITERIA_MAX, {
    message: `${OPINION_CRITERIA_MAX} critères au plus`,
  })
  .describe(
    'Notes par clé de critère : { "quiet": { "score": 2, "word": "bus devant la chambre" } } ; null efface ; les clés absentes ne changent pas'
  )
export type OpinionScoresInput = z.infer<typeof OpinionScoresInputSchema>

/** Une note enregistrée. */
export const OpinionScoreValueSchema = z.object({
  key: OpinionCriterionKeySchema,
  score: OpinionScoreSchema.nullable().describe('Note de 1 à 5 ; null = —'),
  word: z.string().max(OPINION_WORD_MAX).nullable(),
  updatedAt: z.string().datetime(),
})
export type OpinionScoreValue = z.infer<typeof OpinionScoreValueSchema>

/** La visite faite avant l'avis, à laquelle le membre participait (« après visite »). */
export const OpinionVisitRefSchema = z.object({
  visitId: z.string().uuid(),
  visitedAt: z.string().datetime(),
})
export type OpinionVisitRef = z.infer<typeof OpinionVisitRefSchema>

/** L'état d'un membre dans la confrontation des avis. */
export const OpinionMemberStateSchema = z
  .enum(['rated', 'masked', 'missing'])
  .describe(
    'rated : avis visible, au moins un critère ou une note globale ; masked : avis masqué (à l’aveugle) ; missing : pas encore noté'
  )
export type OpinionMemberState = z.infer<typeof OpinionMemberStateSchema>

export const OpinionMemberSummarySchema = z.object({
  memberId: z.string().uuid(),
  displayName: z.string(),
  state: OpinionMemberStateSchema,
  rating: z
    .number()
    .int()
    .min(0)
    .max(5)
    .nullable()
    .describe('Note globale sur 5 (0 = aucune) ; null si l’avis est masqué'),
  average: z
    .number()
    .nullable()
    .describe(
      'Moyenne des critères notés, à titre indicatif ; null si aucun ou masqué'
    ),
  ratedCount: z.number().int().min(0).describe('Critères notés (affichés)'),
  criteriaCount: z.number().int().min(0).describe('Critères affichés'),
  afterVisit: OpinionVisitRefSchema.nullable().describe(
    'La visite faite, avec ce membre, avant son avis ; null sinon'
  ),
  seenBefore: z
    .array(z.string())
    .describe(
      'Prénoms des membres dont l’avis était visible avant qu’il note (« Voir quand même »)'
    ),
  updatedAt: z.string().datetime().nullable(),
})
export type OpinionMemberSummary = z.infer<typeof OpinionMemberSummarySchema>

export const OpinionAgreementSchema = z
  .enum(['agree', 'close', 'disagree'])
  .describe('Écart nul (d’accord), d’un point, ou de deux points et plus')
export type OpinionAgreement = z.infer<typeof OpinionAgreementSchema>

/** Un critère, et les notes visibles de chacun. */
export const OpinionRowSchema = z.object({
  key: OpinionCriterionKeySchema,
  label: z.string(),
  hint: z.string(),
  scores: z.array(
    z.object({
      memberId: z.string().uuid(),
      score: OpinionScoreSchema.nullable(),
      word: z.string().nullable(),
    })
  ),
  gap: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Écart maximal entre les notes ; null avec moins de deux notes'),
  mean: z.number().nullable().describe('Moyenne des notes données'),
  common: z.boolean().describe('Noté par tous les membres, tous avis visibles'),
  agreement: OpinionAgreementSchema.nullable(),
})
export type OpinionRow = z.infer<typeof OpinionRowSchema>

export const OpinionSummaryStatusSchema = z
  .enum(['empty', 'pending', 'none', 'ready'])
  .describe(
    'empty : personne n’a noté ; pending : un avis manque ou est masqué (« en attente ») ; none : aucun critère noté par tous ; ready : note commune calculée'
  )
export type OpinionSummaryStatus = z.infer<typeof OpinionSummaryStatusSchema>

/**
 * La confrontation des avis telle que le membre connecté peut la voir :
 * jamais une note masquée. Calculée par `domain` (`confrontOpinions`).
 */
export const OpinionSummarySchema = z.object({
  blind: z.boolean().describe('L’espace masque les avis avant de noter'),
  masked: z.boolean().describe('Des avis sont masqués pour le membre connecté'),
  revealed: z
    .boolean()
    .describe('Le membre connecté a choisi « Voir quand même » sur l’annonce'),
  viewerRated: z.boolean().describe('Le membre connecté a noté'),
  members: z.array(OpinionMemberSummarySchema),
  rows: z.array(OpinionRowSchema),
  agreements: z
    .number()
    .int()
    .min(0)
    .describe('Critères où les notes s’écartent d’un point au plus'),
  disagreementKeys: z
    .array(OpinionCriterionKeySchema)
    .describe(
      'Critères en désaccord (écart de 2 points ou plus), du plus gros au plus petit'
    ),
  maxGap: z.number().int().min(0).nullable(),
  commonScore: z
    .number()
    .nullable()
    .describe(
      'Note commune : moyenne, sur les critères notés par tous, des moyennes par critère ; null en attente'
    ),
  status: OpinionSummaryStatusSchema,
  pendingMemberIds: z
    .array(z.string().uuid())
    .describe('Membres dont l’avis manque ou est masqué'),
  sentence: z.string().describe('Le bilan en une phrase (rien d’inventé)'),
})
export type OpinionSummary = z.infer<typeof OpinionSummarySchema>

/** `POST /listings/:id/opinions/reveal` : « Voir quand même », enregistré. */
export const OpinionRevealSchema = z.object({
  listingId: z.string().uuid(),
  revealedAt: z.string().datetime(),
  memberIds: z
    .array(z.string().uuid())
    .describe('Les membres dont l’avis était visible à ce moment'),
})
export type OpinionReveal = z.infer<typeof OpinionRevealSchema>

/** Le filtre « Avis » de la liste. */
export const OpinionsFilterSchema = z
  .enum(['to_discuss', 'pending'])
  .describe(
    'Lot 20 : to_discuss = « À rediscuter » (au moins un désaccord) ; pending = « Avis en attente » (un avis manque ou est masqué)'
  )
export type OpinionsFilter = z.infer<typeof OpinionsFilterSchema>

export const OPINIONS_FILTER_LABELS: Record<OpinionsFilter, string> = {
  to_discuss: 'À rediscuter',
  pending: 'Avis en attente',
}
