import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  LISTING_LINK_ORIGIN_LABELS,
  LISTING_PORTAL_LABELS,
  McpAddListingLinkInputSchema,
} from '@apart/contracts'
import type {
  EvaluatedListing,
  ListingLink,
  ListingLinkWriteResult,
} from '@apart/contracts'
import {
  formatEuros,
  linkCountText,
  linkPriceGap,
  linkStateText,
  priceGapText,
  sellerText,
} from '@apart/domain'
import type { McpToolContext } from './mcp-tools'
import { describeCriteriaChanges, describeListing } from './mcp-tools'
import { answer, dataResult, writeRefusal } from './tool-results'

/**
 * Lot 18 : une annonce, plusieurs portails, au connecteur. Claude lit la même
 * annonce sur un autre portail dans le navigateur de l'utilisateur (jamais
 * le serveur) et la rattache à la fiche avec `add_listing_link` — seulement
 * si l'agence ET la référence sont les mêmes ; sinon il la dépose dans « À
 * valider » (`record_exploration`). Aucune logique métier ici : `domain`
 * décide, le service écrit.
 */

const CHANNEL = 'mcp' as const

/** Un lien en une ligne : portail, prix, écart, état, origine, identifiant. */
export function describeLink(
  link: ListingLink,
  links: readonly ListingLink[],
  now: Date = new Date()
): string {
  const gap = linkPriceGap(link, links)
  return [
    `- ${LISTING_PORTAL_LABELS[link.portal]}${link.primary ? ' (lien principal)' : ''}`,
    link.price !== null ? formatEuros(link.price) : 'prix à relever',
    gap !== null ? priceGapText(gap) : null,
    link.online
      ? linkStateText(link, now)
      : linkStateText(link, now).toLowerCase(),
    LISTING_LINK_ORIGIN_LABELS[link.origin],
    link.readReference ? `réf. lue ${link.readReference}` : null,
    `${link.url} [lien ${link.id}]`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** « Où la trouver » et « Qui la vend » en quelques lignes (get_listing). */
export function describeLinksAndSeller(
  item: EvaluatedListing,
  now: Date = new Date()
): string {
  const l = item.listing
  return [
    `Vendeur : ${sellerText(l)}${l.sellerType === 'unknown' ? ' (à relever sur la page, jamais deviné)' : ''}.`,
    item.links.length
      ? `Liens (${linkCountText(item.links)}) :`
      : 'Aucun lien : ajoutez celui de la page avec add_listing_link.',
    ...item.links.map(link => describeLink(link, item.links, now)),
  ].join('\n')
}

/** Le lien ajouté : résumé, proposition de prix, annonce à jour. */
export function describeLinkWrite(result: ListingLinkWriteResult): string {
  return [
    `${result.summary}${result.link ? ` [lien ${result.link.id}]` : ''}.`,
    result.priceProposal
      ? `${result.priceProposal.text} Non appliqué : le prix de la fiche a été saisi à la main ; proposez-le au membre (update_listing ou record_price_change après son accord).`
      : null,
    `Annonce : ${describeListing(result.listing)}`,
    describeCriteriaChanges(result.listing.criteriaChanges),
  ]
    .filter(Boolean)
    .join('\n')
}

/** L'outil du lot 18. */
export function registerLinkTools(
  server: McpServer,
  ctx: McpToolContext
): void {
  server.registerTool(
    'add_listing_link',
    {
      title: 'Ajouter un lien (même annonce, autre portail)',
      description:
        "Rattache à une annonce enregistrée le lien de la MÊME annonce sur un autre portail (Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo, site d'agence), que VOUS avez lue dans le navigateur de l'utilisateur. N'appelez cet outil que si l'agence ET la référence lues sur la page sont celles de la fiche (get_listing : vendeur, référence) ; une référence seule ne suffit pas, et pour un particulier (pas de référence) ou au moindre doute, déposez l'annonce dans « À valider » avec record_exploration. " +
        "Donnez `url`, ce que la page affiche : `price` (prix affiché sur ce portail), `sellerType` (agency, mandatary, private), `sellerName` (agence ou réseau, jamais le nom d'une personne), `reference` (« Réf. EX-2041 »), `externalId` (numéro de l'annonce sur ce portail), `publishedAt`, `evidence` (extrait court qui prouve que c'est la même : référence, prix ; 500 caractères, téléphones et e-mails masqués), `online` (vrai par défaut) ; `portal` est reconnu d'après le lien. Garde-fou : `expectedUpdatedAt` (lu avec get_listing). " +
        'Le lien rejoint « Où la trouver » ; le prix de la fiche devient le plus bas des liens en ligne (un changement de prix ordinaire, historique compris ; jamais à la place d’un prix saisi à la main : il est alors proposé) ; un écart entre portails est noté dans « Mises à jour » (« +5 000 € : frais inclus ? »), jamais résolu ; le vendeur et la référence lus complètent la fiche s’ils étaient inconnus ; l’autre membre est prévenu. Refusé (réponse lisible) si le lien est déjà celui d’une autre annonce (son nom est donné), déjà sur cette fiche (vérifiez-le avec apply_listing_check et linkId), ou si l’agence ou la référence lues contredisent la fiche. Le serveur ne télécharge jamais la page. Aucune suppression. Portée listings:write.',
      inputSchema: McpAddListingLinkInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ listingId, ...input }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        const result = await ctx.links.add(ctx.member, listingId, input, {
          channel: CHANNEL,
          origin: 'claude',
          strictSeller: true,
        })
        return dataResult(describeLinkWrite(result), result)
      })
  )
}
