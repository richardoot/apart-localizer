import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  LISTING_SELLER_ORIGIN_LABELS,
  LISTING_STATUS_LABELS,
  McpAddListingSellerInputSchema,
  McpFindSimilarListingsInputSchema,
  McpMergeListingsInputSchema,
  SIMILARITY_LEVEL_LABELS,
} from '@apart/contracts'
import type {
  EvaluatedListing,
  ListingMergeResult,
  ListingSellerWriteResult,
  SimilarListing,
  SimilarListingsResult,
} from '@apart/contracts'
import {
  formatEuros,
  otherSellerText,
  sellersCountText,
  similarityPercent,
} from '@apart/domain'
import type { McpToolContext } from './mcp-tools'
import { describeCriteriaChanges, describeListing } from './mcp-tools'
import { answer, dataResult, refusal, writeRefusal } from './tool-results'

/**
 * Lot 27 (ADR 0037) au connecteur : retrouver les annonces qui se
 * ressemblent, fusionner deux fiches du même bien, enregistrer une autre
 * agence et sa référence. Une fusion ne supprime rien (le doublon est gardé,
 * caché des listes) et s'annule dans l'application ; elle demande l'accord
 * du membre, donné dans la conversation. Aucune logique métier ici :
 * `domain` décide, les services écrivent.
 */

const CHANNEL = 'mcp' as const

/** Les autres agences d'une fiche et ses fusions, en quelques lignes (get_listing). */
export function describeSellersAndMerges(
  item: EvaluatedListing
): string | null {
  const lines: string[] = []
  if (item.mergedInto) {
    lines.push(
      `FICHE FUSIONNÉE : doublon de « ${item.mergedInto.title} » [id ${item.mergedInto.id}]. Elle n’est plus suivie : lisez et modifiez plutôt cette autre fiche.`
    )
  }
  if (item.sellers.length) {
    const count = sellersCountText(item.listing, item.sellers)
    lines.push(
      `${count ?? 'Autres agences'} ; autres agences du même bien, chacune avec sa référence :`,
      ...item.sellers.map(
        seller =>
          `- ${otherSellerText(seller)} (${LISTING_SELLER_ORIGIN_LABELS[seller.origin]})`
      )
    )
  }
  if (item.absorbed.length) {
    lines.push(
      'Doublons fusionnés dans cette fiche (annulables dans l’application) :',
      ...item.absorbed.map(
        merge => `- « ${merge.absorbedTitle} » [id ${merge.absorbedId}]`
      )
    )
  }
  return lines.length ? lines.join('\n') : null
}

