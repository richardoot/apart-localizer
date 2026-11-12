# 0044. Les brouillons au connecteur : lire, corriger, décider, fusionner deux brouillons

Statut : acceptée, 12 novembre 2026 (lot 31). Étend 0026 (le connecteur ne faisait que créer des
brouillons « À valider ») et 0031 (garder ou écarter un brouillon passe par la décision à
plusieurs, au connecteur comme dans l'application).

## Contexte

Le connecteur lisait et modifiait les annonces, mais ne voyait pas les brouillons : les annonces
reçues par alerte e-mail ou trouvées par Claude en explorant les portails, qui attendent « À
valider », et celles écartées des archives. Chercher des doublons parmi les brouillons écartés
demandait d'ouvrir l'application, et Claude ne pouvait ni corriger une valeur mal lue, ni garder,
écarter ou rapprocher un brouillon à la demande d'un membre. Deux brouillons du même bien, lu sur
deux portails, ne pouvaient pas être réunis.

## Décision

1. **Lire** : `list_drafts` (par statut : à valider, écartés, reconnus, validés ; recherche texte
   par `draftMatchesSearch`), `get_draft`. Une réponse ne porte jamais l'e-mail de l'expéditeur
   d'une alerte (`emailFrom`), donnée d'un tiers.
2. **Comparer** : `find_similar_drafts` classe les brouillons entre eux par la règle des annonces
   (`rankSimilarListings`, sans distance : le repère d'un brouillon n'est pas en base
   géographique) ; `find_similar_listings` accepte `draftId` pour comparer un brouillon aux
   annonces suivies.
3. **Corriger** : `update_draft` modifie la fiche pré-remplie d'un brouillon à valider ou écarté,
   sous le garde-fou `expectedUpdatedAt` (nouvelle colonne `listing_drafts.updated_at`), avec les
   règles de l'ADR 0040 (`connectorListingUpdate`) ; les doublons sont recalculés, une localisation
   corrigée est replacée à la lecture. Journal `draft.updated`.
4. **Décider** : `set_draft_status` garde (l'annonce est créée), écarte (raison obligatoire) ou
   repêche, seulement avec `confirmedInChat: true`. Garder et écarter passent par
   `DecisionsService.decide` : à plusieurs, une proposition au nom du membre connecté ; une
   proposition d'un autre membre bloque l'appel. Le journal porte le canal `mcp`
   (`DraftWriteOptions.channel`).
5. **« C'est la même »** : `merge_draft_into_listing` reprend `DraftsService.merge` (lien ajouté à
   la fiche, faits appliqués par une vérification), avec `confirmedInChat: true` ; il s'applique
   tout de suite, comme dans l'application.
6. **Fusionner deux brouillons** : `merge_drafts`, avec `confirmedInChat: true` et un garde-fou
   par brouillon. Le gardé l'emporte, ses vides se complètent de l'autre (`draftMergePlan` : les
   champs d'une fusion de fiches, plus le prix, la localisation et le vendeur quand ils manquent),
   il reprend son lien s'il n'en avait pas. L'autre est écarté (« Doublon du brouillon … »), lié au
   gardé (`listing_drafts.merged_into_draft_id`) ; son lien rejoint l'annonce créée depuis le gardé,
   ou la fiche suivie qui est la même. Rien n'est supprimé : repêcher l'absorbé en refait un
   brouillon à part. Journal `draft.absorbed`.

## Options écartées

- **Étendre `list_listings`, `get_listing` et `update_listing` aux brouillons** : un brouillon n'a
  ni statut d'annonce, ni indicateurs enregistrés, ni liens ; mélanger les deux formes aurait rendu
  chaque réponse ambiguë.
- **Fusionner deux brouillons sans accord** : comme pour les fiches (0037), réunir deux biens est
  une décision du membre.
- **Supprimer le brouillon absorbé** : un brouillon écarté sert à ne pas reproposer l'annonce à
  l'exploration ; il est gardé.

## Conséquences

- Migration additive `20261115100000_lot31_drafts_mcp` : deux colonnes, un index ; `updated_at` des
  brouillons existants vaut leur date de décision, sinon de réception.
- Quarante-neuf outils au connecteur.
- Code : `contracts/src/drafts.ts` (`DraftUpdateSchema`, `SimilarDraftSchema`, `updatedAt`,
  `mergedIntoDraftId`), `contracts/src/mcp.ts` (les sept entrées), `domain/src/draft-merge.ts`,
  `api/src/inbound/drafts.service.ts` (`update`, `mergeDrafts`, `similar`, liens des brouillons
  absorbés), `api/src/mcp/mcp-drafts.ts`.
