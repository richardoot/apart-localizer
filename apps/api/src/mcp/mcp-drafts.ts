import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  EXPLORATION_PORTAL_LABELS,
  McpSetDraftStatusInputSchema,
  McpFindSimilarDraftsInputSchema,
  McpGetDraftInputSchema,
  McpListDraftsInputSchema,
  McpMergeDraftIntoListingInputSchema,
  McpMergeDraftsInputSchema,
  McpUpdateDraftInputSchema,
  SIMILARITY_LEVEL_LABELS,
} from '@apart/contracts'
import type {
  ListingDraft,
  ListingDraftStatus,
  ListingMergeField,
  SimilarDraft,
} from '@apart/contracts'
import {
  draftMatchesSearch,
  formatEuros,
  similarityPercent,
} from '@apart/domain'
import type { McpToolContext } from './mcp-tools'
import { answer, dataResult, refusal, writeRefusal } from './tool-results'

/**
 * Lot 31 (ADR 0044) au connecteur : les brouillons (« À valider », écartés,
 * reconnus, validés) se lisent, se corrigent, se comparent entre eux et aux
 * annonces suivies ; Claude peut les garder (l'annonce est créée), les
 * écarter, les repêcher, dire qu'ils sont une annonce suivie (« C'est la
 * même ») ou fusionner deux brouillons du même bien. Chaque décision et
 * chaque fusion demandent l'accord du membre dans la conversation
 * (`confirmedInChat`) ; garder ou écarter suit la décision à plusieurs du
 * lot 21 (une proposition en son nom). Rien n'est supprimé. L'adresse
 * e-mail de l'expéditeur d'une alerte n'est jamais rendue. Aucune logique
 * métier ici : les services écrivent, `domain` décide.
 */

const CHANNEL = 'mcp' as const

const STATUS_LABELS: Record<ListingDraftStatus, string> = {
  pending: 'À valider',
  dismissed: 'Écarté',
  merged: 'Reconnu comme une annonce suivie',
  accepted: 'Validé',
}

/** Un brouillon sans l'e-mail de l'expéditeur de l'alerte (donnée d'un tiers). */
function withoutSender(draft: ListingDraft): Omit<ListingDraft, 'emailFrom'> {
  const { emailFrom: _from, ...rest } = draft
  return rest
}

