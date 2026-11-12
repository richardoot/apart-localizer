import { ListingInputSchema } from '@apart/contracts'
import type {
  CandidateTriage,
  CriteriaFitLevel,
  DuplicateCandidate,
  DuplicateProbe,
  ExplorationCounts,
  ExplorationOutcome,
  ExplorationPortal,
  ExplorationPortalRun,
  ListingInput,
  LocationPrecision,
  SellerType,
} from '@apart/contracts'
import {
  explorationCounts,
  explorationSummaryText,
  normalizeListingUrl,
  sanitizeEvidence,
} from '@apart/domain'
import { demoId } from './ids.js'
import type { DemoCheck, DemoLink } from './dataset.js'

/**
 * Lot 16 : les explorations fictives du jeu de démonstration, marquées
 * « [Exemple] » : une ancienne (un brouillon depuis écarté), et une récente
 * qui montre toutes les sortes de lignes (à valider dans, à la marge, à
 * confirmer, doublon probable, déjà suivie avec baisse de prix et sans
 * changement, déjà écartée par la liste et par un brouillon, hors critères)
 * et un portail bloqué. Les liens sont en `exemple.invalid` ou sur des
 * chemins fictifs ; aucun titre, aucune adresse réelle. Les vérifications
 * des annonces déjà suivies sont dans `CHECKS` (dataset.ts), à la même
 * heure que l'exploration. Lot 18 : une annonce rattachée d'office (même
 * réseau, même référence qu'une annonce suivie : son lien est dans `LINKS`,
 * son brouillon est reconnu) et un doublon probable par la référence (même
 * référence, autre agence), dont les motifs sont ceux de `domain`.
 */

export interface DemoExplorationLine {
  position: number
  url: string
  portal: ExplorationPortal
  title: string
  price: number | null
  surface: number | null
  rooms: number | null
  commune: string | null
  district: string | null
  outcome: ExplorationOutcome
  why: string
  reasons: string[]
  level: CriteriaFitLevel | null
  listingKey: string | null
  draftId: string | null
  excerpt: string | null
}

export interface DemoExploration {
  id: string
  runKey: string
  by: 'demo' | 'demo2'
  startedAt: string
  finishedAt: string
  criteria: { id: string; name: string }[]
  portals: ExplorationPortalRun[]
  counts: ExplorationCounts
  summary: string
  outDigest: string | null
  lines: DemoExplorationLine[]
}

/** Un brouillon né d'une exploration (en attente, écarté ou, lot 18, reconnu et rattaché d'office). */
export interface DemoExplorationDraft {
  id: string
  explorationId: string
  status: 'pending' | 'dismissed' | 'merged'
  input: ListingInput
  url: string
  portal: ExplorationPortal
  excerpt: string | null
  receivedAt: string
  duplicates: DuplicateCandidate[]
  warnings: string[]
  dismissReason: string | null
  decidedBy: 'demo' | 'demo2' | null
  decidedAt: string | null
  /** Lot 18 : l'annonce à laquelle son lien a été rattaché d'office. */
  listingId: string | null
  attachedLinkId: string | null
  attachedAt: string | null
  mergedCheckId: string | null
}

interface Context {
  /** Il y a `days` jours, à `hour` heures UTC. */
  at: (days: number, hour?: number, minute?: number) => string
  listing: (key: string) => {
    id: string
    title: string
    status: DuplicateCandidate['status']
    price: number
    surface: number | null
    commune: string | null
    url: string | null
    sellerType: SellerType
    sellerName: string | null
    sellerReference: string | null
    links: DemoLink[]
    checks: DemoCheck[]
  }
  /** Lot 18 : les doublons d'une annonce lue, par les règles de `domain`. */
  duplicates: (probe: DuplicateProbe) => DuplicateCandidate[]
  criteria: {
    centre: { id: string; name: string }
    tramB: { id: string; name: string }
  }
  log: (entry: {
    at: string
    actor: 'demo' | 'demo2' | null
    channel: 'mcp' | 'web'
    action: string
    listingKey: string | null
    after?: Record<string, unknown> | null
  }) => void
}

