import {
  ListingInputSchema,
  ListingLocationInputSchema,
  ListingSourceSchema,
  RenovationLevelSchema,
  listingSourceFromUrl,
} from '@apart/contracts'
import type {
  AiField,
  AiListingExtraction,
  FieldProvenanceMap,
  FieldSource,
  ListingInput,
  Provenance,
} from '@apart/contracts'
import type { z } from 'zod'

/**
 * De la sortie du modèle à une annonce du contrat : chaque valeur passe par
 * le schéma de son champ ; une valeur invalide est écartée avec une remarque
 * plutôt que de faire échouer l'extraction. Pure, sans E/S ; `now` injectable.
 */

export interface ExtractionContext {
  /** URL donnée par l'appelant : elle prime sur ce que le modèle a lu. */
  url: string | null
  /** Le texte collé, conservé tel quel pour vérification. */
  sourceText: string | null
  now?: Date
}

export interface MappedExtraction {
  listing: ListingInput
  warnings: string[]
}

/** Les champs copiés tels quels, du nom côté modèle vers le nom du contrat. */
const SCALAR_FIELDS: ReadonlyArray<
  [keyof AiListingExtraction, keyof ListingInput, string]
> = [
  ['title', 'title', 'Titre'],
  ['externalId', 'externalId', 'Référence'],
  ['agencyName', 'sourceLabel', 'Agence'],
  ['price', 'price', 'Prix'],
  ['feesAmount', 'feesAmount', 'Honoraires'],
  ['feesPercent', 'feesPercent', 'Honoraires (%)'],
  ['feesPayer', 'feesPayer', 'Honoraires à charge de'],
  ['surface', 'surface', 'Surface'],
  ['surfaceTotal', 'surfaceTotal', 'Surface totale'],
  ['rooms', 'rooms', 'Pièces'],
  ['bedrooms', 'bedrooms', 'Chambres'],
  ['floor', 'floor', 'Étage'],
  ['floorsTotal', 'floorsTotal', "Nombre d'étages"],
  ['floorLabel', 'floorLabel', 'Étage (libellé)'],
  ['elevator', 'elevator', 'Ascenseur'],
  ['constructionYear', 'constructionYear', 'Année de construction'],
  ['constructionPeriod', 'constructionPeriod', 'Époque de construction'],
  ['dpeClass', 'dpeClass', 'DPE'],
  ['dpeConsumption', 'dpeConsumption', 'Consommation DPE'],
  ['gesClass', 'gesClass', 'GES'],
  ['dpeDate', 'dpeDate', 'Date du DPE'],
  ['heatingType', 'heatingType', 'Chauffage'],
  ['heatingCollective', 'heatingCollective', 'Chauffage collectif'],
  ['outdoor', 'outdoor', 'Extérieur'],
  ['parking', 'parking', 'Stationnement'],
  ['cellar', 'cellar', 'Cave'],
  ['orientation', 'orientation', 'Orientation'],
  ['condition', 'condition', 'État'],
  ['annualCharges', 'annualCharges', 'Charges annuelles'],
  [
    'nonRecoverableChargesMonthly',
    'nonRecoverableChargesMonthly',
    'Charges non récupérables',
  ],
  ['lotsCount', 'lotsCount', 'Nombre de lots'],
  ['proceedings', 'proceedings', 'Procédures'],
  ['votedWorks', 'votedWorks', 'Travaux votés'],
  ['syndic', 'syndic', 'Syndic'],
  ['propertyTax', 'propertyTax', 'Taxe foncière'],
  ['description', 'description', 'Description'],
]

const LOCATION_FIELDS: ReadonlyArray<
  [keyof AiListingExtraction, 'addressRaw' | 'commune' | 'district', string]
> = [
  ['addressRaw', 'addressRaw', 'Adresse'],
  ['commune', 'commune', 'Commune'],
  ['district', 'district', 'Quartier'],
]

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

function provenanceOf(
  field: AiField<unknown>,
  recordedAt: string,
  source: FieldSource = 'ai'
): Provenance {
  const evidence = field.evidence?.trim()
  return {
    source,
    confidence: Math.round(clamp01(field.confidence) * 100) / 100,
    ...(evidence ? { evidence: evidence.slice(0, 2000) } : {}),
    recordedAt,
  }
}

function describeIssue(error: z.ZodError): string {
  return error.issues.map(issue => issue.message).join(', ')
}