/** Un brouillon en une ligne : statut, faits, origine, identifiant. */
export function describeDraft(draft: ListingDraft): string {
  const { listing } = draft
  const facts = [
    listing.price > 0 ? formatEuros(listing.price) : 'prix non lu',
    listing.surface !== null ? `${listing.surface} m²` : null,
    listing.rooms !== null ? `${listing.rooms} p.` : null,
    listing.floor !== null ? `étage ${listing.floor}` : null,
    listing.dpeClass ? `DPE ${listing.dpeClass}` : null,
    [listing.location.commune, listing.location.district]
      .filter(Boolean)
      .join(', ') || null,
    listing.sellerName
      ? `${listing.sellerName}${listing.sellerReference ? ` réf. ${listing.sellerReference}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(', ')
  const origin =
    draft.origin === 'exploration'
      ? `trouvée par Claude${draft.portal ? ` sur ${EXPLORATION_PORTAL_LABELS[draft.portal]}` : ''}`
      : 'reçue par e-mail'
  const tail = [
    draft.dismissReason ? `écarté : « ${draft.dismissReason} »` : null,
    draft.mergedIntoDraftId
      ? `fusionné dans le brouillon [id ${draft.mergedIntoDraftId}]`
      : null,
    draft.duplicates.length && !draft.distinct
      ? `${draft.duplicates.length} doublon(s) probable(s) parmi les annonces suivies`
      : null,
    draft.decision ? `proposition en cours` : null,
  ]
    .filter(Boolean)
    .join(' ; ')
  return `« ${listing.title} » (${STATUS_LABELS[draft.status]}) : ${facts} — ${origin}${draft.url ? ` — ${draft.url}` : ''}${tail ? ` — ${tail}` : ''} [id ${draft.id}]`
}

/** Un brouillon ressemblant en une ligne. */
export function describeSimilarDraft(item: SimilarDraft): string {
  const facts = [
    item.price > 0 ? formatEuros(item.price) : null,
    item.surface !== null ? `${item.surface} m²` : null,
    item.commune,
    STATUS_LABELS[item.status],
  ]
    .filter(Boolean)
    .join(', ')
  const matches = item.matches.map(m => m.text).join(' ; ')
  const differences = item.differences.map(d => d.text).join(' ; ')
  return `- ${SIMILARITY_LEVEL_LABELS[item.level]} (${similarityPercent(item.score)}) : « ${item.title} » (${facts})${matches ? ` ; concorde : ${matches}` : ''}${differences ? ` ; diffère : ${differences}` : ''}${item.dismissReason ? ` ; écarté : « ${item.dismissReason} »` : ''} [id ${item.draftId}]`
}

const fieldLines = (fields: ListingMergeField[]): string =>
  fields.map(f => `${f.label} : ${f.other ?? '—'}`).join(' ; ')

export function registerDraftTools(
  server: McpServer,
  ctx: McpToolContext
): void {
  server.registerTool(
    'list_drafts',
    {
      title: 'Lister les brouillons',
      description:
        'Les brouillons de l’espace, les plus récents d’abord : annonces reçues par alerte e-mail ou trouvées par Claude en explorant les portails, qui attendent qu’un membre les ajoute à la liste. `status` : pending « À valider » (par défaut), dismissed écartés (les archives), merged reconnus comme une annonce suivie, accepted validés (annonce créée). `search` cherche un texte (titre, commune, quartier, adresse, agence, référence, lien, raison de l’écart), `explorationId` les brouillons d’une exploration. Chaque brouillon : sa fiche pré-remplie, son lien, son origine, la raison de son écart, ses doublons probables parmi les annonces suivies, la proposition en cours, `updatedAt` (garde-fou des écritures) ; un brouillon à valider porte aussi son adéquation aux critères et ses chiffres. Lecture seule ; l’e-mail de l’expéditeur d’une alerte n’est jamais rendu. Pour repérer des doublons entre brouillons : find_similar_drafts.',
      inputSchema: McpListDraftsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, explorationId, search, limit }) =>
      answer(async () => {
        const all = await ctx.drafts.list(ctx.member, status, explorationId)
        const found = all.filter(draft =>
          draftMatchesSearch(
            {
              listing: draft.listing,
              url: draft.url,
              dismissReason: draft.dismissReason,
            },
            search
          )
        )
        const items = found.slice(0, limit)
        const head = `${found.length} brouillon(s) « ${STATUS_LABELS[status]} »${search ? ` pour « ${search} »` : ''}${found.length > items.length ? ` (les ${items.length} plus récents)` : ''}.`
        return dataResult(
          [head, ...items.map(draft => `- ${describeDraft(draft)}`)].join('\n'),
          { total: found.length, items: items.map(withoutSender) }
        )
      })
  )

  server.registerTool(
    'get_draft',
    {
      title: 'Lire un brouillon',
      description:
        'Un brouillon complet : sa fiche pré-remplie (tous les champs et leur provenance), son lien, ce que Claude a lu sur la page, ses avertissements, ses doublons probables parmi les annonces suivies, la raison de son écart, le brouillon qui l’a absorbé, la proposition en cours ; à valider : son adéquation aux critères et ses chiffres avec les hypothèses de l’espace. `updatedAt` est à repasser en garde-fou à update_draft et merge_drafts. Lecture seule ; l’e-mail de l’expéditeur d’une alerte n’est jamais rendu.',
      inputSchema: McpGetDraftInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ draftId }) =>
      answer(async () => {
        const draft = await ctx.drafts.get(ctx.member, draftId)
        return dataResult(describeDraft(draft), withoutSender(draft))
      })
  )

  server.registerTool(
    'find_similar_drafts',
    {
      title: 'Brouillons qui se ressemblent',
      description:
        'Les brouillons qui ressemblent le plus à un brouillon (à valider et écartés par défaut, `statuses` pour d’autres), de la plus ressemblante à la moins ressemblante, avec la même règle que find_similar_listings (commune, quartier, surface, prix, pièces, étage, DPE, année, agence, référence, lien) mais sans distance : chacun porte un niveau, une note, ce qui concorde et ce qui diffère. Les brouillons déjà fusionnés dans un autre ne sont pas proposés. Une ressemblance n’est jamais une preuve : montrez les deux brouillons au membre avant merge_drafts. Pour comparer un brouillon aux annonces suivies : find_similar_listings avec `draftId`. Lecture seule.',
      inputSchema: McpFindSimilarDraftsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ draftId, statuses, limit }) =>
      answer(async () => {
        const result = await ctx.drafts.similar(
          ctx.member,
          draftId,
          statuses,
          limit
        )
        const head = result.items.length
          ? `${result.items.length} brouillon(s) ressemblant(s) sur ${result.compared} comparé(s) :`
          : `Aucun brouillon ne lui ressemble (${result.compared} comparé(s)).`
        return dataResult(
          [head, ...result.items.map(describeSimilarDraft)].join('\n'),
          result
        )
      })
  )

  server.registerTool(
    'update_draft',
    {
      title: 'Corriger un brouillon',
      description:
        'Corrige la fiche pré-remplie d’un brouillon à valider ou écarté, avant de le garder : seuls les champs de `patch` changent ; un sous-objet fourni (localisation, phase 2, travaux) remplace l’existant. Le statut ne se change pas ici (set_draft_status). Comme update_listing : le plafond d’encadrement, le loyer de marché et les sorties du géocodeur ne s’écrivent pas, une taxe foncière ou une part non récupérable de provenance « ai » n’est gardée qu’avec son extrait. Une localisation corrigée est replacée à la lecture ; les doublons probables sont recalculés. `provenance` : « ai » si vous avez lu la page, « user » si le membre a dicté. Garde-fou `expectedUpdatedAt` (lu avec get_draft ou list_drafts). Refusé (réponse lisible) pour un brouillon validé ou reconnu. Journalisé. Portée listings:write.',
      inputSchema: McpUpdateDraftInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ draftId, patch, expectedUpdatedAt, provenance }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        const draft = await ctx.drafts.update(
          ctx.member,
          draftId,
          { patch, expectedUpdatedAt },
          { channel: CHANNEL, provenance }
        )
        return dataResult(
          `Brouillon corrigé : ${describeDraft(draft)}`,
          withoutSender(draft)
        )
      })
  )

  server.registerTool(
    'set_draft_status',
    {
      title: 'Garder, écarter ou repêcher un brouillon',
      description:
        '`decision` : keep ajoute le brouillon à la liste (l’annonce est créée depuis la fiche pré-remplie, avec les liens des brouillons qu’il a absorbés) ; discard l’écarte (`reason` obligatoire, jamais reproposé à l’exploration) ; restore remet « À valider » un brouillon écarté (un brouillon absorbé redevient un brouillon à part). ' +
        'AVANT d’appeler : montrez le brouillon au membre et attendez son choix explicite ; passez alors `confirmedInChat: true`, sans quoi l’appel est refusé. Lot 21 : dans un espace où « Décider à plusieurs » est activé, keep et discard ne changent rien tout de suite : l’appel crée une proposition au nom du membre connecté, que les autres confirment dans l’application ; une proposition d’un autre membre déjà en cours bloque l’appel (Claude ne confirme jamais à sa place). Doublon probable d’une annonce suivie : préférez merge_draft_into_listing. Journalisé. Portée listings:write.',
      inputSchema: McpSetDraftStatusInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ draftId, decision, reason, confirmedInChat }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        if (!confirmedInChat) {
          return refusal(
            'Refusé : garder, écarter ou repêcher un brouillon demande l’accord du membre. Montrez-lui le brouillon (get_draft), attendez son choix, puis rappelez set_draft_status avec confirmedInChat: true. Rien n’a été modifié.'
          )
        }
        if (decision === 'restore') {
          const draft = await ctx.drafts.decide(
            ctx.member,
            draftId,
            { status: 'pending' },
            { channel: CHANNEL }
          )
          return dataResult(
            `Brouillon remis « À valider » : ${describeDraft(draft)}`,
            withoutSender(draft)
          )
        }
        const result = await ctx.decisions.decide(
          ctx.member,
          {
            target: { kind: 'draft', id: draftId },
            choice: decision,
            reason: reason ?? null,
          },
          CHANNEL
        )
        const draft = await ctx.drafts.get(ctx.member, draftId)
        const created =
          result.createdListing && result.listingId
            ? ` Annonce créée [id ${result.listingId}].`
            : ''
        return dataResult(
          `${result.message}.${created} ${describeDraft(draft)}`,
          {
            result,
            draft: withoutSender(draft),
          }
        )
      })
  )

  server.registerTool(
    'merge_draft_into_listing',
    {
      title: 'C’est la même : le brouillon est une annonce suivie',
      description:
        'Le brouillon à valider est le même bien qu’une annonce suivie (un de ses doublons probables, ou une annonce retrouvée par find_similar_listings avec `draftId`) : son lien est ajouté à la fiche (le prix lu devient celui de ce lien ; un lien déjà sur la fiche est vérifié), une autre agence lue est enregistrée avec sa référence, les faits lus s’appliquent par une vérification ; ni statut ni autre champ ne change. Les liens des brouillons qu’il a absorbés rejoignent aussi la fiche. Le brouillon passe « reconnu », lié à l’annonce. ' +
        'AVANT d’appeler : montrez le brouillon et l’annonce côte à côte au membre et attendez qu’il confirme que c’est le même bien ; passez alors `confirmedInChat: true`, sans quoi l’appel est refusé. S’applique tout de suite, même à plusieurs (comme dans l’application). Garde-fou `expectedListingUpdatedAt` (lu avec get_listing). Refusé (réponse lisible) pour une annonce fusionnée ou un brouillon déjà traité. Journalisé. Portée listings:write.',
      inputSchema: McpMergeDraftIntoListingInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ draftId, listingId, confirmedInChat, expectedListingUpdatedAt }) =>
      answer(async () => {
        const denied = writeRefusal(ctx.scopes)
        if (denied) return denied
        if (!confirmedInChat) {
          return refusal(
            'Refusé : dire qu’un brouillon est une annonce suivie demande l’accord du membre. Montrez-lui les deux (get_draft, get_listing), attendez qu’il confirme que c’est le même bien, puis rappelez merge_draft_into_listing avec confirmedInChat: true. Rien n’a été modifié.'
          )
        }
        const draft = await ctx.drafts.merge(
          ctx.member,
          draftId,
          { listingId, expectedUpdatedAt: expectedListingUpdatedAt },
          { channel: CHANNEL }
        )
        return dataResult(
          `C’est la même : ${draft.merge?.summary ?? 'fiche mise à jour'} — ${describeDraft(draft)}`,
          withoutSender(draft)
        )
      })
  )

  server.registerTool(
    'merge_drafts',
    {
      title: 'Fusionner deux brouillons du même bien',
      description:
        'Deux brouillons (à valider ou écartés) décrivent le même bien, souvent lu sur deux portails : `keepDraftId` reste, `mergeDraftId` y est fusionné. Le brouillon gardé l’emporte ; ses champs vides se complètent de l’autre (un champ déjà rempli n’est jamais écrasé ; le prix, la localisation et le vendeur seulement s’ils manquent), il reprend son lien s’il n’en avait pas. L’autre est écarté comme doublon (« Doublon du brouillon … »), lié au gardé : son lien rejoindra l’annonce créée quand le gardé sera ajouté à la liste (set_draft_status keep), ou la fiche suivie qui est la même (merge_draft_into_listing). Rien n’est supprimé ; repêcher l’absorbé (set_draft_status restore) en refait un brouillon à part. ' +
        'AVANT d’appeler : montrez les deux brouillons côte à côte au membre (get_draft, find_similar_drafts) et attendez qu’il confirme que c’est le même bien ; passez alors `confirmedInChat: true`, sans quoi l’appel est refusé. Gardez le brouillon le plus complet, ou celui à valider. Garde-fous : `expectedKeepUpdatedAt` et `expectedMergeUpdatedAt` (lus avec get_draft). Refusé (réponse lisible) pour un brouillon validé, reconnu ou déjà fusionné. Journalisé. Portée listings:write.',
      inputSchema: McpMergeDraftsInputSchema,
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
            'Refusé : fusionner deux brouillons demande l’accord du membre. Montrez-lui les deux brouillons (get_draft), attendez qu’il confirme que c’est le même bien, puis rappelez merge_drafts avec confirmedInChat: true. Rien n’a été modifié.'
          )
        }
        const result = await ctx.drafts.mergeDrafts(
          ctx.member,
          input.keepDraftId,
          input.mergeDraftId,
          {
            keepUpdatedAt: input.expectedKeepUpdatedAt,
            absorbUpdatedAt: input.expectedMergeUpdatedAt,
          },
          CHANNEL
        )
        return dataResult(
          [
            `Brouillons fusionnés : « ${result.absorbed.listing.title} » est écarté comme doublon de « ${result.kept.listing.title} ».`,
            result.fills.length
              ? `Complété : ${fieldLines(result.fills)}.`
              : 'Rien à compléter.',
            result.differences.length
              ? `Diffère (le brouillon gardé l’emporte) : ${result.differences.map(d => `${d.label} : ${d.kept ?? '—'} contre ${d.other ?? '—'}`).join(' ; ')}.`
              : null,
            `Gardé : ${describeDraft(result.kept)}`,
          ]
            .filter(Boolean)
            .join('\n'),
          {
            kept: withoutSender(result.kept),
            absorbed: withoutSender(result.absorbed),
            fills: result.fills,
            differences: result.differences,
          }
        )
      })
  )
}