const LBC = 'https://www.leboncoin.fr/ad/ventes_immobilieres/'

const NOT_ATTACHED = {
  listingId: null,
  attachedLinkId: null,
  attachedAt: null,
  mergedCheckId: null,
} as const

interface DraftSpec {
  key: string
  title: string
  url: string
  portal: ExplorationPortal
  price: number
  surface: number | null
  rooms: number
  dpeClass: 'B' | 'C' | 'D' | null
  commune: string
  district: string
  point: [number, number]
  precision: LocationPrecision
  excerpt: string
  /** Lot 18 : le vendeur lu sur la page. */
  seller?: { type: SellerType; name?: string; reference?: string }
}

function draftInput(spec: DraftSpec, at: string): ListingInput {
  const provenance = {
    source: 'listing' as const,
    confidence: 0.8,
    evidence: 'Lu sur la page du portail par Claude (exemple fictif)',
    recordedAt: at,
  }
  return ListingInputSchema.parse({
    title: spec.title,
    source:
      spec.portal === 'logicimmo' || spec.portal === 'other'
        ? 'autre'
        : spec.portal,
    url: spec.url,
    price: spec.price,
    surface: spec.surface,
    rooms: spec.rooms,
    dpeClass: spec.dpeClass,
    description: spec.excerpt,
    location: {
      commune: spec.commune,
      district: spec.district,
      point: { type: 'Point', coordinates: spec.point },
      precision: spec.precision,
    },
    sellerType: spec.seller?.type ?? 'unknown',
    sellerName: spec.seller?.name ?? null,
    sellerReference: spec.seller?.reference ?? null,
    fieldSources: Object.fromEntries(
      [
        'price',
        'surface',
        'rooms',
        'dpeClass',
        'commune',
        'district',
        'title',
        'url',
        ...(spec.seller ? ['sellerType', 'sellerName', 'sellerReference'] : []),
      ]
        .filter(k => k !== 'surface' || spec.surface !== null)
        .filter(k => k !== 'dpeClass' || spec.dpeClass !== null)
        .map(k => [k, provenance])
    ),
  })
}

function warningsOf(spec: DraftSpec): string[] {
  return [
    spec.surface === null ? 'Surface à demander.' : null,
    spec.dpeClass === null ? 'DPE à demander.' : null,
    spec.precision === 'district' || spec.precision === 'commune'
      ? 'Adresse ou quartier à préciser.'
      : null,
  ].filter((w): w is string => w !== null)
}

/** Les lignes comptées comme des annonces triées (compteurs et résumé de `domain`). */
function countsOf(
  lines: readonly DemoExplorationLine[],
  portals: readonly ExplorationPortalRun[]
): ExplorationCounts {
  const triaged = lines.map(
    l =>
      ({
        outcome: l.outcome,
        alreadyPending: false,
        check:
          l.outcome === 'known'
            ? {
                outcome: l.why.includes('→') ? 'changed' : 'unchanged',
                summary: '',
                changes: [],
                problem: null,
                checkId: null,
              }
            : null,
      }) as Pick<CandidateTriage, 'outcome' | 'alreadyPending' | 'check'>
  )
  return explorationCounts(triaged, portals)
}