/** Une annonce ressemblante en une ligne : niveau, note, faits, ce qui concorde, ce qui diffère. */
export function describeSimilar(item: SimilarListing): string {
  const facts = [
    formatEuros(item.price),
    item.surface !== null ? `${item.surface} m²` : null,
    item.commune,
    LISTING_STATUS_LABELS[item.status],
  ]
    .filter(Boolean)
    .join(', ')
  const matches = item.matches.map(m => m.text).join(' ; ')
  const differences = item.differences.map(d => d.text).join(' ; ')
  return [
    `- ${SIMILARITY_LEVEL_LABELS[item.level]} (${similarityPercent(item.score)}) : « ${item.title} » (${facts}) [id ${item.listingId}]`,
    matches ? `  Concorde : ${matches}` : null,
    differences ? `  Diffère : ${differences}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function describeSimilarResult(result: SimilarListingsResult): string {
  return [
    `${result.summary} (${result.compared} comparée${result.compared > 1 ? 's' : ''}).`,
    ...result.items.map(describeSimilar),
    result.items.length
      ? 'Une ressemblance n’est pas une preuve : montrez les deux fiches au membre avant toute fusion (merge_listings).'
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function describeMerge(result: ListingMergeResult): string {
  return [
    `${result.summary}.`,
    `« ${result.merge.absorbedTitle} » [id ${result.merge.absorbedId}] est gardée mais cachée des listes ; la fusion s’annule dans l’application (fiche « ${result.merge.keptTitle} », « Fiches fusionnées »).`,
    `Fiche gardée : ${describeListing(result.listing)}`,
    describeSellersAndMerges(result.listing),
    describeCriteriaChanges(result.listing.criteriaChanges),
  ]
    .filter(Boolean)
    .join('\n')
}

export function describeSellerWrite(result: ListingSellerWriteResult): string {
  return [
    `${result.summary}.`,
    describeSellersAndMerges(result.listing),
    'Une annonce lue avec cette agence et cette référence sera reconnue comme la même (doublons, rattachement d’office, add_listing_link).',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Les outils du lot 27. */
export function registerMergeTools(
  server: McpServer,
  ctx: McpToolContext
): void {
  server.registerTool(
    'find_similar_listings',
    {
      title: 'Annonces ressemblantes (déjà vue ?)',
      description:
        "Les annonces de l'espace qui ressemblent le plus à une annonce enregistrée (`listingId`, exclue des résultats) ou à des caractéristiques lues sur une page (`commune`, `district`, `price`, `surface`, `rooms`, `floor`, `dpeClass`, `constructionYear`, `address`, `url`, `sellerName`, `reference`), de la plus ressemblante à la moins ressemblante, écartées comprises (une annonce « déjà vue » a souvent été écartée). `q` cherche un texte (titre, commune, quartier, adresse, agence, référence, prix, surface) ; les annonces trouvées restent classées par ressemblance. " +
        'Chaque annonce porte un niveau (la même annonce, très proche, proche, peu ressemblante), une note de 0 à 1, ce qui concorde et ce qui diffère. Plus large que find_duplicates, qui ne rend que les doublons probables. Les doublons déjà fusionnés ne sont pas proposés. Lecture seule ; une ressemblance n’est jamais une preuve.',
      inputSchema: McpFindSimilarListingsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ listingId, q, limit, ...fields }) =>
      answer(async () => {
        const result = await ctx.similar.find(ctx.member, {
          listingId,
          q,
          limit,
          fields,
        })
        return dataResult(describeSimilarResult(result), result)
      })
  )

  server.registerTool(
    'merge_listings',
    {
      title: 'Fusionner deux fiches du même bien',
      description:
        'Deux fiches de l’espace décrivent le même bien (souvent publié par deux agences, ou sur deux portails) : `keepId` reste, `mergeId` (le doublon) y est fusionnée. Ses liens (avec leurs prix et vérifications), ses agences et leurs références, ses visites, offres, avis, tâches et questions aux agences rejoignent la fiche gardée ; ses champs complètent ceux qui étaient vides (un champ déjà rempli n’est jamais écrasé) ; ses notes sont recopiées à la suite ; le prix de la fiche gardée devient le plus bas des liens en ligne (jamais à la place d’un prix saisi à la main). L’agence du doublon devient une autre agence de la fiche, avec sa référence. ' +
        "RIEN N'EST SUPPRIMÉ : le doublon est écarté, caché des listes, et la fusion s’annule dans l’application (jamais par le connecteur). " +
        'AVANT d’appeler : lisez les deux fiches (get_listing), montrez-les côte à côte au membre (prix, surface, étage, adresse, agences, références) et attendez qu’il confirme que c’est le même bien ; passez alors `confirmedInChat: true`. Sans cet accord, la fusion est refusée. Gardez la fiche la plus avancée (visites, avis, offres) ; à égalité, la plus ancienne. Garde-fous : `expectedKeepUpdatedAt` et `expectedMergeUpdatedAt` (lus avec get_listing). Refusé (réponse lisible) si une des deux fiches est déjà fusionnée. Portée listings:write.',
      inputSchema: McpMergeListingsInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async input =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        if (!input.confirmedInChat) {
          return refusal(
            'Refusé : une fusion demande l’accord du membre. Montrez-lui les deux fiches (get_listing), attendez qu’il confirme que c’est le même bien, puis rappelez merge_listings avec confirmedInChat: true. Rien n’a été modifié.'
          )
        }
        const result = await ctx.merges.merge(
          ctx.member,
          input.keepId,
          {
            absorbedId: input.mergeId,
            expectedUpdatedAt: input.expectedKeepUpdatedAt,
            expectedAbsorbedUpdatedAt: input.expectedMergeUpdatedAt,
          },
          CHANNEL
        )
        return dataResult(describeMerge(result), result)
      })
  )

  server.registerTool(
    'add_listing_seller',
    {
      title: 'Ajouter une agence (même bien, autre mandat)',
      description:
        'Un même bien est parfois vendu par plusieurs agences (mandat simple), chacune avec sa propre référence. Enregistre sur la fiche une AUTRE agence que vous avez lue sur une page, dans le navigateur de l’utilisateur : `sellerType` (agency par défaut, mandatary, private pour une vente directe du propriétaire en parallèle), `sellerName` (agence ou réseau, jamais le nom d’une personne), `reference` (« Réf. EX-2041 »). L’agence principale de la fiche ne change pas ; si la fiche ne savait rien de son vendeur, l’agence devient la sienne. ' +
        'Ensuite, une annonce lue avec cette agence et cette référence est reconnue comme la même (doublons, rattachement d’office à l’exploration), et add_listing_link accepte son lien. N’appelez cet outil qu’après que le membre a confirmé dans la conversation que c’est le même bien (`confirmedInChat: true`) ; sinon déposez l’annonce dans « À valider » (record_exploration). Refusé (réponse lisible) si l’agence est déjà sur la fiche, ou si cette agence et cette référence sont celles d’une autre annonce de l’espace (c’est le même bien : merge_listings). Garde-fou : `expectedUpdatedAt`. Aucun retrait par le connecteur. Portée listings:write.',
      inputSchema: McpAddListingSellerInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async input =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        if (!input.confirmedInChat) {
          return refusal(
            'Refusé : enregistrer une autre agence revient à dire que c’est le même bien. Demandez au membre de le confirmer, puis rappelez add_listing_seller avec confirmedInChat: true ; au moindre doute, déposez l’annonce dans « À valider » (record_exploration). Rien n’a été modifié.'
          )
        }
        const result = await ctx.sellers.add(
          ctx.member,
          input.listingId,
          {
            sellerType: input.sellerType,
            sellerName: input.sellerName,
            sellerReference: input.reference,
            expectedUpdatedAt: input.expectedUpdatedAt,
          },
          { channel: CHANNEL, origin: 'claude' }
        )
        return dataResult(describeSellerWrite(result), result)
      })
  )
}
