import { LISTING_PORTAL_LABELS, SELLER_TYPE_LABELS } from '@apart/contracts'
import type {
  FieldSource,
  ListingCheckChange,
  ListingPortal,
  ObservedSellerType,
  Provenance,
  SellerType,
} from '@apart/contracts'

/**
 * Qui vend (lot 18, ADR 0028) : agence, mandataire, particulier ou inconnu
 * (par défaut, jamais deviné), le nom de l'agence ou du réseau, et la
 * référence de l'annonce, qui sert à retrouver la même annonce sur les autres
 * portails. Le nom d'une personne n'est jamais un champ de l'annonce : il
 * reste dans le contact de l'annonceur (onglet « À faire », lot 17). Pur.
 */

/** Ce que l'annonce sait de son vendeur. */
export interface SellerFacts {
  sellerType: SellerType
  sellerName: string | null
  sellerReference: string | null
}

/** Ce qu'une page a montré du vendeur. */
export interface SellerObservation {
  sellerType?: ObservedSellerType | undefined
  sellerName?: string | undefined
  reference?: string | undefined
}

/** Une référence plus courte n'identifie rien (« 12 ») : elle n'est pas comparée. */
export const REFERENCE_KEY_MIN_LENGTH = 3

const REFERENCE_PREFIXES: readonly RegExp[] = [
  /^r[ée]f(?:[ée]rence)?s?(?![\p{L}])(?:\s+(?:de\s+l['’]\s*)?annonce)?\s*[.:#°]*\s*/iu,
  /^mandat(?![\p{L}])(?:\s*(?:n[°º]|num[ée]ro))?\s*[.:#]*\s*/iu,
  /^(?:n[°º]|num[ée]ro(?![\p{L}]))\s*(?:de\s+)?(?:mandat|r[ée]f[ée]rence|l['’]\s*annonce|annonce)?\s*[.:#]*\s*/iu,
]

function flat(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * La référence telle qu'on la garde : espaces resserrés, sans le préfixe
 * (« Réf. », « Référence : », « Mandat n° », « N° de mandat »), sans
 * guillemets autour ; null si rien ne reste.
 */
export function cleanReference(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null
  let text = flat(value)
  for (let pass = 0; pass < 3; pass += 1) {
    const next = REFERENCE_PREFIXES.reduce(
      (current, prefix) => current.replace(prefix, ''),
      text
    ).trim()
    if (next === text) break
    text = next
  }
  text = text.replace(/^[«"'“]+\s*|\s*[»"'”]+$/gu, '').trim()
  return text || null
}

/**
 * La clé de comparaison d'une référence : préfixe retiré, accents ôtés,
 * majuscules, sans espaces, tirets, points, barres ni dièses
 * (« Réf. ex-2041 » et « EX 2041 » donnent « EX2041 ») ; null si elle fait
 * moins de trois caractères.
 */
export function referenceKey(value: string | null | undefined): string | null {
  const cleaned = cleanReference(value)
  if (!cleaned) return null
  const key = cleaned
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[\s\-–—._/#:'’"«»]+/g, '')
  return key.length >= REFERENCE_KEY_MIN_LENGTH ? key : null
}

/** Mots qui ne distinguent pas deux agences (« Agence X » et « X Immobilier » sont la même). */
const AGENCY_NOISE = new Set([
  'agence',
  'agences',
  'agency',
  'immobilier',
  'immobiliers',
  'immobiliere',
  'immobilieres',
  'immo',
  'groupe',
  'group',
  'cabinet',
  'transaction',
  'transactions',
  'conseil',
  'conseils',
  'sarl',
  'sas',
  'sasu',
  'eurl',
  'sa',
  'de',
  'du',
  'des',
  'd',
  'la',
  'le',
  'les',
  'l',
  'et',
  'the',
  'and',
])

/** Les mots distinctifs du nom d'une agence ou d'un réseau. */
function agencyTokens(name: string | null | undefined): string[] {
  if (!name) return []
  return [
    ...new Set(
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(word => word && !AGENCY_NOISE.has(word))
    ),
  ].sort()
}

/**
 * Le nom d'une agence réduit pour la comparer : minuscules, sans accents ni
 * ponctuation, sans les mots génériques (agence, immobilier, groupe…), mots
 * triés ; null s'il ne reste rien.
 */
export function agencyKey(name: string | null | undefined): string | null {
  const tokens = agencyTokens(name)
  return tokens.length ? tokens.join(' ') : null
}

/**
 * Deux noms désignent-ils la même agence ? Oui s'ils ont la même clé
 * (« Agence X » et « X Immobilier ») ou si les mots de l'un sont tous dans
 * l'autre, à deux mots près (« [Exemple] Immobilier des Chartrons » et
 * « Immobilier des Chartrons », « X » et « X Bordeaux Centre ») ; non si
 * l'un manque.
 */
export function sameAgency(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = agencyTokens(a)
  const right = agencyTokens(b)
  if (left.length === 0 || right.length === 0) return false
  const [small, large] =
    left.length <= right.length ? [left, right] : [right, left]
  const set = new Set(large)
  return small.every(word => set.has(word)) && large.length - small.length <= 2
}

/** Un nom d'agence tel qu'on le garde : espaces resserrés ; null s'il est vide. */
export function cleanSellerName(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null
  const text = flat(value)
  return text || null
}

/** Le vendeur tel qu'on l'enregistre, avec la clé de la référence. */
export interface NormalizedSeller extends SellerFacts {
  sellerReferenceKey: string | null
}

/**
 * Le vendeur à enregistrer : nom et référence nettoyés ; un particulier n'a
 * ni agence ni référence (elles sont effacées) ; la clé de la référence pour
 * la comparer.
 */
export function normalizeSeller(input: {
  sellerType: SellerType
  sellerName?: string | null | undefined
  sellerReference?: string | null | undefined
}): NormalizedSeller {
  if (input.sellerType === 'private') {
    return {
      sellerType: 'private',
      sellerName: null,
      sellerReference: null,
      sellerReferenceKey: null,
    }
  }
  const sellerReference = cleanReference(input.sellerReference)
  return {
    sellerType: input.sellerType,
    sellerName: cleanSellerName(input.sellerName),
    sellerReference,
    sellerReferenceKey: referenceKey(sellerReference),
  }
}

/** « Agence », « Réseau » : le libellé du nom selon le vendeur. */
export function sellerNameLabel(type: SellerType): string {
  if (type === 'mandatary') return 'Réseau'
  if (type === 'agency') return 'Agence'
  return 'Agence ou réseau'
}

/** La colonne « Vendeur » de la liste : « Agence », « Mandataire », « Particulier », « À relever ». */
export function sellerListLabel(type: SellerType): string {
  return type === 'unknown' ? 'À relever' : SELLER_TYPE_LABELS[type]
}

/** La pastille de l'en-tête : « Agence · [Exemple] Immobilier des Chartrons », « Particulier », « Vendeur inconnu ». */
export function sellerChipText(
  seller: Pick<SellerFacts, 'sellerType' | 'sellerName'>
): string {
  const name = seller.sellerName
  switch (seller.sellerType) {
    case 'agency':
    case 'mandatary':
      return name
        ? `${SELLER_TYPE_LABELS[seller.sellerType]} · ${name}`
        : SELLER_TYPE_LABELS[seller.sellerType]
    case 'private':
      return 'Particulier'
    default:
      return name ? `Vendeur à préciser · ${name}` : 'Vendeur inconnu'
  }
}

/** Le vendeur en une ligne (MCP) : « agence « X », réf. EX-2041 », « particulier », « vendeur inconnu ». */
export function sellerText(seller: SellerFacts): string {
  const head =
    seller.sellerType === 'unknown'
      ? 'vendeur inconnu'
      : SELLER_TYPE_LABELS[seller.sellerType].toLowerCase()
  const named = seller.sellerName ? `${head} « ${seller.sellerName} »` : head
  return seller.sellerReference
    ? `${named}, réf. ${seller.sellerReference}`
    : named
}

const SELLER_FIELD_LABELS = {
  sellerType: 'Vendeur',
  sellerName: 'Agence ou réseau',
  sellerReference: 'Référence de l’annonce',
} as const

function change(
  field: keyof typeof SELLER_FIELD_LABELS,
  before: string | null,
  after: string,
  disposition: ListingCheckChange['disposition'],
  text: string
): ListingCheckChange {
  return {
    field,
    label: SELLER_FIELD_LABELS[field],
    before,
    after,
    disposition,
    text,
  }
}

/**
 * Le vendeur lu sur une page, comparé à la fiche : chaque valeur inconnue de
 * la fiche est appliquée (fait lu sur le portail) ; une valeur qui contredit
 * la fiche est proposée, jamais appliquée. Un particulier lu sur une fiche
 * qui porte déjà une agence ou une référence est proposé. Pas de nom ni de
 * référence pour un particulier.
 */
export function sellerObservationDiff(
  stored: SellerFacts,
  observed: SellerObservation
): { changes: ListingCheckChange[]; patch: Partial<SellerFacts> } {
  const changes: ListingCheckChange[] = []
  const patch: Partial<SellerFacts> = {}
  const type = observed.sellerType
  if (type !== undefined && type !== stored.sellerType) {
    const label = SELLER_TYPE_LABELS[type]
    const contradicts =
      stored.sellerType !== 'unknown' ||
      (type === 'private' &&
        (stored.sellerName !== null || stored.sellerReference !== null))
    if (contradicts) {
      changes.push(
        change(
          'sellerType',
          stored.sellerType,
          type,
          'proposed',
          stored.sellerType === 'unknown'
            ? `Vendeur lu « ${label} », mais la fiche porte une agence ou une référence : à vérifier`
            : `Vendeur lu « ${label} », la fiche dit « ${SELLER_TYPE_LABELS[stored.sellerType]} » : à vérifier`
        )
      )
    } else {
      patch.sellerType = type
      changes.push(
        change(
          'sellerType',
          stored.sellerType,
          type,
          'applied',
          `Vendeur : ${label} (nouveau)`
        )
      )
    }
  }
  const effectiveType = patch.sellerType ?? stored.sellerType
  if (effectiveType === 'private' || type === 'private') {
    return { changes, patch }
  }
  const name = cleanSellerName(observed.sellerName)
  if (name !== null) {
    const nameLabel = sellerNameLabel(effectiveType)
    if (stored.sellerName === null) {
      patch.sellerName = name
      changes.push(
        change(
          'sellerName',
          null,
          name,
          'applied',
          `${nameLabel} : ${name} (nouveau)`
        )
      )
    } else if (!sameAgency(stored.sellerName, name)) {
      changes.push(
        change(
          'sellerName',
          stored.sellerName,
          name,
          'proposed',
          `${nameLabel} lu « ${name} », la fiche dit « ${stored.sellerName} » : à vérifier`
        )
      )
    }
  }
  const reference = cleanReference(observed.reference)
  if (reference !== null) {
    if (stored.sellerReference === null) {
      patch.sellerReference = reference
      changes.push(
        change(
          'sellerReference',
          null,
          reference,
          'applied',
          `Référence : ${reference} (nouvelle)`
        )
      )
    } else if (
      referenceKey(stored.sellerReference) !== referenceKey(reference)
    ) {
      changes.push(
        change(
          'sellerReference',
          stored.sellerReference,
          reference,
          'proposed',
          `Référence lue ${reference}, la fiche dit ${stored.sellerReference} : à vérifier`
        )
      )
    }
  }
  return { changes, patch }
}

/**
 * Ce qui, dans le vendeur lu sur une autre page, contredit la fiche : un
 * autre vendeur, une autre agence, une autre référence (connus des deux
 * côtés). Null si rien ne contredit : le lien peut être rattaché.
 */
export function sellerContradiction(
  stored: SellerFacts,
  observed: SellerObservation
): string | null {
  const problems: string[] = []
  if (
    observed.sellerType !== undefined &&
    stored.sellerType !== 'unknown' &&
    observed.sellerType !== stored.sellerType
  ) {
    problems.push(
      `le vendeur lu (${SELLER_TYPE_LABELS[observed.sellerType]}) n’est pas celui de la fiche (${SELLER_TYPE_LABELS[stored.sellerType]})`
    )
  }
  const name = cleanSellerName(observed.sellerName)
  if (name && stored.sellerName && !sameAgency(stored.sellerName, name)) {
    problems.push(
      `l’agence lue (« ${name} ») n’est pas celle de la fiche (« ${stored.sellerName} »)`
    )
  }
  const observedKey = referenceKey(observed.reference)
  const storedKey = referenceKey(stored.sellerReference)
  if (observedKey && storedKey && observedKey !== storedKey) {
    problems.push(
      `la référence lue (${cleanReference(observed.reference)}) n’est pas celle de la fiche (${stored.sellerReference})`
    )
  }
  return problems.length ? problems.join(' ; ') : null
}

/** « 3 nov. » (fuseau de Paris). */
export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'short',
  })
}

const PROVENANCE_WORDS: Record<FieldSource, string> = {
  listing: 'Lue sur la page',
  user: 'Saisie à la main',
  ai: 'Lue par l’IA',
  open_data: 'Données ouvertes',
  estimated: 'Estimée',
  agency: 'Donnée par l’annonceur',
}

/**
 * D'où vient la référence, en une phrase (« Lue sur SeLoger par Claude le
 * 3 nov., la même sur Leboncoin. ») : la provenance du champ, puis les autres
 * portails qui affichent la même référence.
 */
export function referenceProvenanceText(input: {
  reference: string | null
  provenance: Provenance | undefined
  links: readonly {
    portal: ListingPortal
    readReference: string | null
  }[]
}): string | null {
  const key = referenceKey(input.reference)
  if (!key) return null
  const provenance = input.provenance
  const head = provenance
    ? `${provenance.evidence && provenance.source === 'listing' ? provenance.evidence : PROVENANCE_WORDS[provenance.source]}${provenance.recordedAt ? ` le ${shortDay(provenance.recordedAt)}` : ''}`
    : null
  const named = provenance?.evidence ?? ''
  const same = [
    ...new Set(
      input.links
        .filter(l => referenceKey(l.readReference) === key)
        .map(l => LISTING_PORTAL_LABELS[l.portal])
        .filter(label => !named.includes(label))
    ),
  ]
  const others = same.length ? `la même sur ${same.join(', ')}` : null
  const text = [head, others].filter(Boolean).join(', ')
  if (!text) return null
  // « le 3 nov. » finit déjà par un point : pas de second.
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${text.endsWith('.') ? '' : '.'}`
}