export function buildDemoExplorations(ctx: Context): {
  explorations: DemoExploration[]
  drafts: DemoExplorationDraft[]
} {
  const { at, listing, duplicates, criteria, log } = ctx
  const explorations: DemoExploration[] = []
  const drafts: DemoExplorationDraft[] = []

  // L'ancienne exploration : un T3 en rez-de-chaussée, depuis écarté par Sacha.
  const oldId = demoId('exploration:ancienne')
  const oldDraftId = demoId('exploration-draft:rdc')
  const oldAt = at(9, 19, 10)
  const rdc: DraftSpec = {
    key: 'rdc',
    title: '[Exemple] T3 58 m², rez-de-chaussée',
    url: `${LBC}0000000101`,
    portal: 'leboncoin',
    price: 205_000,
    surface: 58,
    rooms: 3,
    dpeClass: 'D',
    commune: 'Bordeaux',
    district: 'Saint-Seurin',
    point: [-0.5848, 44.8435],
    precision: 'street',
    excerpt:
      'Exemple fictif : rez-de-chaussée sur rue, deux chambres, petite cour.',
  }
  drafts.push({
    id: oldDraftId,
    explorationId: oldId,
    status: 'dismissed',
    input: draftInput(rdc, oldAt),
    url: rdc.url,
    portal: rdc.portal,
    excerpt: sanitizeEvidence(rdc.excerpt),
    receivedAt: oldAt,
    duplicates: [],
    warnings: warningsOf(rdc),
    dismissReason: 'rez-de-chaussée sur rue',
    decidedBy: 'demo2',
    decidedAt: at(8, 21),
    ...NOT_ATTACHED,
  })
  const oldPortals: ExplorationPortalRun[] = [
    {
      portal: 'leboncoin',
      status: 'read',
      count: 2,
      note: null,
      searchUrl: null,
    },
  ]
  const oldLines: DemoExplorationLine[] = [
    {
      position: 0,
      url: rdc.url,
      portal: 'leboncoin',
      title: rdc.title,
      price: rdc.price,
      surface: rdc.surface,
      rooms: rdc.rooms,
      commune: rdc.commune,
      district: rdc.district,
      outcome: 'new',
      why: `Dans « ${criteria.centre.name} »`,
      reasons: [],
      level: 'in',
      listingKey: null,
      draftId: oldDraftId,
      excerpt: sanitizeEvidence(rdc.excerpt),
    },
    {
      position: 1,
      url: `${LBC}0000000102`,
      portal: 'leboncoin',
      title: '[Exemple] T2 33 m², sous les toits',
      price: 139_000,
      surface: 33,
      rooms: 2,
      commune: 'Talence',
      district: 'Thouars',
      outcome: 'out',
      why: 'À 2,1 km du périmètre (marge 300 m)',
      reasons: ['à 2,1 km du périmètre (marge 300 m)'],
      level: 'out',
      listingKey: null,
      draftId: null,
      excerpt: null,
    },
  ]
  const oldCounts = countsOf(oldLines, oldPortals)
  explorations.push({
    id: oldId,
    runKey: 'demo-exploration-ancienne',
    by: 'demo',
    startedAt: at(9, 19, 2),
    finishedAt: oldAt,
    criteria: [criteria.centre, criteria.tramB],
    portals: oldPortals,
    counts: oldCounts,
    summary: explorationSummaryText(oldCounts, oldPortals),
    outDigest: 'hors du périmètre (1)',
    lines: oldLines,
  })
  log({
    at: oldAt,
    actor: 'demo',
    channel: 'mcp',
    action: 'exploration.recorded',
    listingKey: null,
    after: {
      explorationId: oldId,
      summary: explorationSummaryText(oldCounts, oldPortals),
      draftsCreated: 1,
      counts: oldCounts,
      portals: ['Leboncoin'],
      blocked: [],
      criteria: [criteria.centre.name, criteria.tramB.name],
      draftIds: [oldDraftId],
    },
  })
  log({
    at: at(8, 21),
    actor: 'demo2',
    channel: 'web',
    action: 'draft.dismissed',
    listingKey: null,
    after: {
      draftId: oldDraftId,
      url: rdc.url,
      origin: 'exploration',
      reason: 'rez-de-chaussée sur rue',
    },
  })

  // L'exploration d'hier, à midi : toutes les sortes de lignes.
  const id = demoId('exploration:recente')
  const startedAt = at(1, 10, 54)
  const finishedAt = at(1, 11)
  const chartrons = listing('chartrons-t2')
  const specs: Record<
    'inside' | 'duplicate' | 'margin' | 'confirm',
    DraftSpec
  > = {
    inside: {
      key: 'inside',
      title: '[Exemple] T3 68 m², balcon sud',
      url: `${LBC}0000000111`,
      portal: 'leboncoin',
      price: 214_000,
      surface: 68,
      rooms: 3,
      dpeClass: 'C',
      commune: 'Bordeaux',
      district: 'Chartrons',
      point: [-0.572, 44.853],
      precision: 'street',
      excerpt:
        'Exemple fictif : T3 traversant au 2e étage avec ascenseur, balcon de 8 m², cave, charges 140 € par mois.',
    },
    duplicate: {
      key: 'duplicate',
      title: '[Exemple] T2 lumineux, quais',
      url: 'https://www.pap.fr/annonces/appartement-bordeaux-exemple-r900000111',
      portal: 'pap',
      price: 168_000,
      surface: 42,
      rooms: 2,
      dpeClass: 'D',
      commune: 'Bordeaux',
      district: 'Chartrons',
      point: [-0.5737, 44.8547],
      precision: 'street',
      excerpt:
        'Exemple fictif : même description que l’annonce suivie, publiée par le propriétaire.',
    },
    margin: {
      key: 'margin',
      title: '[Exemple] T3 63 m², proche tram',
      url: 'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/exemple-0000009111.htm',
      portal: 'seloger',
      price: 246_000,
      surface: 63,
      rooms: 3,
      dpeClass: 'C',
      commune: 'Bordeaux',
      district: 'Bastide',
      point: [-0.555, 44.842],
      precision: 'street',
      excerpt:
        'Exemple fictif : 3e étage sans ascenseur, à 250 m du tram, double vitrage récent.',
    },
    confirm: {
      key: 'confirm',
      title: '[Exemple] T3, surface non indiquée',
      url: 'https://www.bienici.com/annonce/vente/talence/appartement/exemple-111',
      portal: 'bienici',
      price: 199_000,
      surface: null,
      rooms: 3,
      dpeClass: null,
      commune: 'Talence',
      district: 'Peixotto',
      point: [-0.585, 44.806],
      precision: 'district',
      excerpt:
        'Exemple fictif : annonce courte, trois pièces, proche du tram, sans surface ni diagnostic.',
    },
  }
  const duplicateOf: DuplicateCandidate = {
    listingId: chartrons.id,
    title: chartrons.title,
    status: chartrons.status,
    price: chartrons.price,
    surface: chartrons.surface,
    commune: chartrons.commune,
    url: chartrons.url,
    score: 0.8,
    reasons: [
      {
        kind: 'same_commune_price_surface',
        score: 0.8,
        detail:
          'même surface (42 m²), même quartier, 4 000 € de moins, autre portail (exemple fictif)',
      },
    ],
    certain: false,
    sellerType: chartrons.sellerType,
    sellerName: chartrons.sellerName,
    sellerReference: chartrons.sellerReference,
    linkCount: chartrons.links.length,
    differences: [],
  }
  const draftIds = {
    inside: demoId('exploration-draft:inside'),
    duplicate: demoId('exploration-draft:duplicate'),
    margin: demoId('exploration-draft:margin'),
    confirm: demoId('exploration-draft:confirm'),
  }
  for (const key of ['inside', 'duplicate', 'margin', 'confirm'] as const) {
    const spec = specs[key]
    drafts.push({
      id: draftIds[key],
      explorationId: id,
      status: 'pending',
      input: draftInput(spec, finishedAt),
      url: spec.url,
      portal: spec.portal,
      excerpt: sanitizeEvidence(spec.excerpt),
      receivedAt: finishedAt,
      duplicates: key === 'duplicate' ? [duplicateOf] : [],
      warnings: warningsOf(spec),
      dismissReason: null,
      decidedBy: null,
      decidedAt: null,
      ...NOT_ATTACHED,
    })
  }
  const draftLine = (
    position: number,
    key: keyof typeof specs,
    outcome: ExplorationOutcome,
    level: CriteriaFitLevel,
    why: string,
    reasons: string[] = []
  ): DemoExplorationLine => ({
    position,
    url: specs[key].url,
    portal: specs[key].portal,
    title: specs[key].title,
    price: specs[key].price,
    surface: specs[key].surface,
    rooms: specs[key].rooms,
    commune: specs[key].commune,
    district: specs[key].district,
    outcome,
    why,
    reasons,
    level,
    listingKey: null,
    draftId: draftIds[key],
    excerpt: sanitizeEvidence(specs[key].excerpt),
  })
  const merignac = listing('merignac-t2')
  const begles = listing('begles-t3')
  const lormont = listing('lormont-t3')
  const lines: DemoExplorationLine[] = [
    draftLine(0, 'inside', 'new', 'in', `Dans « ${criteria.centre.name} »`),
    draftLine(
      1,
      'duplicate',
      'duplicate_probable',
      'in',
      `Dans « ${criteria.centre.name} » ; doublon probable de « ${chartrons.title} », à trancher`
    ),
    draftLine(
      2,
      'margin',
      'new',
      'margin',
      'À la marge : Prix +2,5 % (maximum 240 000 €, marge 5 %)',
      ['prix +2,5 % (maximum 240 000 €, marge 5 %)']
    ),
    draftLine(
      3,
      'confirm',
      'new',
      'to_confirm',
      'À confirmer : Repère approché dans le périmètre : adresse à préciser',
      ['repère approché dans le périmètre : adresse à préciser']
    ),
    {
      position: 4,
      url: merignac.url ?? `${LBC}0000000112`,
      portal: 'leboncoin',
      title: merignac.title,
      price: 152_000,
      surface: 47,
      rooms: 2,
      commune: 'Mérignac',
      district: 'Centre',
      outcome: 'known',
      why: 'Même lien : prix 158 000 € → 152 000 €, appliqué, noté dans l’Historique',
      reasons: [],
      level: null,
      listingKey: 'merignac-t2',
      draftId: null,
      excerpt: null,
    },
    {
      position: 5,
      url: begles.url ?? `${LBC}0000000113`,
      portal: 'seloger',
      title: begles.title,
      price: 175_000,
      surface: 58,
      rooms: 3,
      commune: 'Bègles',
      district: 'Terres Neuves',
      outcome: 'known',
      why: 'Même lien, rien de changé',
      reasons: [],
      level: null,
      listingKey: 'begles-t3',
      draftId: null,
      excerpt: null,
    },
    {
      position: 6,
      url: lormont.url ?? `${LBC}0000000114`,
      portal: 'leboncoin',
      title: lormont.title,
      price: lormont.price,
      surface: lormont.surface,
      rooms: 3,
      commune: lormont.commune,
      district: null,
      outcome: 'dismissed',
      why: 'Écartée : « Travaux trop lourds et DPE G »',
      reasons: [],
      level: null,
      listingKey: 'lormont-t3',
      draftId: null,
      excerpt: null,
    },
    {
      position: 7,
      url: rdc.url,
      portal: 'leboncoin',
      title: rdc.title,
      price: rdc.price,
      surface: rdc.surface,
      rooms: rdc.rooms,
      commune: rdc.commune,
      district: rdc.district,
      outcome: 'dismissed',
      why: 'Écartée par Sacha (démo) : « rez-de-chaussée sur rue »',
      reasons: [],
      level: null,
      listingKey: null,
      draftId: oldDraftId,
      excerpt: null,
    },
    {
      position: 8,
      url: 'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/exemple-0000009115.htm',
      portal: 'seloger',
      title: '[Exemple] T4 94 m², séjour double',
      price: 289_000,
      surface: 94,
      rooms: 4,
      commune: 'Bordeaux',
      district: 'Saint-Pierre',
      outcome: 'out',
      why: 'Prix +20 % (maximum 240 000 €, marge 5 %)',
      reasons: ['prix +20 % (maximum 240 000 €, marge 5 %)'],
      level: 'out',
      listingKey: null,
      draftId: null,
      excerpt: null,
    },
    {
      position: 9,
      url: `${LBC}0000000116`,
      portal: 'leboncoin',
      title: '[Exemple] Studio 24 m²',
      price: 118_000,
      surface: 24,
      rooms: 1,
      commune: 'Talence',
      district: 'Forum',
      outcome: 'out',
      why: '1 pièce (minimum 2)',
      reasons: ['1 pièce (minimum 2)'],
      level: 'out',
      listingKey: null,
      draftId: null,
      excerpt: null,
    },
    {
      position: 10,
      url: 'https://www.pap.fr/annonces/appartement-eysines-exemple-r900000117',
      portal: 'pap',
      title: '[Exemple] T3 61 m², vue dégagée',
      price: 198_000,
      surface: 61,
      rooms: 3,
      commune: 'Eysines',
      district: null,
      outcome: 'out',
      why: 'À 2,4 km du périmètre (marge 300 m)',
      reasons: ['à 2,4 km du périmètre (marge 300 m)'],
      level: 'out',
      listingKey: null,
      draftId: null,
      excerpt: null,
    },
  ]
  // Lot 18 : la même annonce du mandataire sur Bien'ici (même réseau, même
  // référence), rattachée d'office ; son lien et sa vérification « Lien
  // ajouté » sont ceux de `LINKS` (dataset.ts).
  const attachedLink = merignac.links.find(l => l.draftId !== null)
  const attachedCheck = merignac.checks.find(
    c => c.linkId === attachedLink?.id && c.outcome === 'link_added'
  )
  if (!attachedLink || !attachedCheck) {
    throw new Error('Jeu de démo incohérent : lien rattaché d’office absent')
  }
  const attachedId = attachedLink.draftId as string
  const attachedSpec: DraftSpec = {
    key: 'attached',
    title: '[Exemple] T2 47 m² avec parking',
    url: attachedLink.url,
    portal: 'bienici',
    price: attachedLink.price ?? merignac.price,
    surface: 47,
    rooms: 2,
    dpeClass: 'C',
    commune: 'Mérignac',
    district: 'Centre',
    point: [-0.6455, 44.839],
    precision: 'district',
    excerpt:
      'Exemple fictif : deux pièces avec parking, même mandat que l’annonce suivie (EX-3310).',
    seller: {
      type: 'mandatary',
      name: '[Exemple] Réseau des conseillers',
      reference: 'EX-3310',
    },
  }
  drafts.push({
    id: attachedId,
    explorationId: id,
    status: 'merged',
    input: draftInput(attachedSpec, finishedAt),
    url: attachedSpec.url,
    portal: attachedSpec.portal,
    excerpt: sanitizeEvidence(attachedSpec.excerpt),
    receivedAt: finishedAt,
    duplicates: duplicates({
      url: attachedSpec.url,
      commune: attachedSpec.commune,
      price: attachedSpec.price,
      surface: 47,
      sellerType: 'mandatary',
      sellerName: attachedSpec.seller?.name,
      reference: attachedSpec.seller?.reference,
    }),
    warnings: [],
    dismissReason: null,
    decidedBy: 'demo',
    decidedAt: finishedAt,
    listingId: merignac.id,
    attachedLinkId: attachedLink.id,
    attachedAt: finishedAt,
    mergedCheckId: attachedCheck.id,
  })
  // Lot 18 : même référence, autre agence : à trancher (deux agences ont
  // parfois le même mandat).
  const referenceId = demoId('exploration-draft:reference')
  const referenceSpec: DraftSpec = {
    key: 'reference',
    title: '[Exemple] T2 42 m², Chartrons',
    url: 'https://www.seloger.com/annonces/achat/appartement/bordeaux-33/exemple-0000009122.htm',
    portal: 'seloger',
    price: 174_000,
    surface: 42,
    rooms: 2,
    dpeClass: 'D',
    commune: 'Bordeaux',
    district: 'Chartrons',
    point: [-0.5736, 44.8549],
    precision: 'street',
    excerpt:
      'Exemple fictif : même référence que l’annonce suivie, publiée par une autre agence.',
    seller: {
      type: 'agency',
      name: '[Exemple] Agence du Jardin public',
      reference: 'EX-2041',
    },
  }
  drafts.push({
    id: referenceId,
    explorationId: id,
    status: 'pending',
    input: draftInput(referenceSpec, finishedAt),
    url: referenceSpec.url,
    portal: referenceSpec.portal,
    excerpt: sanitizeEvidence(referenceSpec.excerpt),
    receivedAt: finishedAt,
    duplicates: duplicates({
      url: referenceSpec.url,
      commune: referenceSpec.commune,
      price: referenceSpec.price,
      surface: 42,
      sellerType: 'agency',
      sellerName: referenceSpec.seller?.name,
      reference: referenceSpec.seller?.reference,
    }),
    warnings: warningsOf(referenceSpec),
    dismissReason: null,
    decidedBy: null,
    decidedAt: null,
    ...NOT_ATTACHED,
  })
  const lot18Line = (
    position: number,
    spec: DraftSpec,
    draftId: string,
    outcome: ExplorationOutcome,
    why: string,
    level: CriteriaFitLevel | null,
    listingKey: string | null
  ): DemoExplorationLine => ({
    position,
    url: spec.url,
    portal: spec.portal,
    title: spec.title,
    price: spec.price,
    surface: spec.surface,
    rooms: spec.rooms,
    commune: spec.commune,
    district: spec.district,
    outcome,
    why,
    reasons: [],
    level,
    listingKey,
    draftId,
    excerpt: sanitizeEvidence(spec.excerpt),
  })
  lines.push(
    lot18Line(
      11,
      attachedSpec,
      attachedId,
      'attached',
      `Même agence et même référence que « ${merignac.title} » : lien rattaché d’office à sa fiche : ${attachedCheck.summary}`,
      null,
      'merignac-t2'
    ),
    lot18Line(
      12,
      referenceSpec,
      referenceId,
      'duplicate_probable',
      `Dans « ${criteria.centre.name} » ; doublon probable de « ${chartrons.title} » (même référence, autre agence), à trancher`,
      'in',
      null
    )
  )

  const portals: ExplorationPortalRun[] = [
    {
      portal: 'leboncoin',
      status: 'read',
      count: 5,
      note: null,
      searchUrl: null,
    },
    {
      portal: 'seloger',
      status: 'read',
      count: 4,
      note: null,
      searchUrl: null,
    },
    {
      portal: 'bienici',
      status: 'read',
      count: 2,
      note: null,
      searchUrl: null,
    },
    { portal: 'pap', status: 'read', count: 2, note: null, searchUrl: null },
    {
      portal: 'logicimmo',
      status: 'blocked',
      count: 0,
      note: 'Vérification anti-robot : non contournée',
      searchUrl: null,
    },
  ]
  const counts = countsOf(lines, portals)
  const summary = explorationSummaryText(counts, portals)
  explorations.push({
    id,
    runKey: 'demo-exploration-recente',
    by: 'demo',
    startedAt,
    finishedAt,
    criteria: [criteria.centre, criteria.tramB],
    portals,
    counts,
    summary,
    outDigest:
      'prix au-delà de la marge (1), pas assez de pièces (1), hors du périmètre (1)',
    lines,
  })
  log({
    at: finishedAt,
    actor: 'demo',
    channel: 'mcp',
    action: 'exploration.recorded',
    listingKey: null,
    after: {
      explorationId: id,
      summary,
      draftsCreated: 5,
      counts,
      portals: ['Leboncoin', 'SeLoger', 'Bien’ici', 'PAP', 'Logic-Immo'],
      blocked: ['Logic-Immo'],
      criteria: [criteria.centre.name, criteria.tramB.name],
      draftIds: [...Object.values(draftIds), referenceId],
      attached: 1,
    },
  })
  return { explorations, drafts }
}

/** Le lien normalisé d'une ligne (index du compte rendu). */
export function demoNormalizedUrl(url: string): string | null {
  return normalizeListingUrl(url)
}