/** Une date AAAA-MM-JJ du modèle vers un instant ISO 8601 ; null si la forme est autre. */
function dateToIso(value: string | null): string | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const iso = `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

export function extractionToListing(
  raw: AiListingExtraction,
  context: ExtractionContext
): MappedExtraction {
  const recordedAt = (context.now ?? new Date()).toISOString()
  const warnings: string[] = [...raw.remarks.map(r => r.trim()).filter(Boolean)]
  const fieldSources: FieldProvenanceMap = {}
  const assembled: Record<string, unknown> = {}
  const location: Record<string, unknown> = {}

  const accept = (
    key: string,
    label: string,
    field: AiField<unknown>,
    schema: z.ZodType,
    target: Record<string, unknown>,
    value: unknown = field.value
  ): boolean => {
    if (value === null || value === undefined) return false
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      warnings.push(
        `${label} : valeur « ${String(value)} » écartée (${describeIssue(parsed.error)}).`
      )
      return false
    }
    target[key] = parsed.data
    fieldSources[key] = provenanceOf(field, recordedAt)
    return true
  }

  for (const [aiKey, listingKey, label] of SCALAR_FIELDS) {
    const field = raw[aiKey] as AiField<unknown>
    let value = field.value
    if (listingKey === 'feesPercent' && typeof value === 'number') {
      // Le modèle devait rendre une fraction ; un 5 lu comme « 5 % » se corrige.
      if (value > 0.3 && value <= 30) value = value / 100
    }
    if (typeof value === 'string') {
      value = value.trim()
      if (value === '') continue
    }
    accept(
      listingKey,
      label,
      field,
      ListingInputSchema.shape[listingKey],
      assembled,
      value
    )
  }

  for (const [aiKey, locationKey, label] of LOCATION_FIELDS) {
    const field = raw[aiKey] as AiField<string>
    const value = field.value?.trim()
    if (!value) continue
    accept(
      locationKey,
      label,
      field,
      ListingLocationInputSchema.shape[locationKey],
      location,
      value
    )
  }
  const postalCode = raw.postalCode.value?.trim()
  if (
    postalCode &&
    /^\d{5}$/.test(postalCode) &&
    typeof location.addressRaw === 'string' &&
    !location.addressRaw.includes(postalCode)
  ) {
    const commune = typeof location.commune === 'string' ? location.commune : ''
    location.addressRaw = `${location.addressRaw}, ${postalCode}${commune ? ` ${commune}` : ''}`
  }

  // Titre : obligatoire ; à défaut, un titre de repli signalé comme tel.
  if (typeof assembled.title !== 'string') {
    const parts = [
      typeof assembled.rooms === 'number'
        ? `T${assembled.rooms}`
        : 'Appartement',
      typeof location.commune === 'string' ? location.commune : null,
    ].filter(Boolean)
    assembled.title = parts.join(' ')
    fieldSources.title = { source: 'ai', confidence: 0.2, recordedAt }
    warnings.push('Titre non trouvé : titre de repli, à compléter.')
  }
  // Prix : obligatoire ; 0 force la relecture.
  if (typeof assembled.price !== 'number') {
    assembled.price = 0
    warnings.push("Prix non trouvé dans l'annonce : à saisir.")
  }

  // Honoraires : « inclus » suffit à savoir qui paie.
  if (assembled.feesPayer === undefined && raw.feesIncluded.value !== null) {
    assembled.feesPayer = raw.feesIncluded.value ? 'buyer' : 'seller'
    fieldSources.feesPayer = provenanceOf(raw.feesIncluded, recordedAt)
  }

  // URL et portail : l'URL donnée par l'appelant prime sur celle lue.
  let url: string | null = null
  if (context.url) {
    url = context.url
    fieldSources.url = { source: 'listing', confidence: 1, recordedAt }
  } else if (raw.url.value) {
    const parsed = ListingInputSchema.shape.url.safeParse(raw.url.value.trim())
    if (parsed.success && parsed.data) {
      url = parsed.data
      fieldSources.url = provenanceOf(raw.url, recordedAt)
    } else {
      warnings.push(
        `Lien : valeur « ${raw.url.value} » écartée (URL invalide).`
      )
    }
  }
  assembled.url = url
  const fromUrl = listingSourceFromUrl(url)
  if (url && fromUrl !== 'autre') {
    assembled.source = fromUrl
    fieldSources.source = {
      ...fieldSources.url,
      source: fieldSources.url?.source ?? 'ai',
    }
  } else {
    accept('source', 'Portail', raw.portal, ListingSourceSchema, assembled)
  }

  // Travaux évoqués : une section active sans postes chiffrés.
  if (raw.worksMentioned.value === true) {
    const level = RenovationLevelSchema.safeParse(raw.worksLevel.value)
    assembled.renovation = {
      active: true,
      level: level.success ? level.data : null,
      durationMonths: null,
      items: [],
      notes: raw.worksNotes.value?.trim() || null,
    }
    fieldSources.renovation = provenanceOf(
      {
        value: true,
        confidence: raw.worksMentioned.confidence,
        evidence: raw.worksNotes.evidence ?? raw.worksMentioned.evidence,
      },
      recordedAt
    )
  }

  const publishedAt = dateToIso(raw.publishedAt.value)
  if (publishedAt) {
    assembled.publishedAt = publishedAt
    fieldSources.publishedAt = provenanceOf(raw.publishedAt, recordedAt)
  }
  const sourceUpdatedAt = dateToIso(raw.sourceUpdatedAt.value)
  if (sourceUpdatedAt) {
    assembled.sourceUpdatedAt = sourceUpdatedAt
    fieldSources.sourceUpdatedAt = provenanceOf(raw.sourceUpdatedAt, recordedAt)
  }

  const listing = ListingInputSchema.parse({
    ...assembled,
    location,
    fieldSources,
    sourceText: context.sourceText ? context.sourceText.slice(0, 50_000) : null,
  })
  return { listing, warnings }
}
