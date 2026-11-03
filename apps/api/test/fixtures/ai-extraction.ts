/**
 * Réponses fictives du modèle pour les tests (unitaires et e2e) : aucune
 * donnée réelle, aucun appel réseau. `sampleExtraction` est une annonce
 * inventée à Talence ; `emptyExtraction` une réponse où rien n'a été lu.
 */
import { AiListingExtractionSchema } from '@apart/contracts'
import type { AiField, AiListingExtraction } from '@apart/contracts'

type FieldKey = Exclude<keyof AiListingExtraction, 'remarks'>

const EMPTY: AiField<never> = { value: null, confidence: 0, evidence: null }

export function emptyExtraction(
  over: Partial<AiListingExtraction> = {}
): AiListingExtraction {
  const base = Object.fromEntries(
    Object.keys(AiListingExtractionSchema.shape)
      .filter(key => key !== 'remarks')
      .map(key => [key, { ...EMPTY }])
  ) as Record<FieldKey, AiField<never>>
  return AiListingExtractionSchema.parse({ ...base, remarks: [], ...over })
}

const read = <T>(
  value: T,
  evidence: string,
  confidence = 0.95
): AiField<T> => ({
  value,
  confidence,
  evidence,
})

/** Une annonce fictive complète, telle qu'un portail l'écrirait. */
export const SAMPLE_LISTING_TEXT = `Appartement T2 Talence Forum - 189 000 € FAI
Au 3e étage sur 5 avec ascenseur d'une résidence de 1975, T2 de 45,2 m² loi Carrez
comprenant séjour lumineux exposé sud, cuisine séparée, chambre, salle d'eau, balcon 5 m².
Cave. Chauffage individuel gaz. DPE : D (210 kWh/m²/an), GES : D.
Charges de copropriété : 110 €/mois. Taxe foncière : 780 €. Copropriété de 40 lots, aucune procédure en cours.
Quelques rafraîchissements à prévoir (peintures).
Honoraires inclus à charge acquéreur : 4,5 %. Réf. AGF-12345. Agence Fictive Talence.
Rue du Forum, à deux pas du tram B.`

export function sampleExtraction(
  over: Partial<AiListingExtraction> = {}
): AiListingExtraction {
  return emptyExtraction({
    title: read(
      'T2 Talence Forum, 3e étage avec balcon',
      'Appartement T2 Talence Forum'
    ),
    portal: read('agence' as const, 'Agence Fictive Talence', 0.7),
    agencyName: read('Agence Fictive Talence', 'Agence Fictive Talence'),
    externalId: read('AGF-12345', 'Réf. AGF-12345'),
    price: read(189_000, '189 000 € FAI'),
    feesIncluded: read(true, 'Honoraires inclus à charge acquéreur'),
    feesPercent: read(0.045, '4,5 %'),
    surface: read(45.2, '45,2 m² loi Carrez'),
    rooms: read(2, 'T2'),
    bedrooms: read(1, 'chambre', 0.8),
    floor: read(3, '3e étage sur 5'),
    floorsTotal: read(5, '3e étage sur 5'),
    floorLabel: read(
      '3e étage sur 5 avec ascenseur',
      '3e étage sur 5 avec ascenseur'
    ),
    elevator: read(true, 'avec ascenseur'),
    constructionYear: read(1975, 'résidence de 1975'),
    dpeClass: read('D' as const, 'DPE : D'),
    dpeConsumption: read(210, '210 kWh/m²/an'),
    gesClass: read('D' as const, 'GES : D'),
    heatingType: read('gaz', 'Chauffage individuel gaz'),
    heatingCollective: read(false, 'Chauffage individuel gaz'),
    outdoor: read('balcon 5 m²', 'balcon 5 m²'),
    cellar: read(true, 'Cave.'),
    orientation: read('sud', 'exposé sud'),
    condition: read(
      'rafraîchissements à prévoir',
      'Quelques rafraîchissements à prévoir'
    ),
    annualCharges: read(1320, '110 €/mois × 12', 0.85),
    lotsCount: read(40, 'Copropriété de 40 lots'),
    proceedings: read('aucune procédure en cours', 'aucune procédure en cours'),
    propertyTax: read(780, 'Taxe foncière : 780 €'),
    addressRaw: read('Rue du Forum', 'Rue du Forum', 0.8),
    postalCode: read('33400', 'Talence', 0.5),
    commune: read('Talence', 'Talence'),
    district: read('Forum, tram B', 'à deux pas du tram B', 0.7),
    worksMentioned: read(
      true,
      'Quelques rafraîchissements à prévoir (peintures)'
    ),
    worksLevel: read('refresh' as const, 'rafraîchissements', 0.8),
    worksNotes: read(
      'Peintures à rafraîchir',
      'Quelques rafraîchissements à prévoir (peintures)'
    ),
    description: read(
      'T2 de 45,2 m² au 3e étage avec ascenseur, séjour exposé sud, cuisine séparée, balcon, cave.',
      'Au 3e étage sur 5'
    ),
    remarks: ['Charges indiquées par mois (110 €) : converties en annuel.'],
    ...over,
  })
}

export interface FakeMessageOptions {
  model?: string
  stopReason?: 'end_turn' | 'max_tokens' | 'refusal'
  refusalCategory?: string | null
  usage?: Partial<{
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number | null
    cache_creation_input_tokens: number | null
  }>
  /** Force `parsed_output` (null simule un contenu hors schéma). */
  parsedOutput?: AiListingExtraction | null
}

/** Un `ParsedMessage` tel que `client.messages.parse` le rend, sans réseau. */
export function fakeParsedMessage(
  raw: AiListingExtraction | null,
  options: FakeMessageOptions = {}
): unknown {
  const stopReason = options.stopReason ?? 'end_turn'
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: options.model ?? 'claude-opus-5-5',
    content: raw ? [{ type: 'text', text: JSON.stringify(raw) }] : [],
    stop_reason: stopReason,
    stop_details:
      stopReason === 'refusal'
        ? {
            type: 'refusal',
            category: options.refusalCategory ?? null,
            explanation: 'test',
          }
        : null,
    stop_sequence: null,
    usage: {
      input_tokens: 3200,
      output_tokens: 1400,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 900,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'standard',
      ...options.usage,
    },
    parsed_output:
      options.parsedOutput !== undefined ? options.parsedOutput : raw,
  }
}
