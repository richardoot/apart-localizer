# 0045. Brouillons absorbés : cachés tout de suite, supprimés après sept jours

Statut : acceptée, 13 novembre 2026 (lot 31, suite). Modifie 0044 (un brouillon absorbé restait
dans les archives pour toujours), sur le modèle de 0043 (fiches absorbées).

## Contexte

Après la première fusion de brouillons en production, les brouillons absorbés restaient visibles
dans les archives, avec « Doublon du brouillon … » pour raison : la page ne changeait pas, et
Richard a demandé qu'un brouillon fusionné soit supprimé. La fusion remplaçait aussi la raison
d'écart de l'absorbé (« Vendu loué » s'était perdu). Un brouillon écarté sert pourtant à ne pas
reproposer l'annonce à l'exploration : le supprimer sans garder son lien l'aurait fait revenir.

## Décision

1. **Caché tout de suite** : `DraftsService.list` ne rend plus un brouillon absorbé
   (`merged_into_draft_id`), ni aux archives, ni au connecteur, ni dans le compte des brouillons
   écartés du brief d'exploration.
2. **Son lien passe au gardé** : `listing_drafts.merged_links` (`DraftMergedLinkSchema`) garde, sur
   le brouillon gardé, le lien de chaque absorbé, son portail, ses faits lus, son vendeur et sa
   raison d'écart d'avant la fusion. L'annonce créée depuis le gardé, ou la fiche qui est la même,
   reçoit ces liens ; le tri de l'exploration et les alertes e-mail les reconnaissent comme ceux
   du gardé.
3. **Supprimé après sept jours** (`merged_at`, `MERGED_LISTING_RETENTION_DAYS`) : par
   `purgeExpiredMerges`, à la création d'une annonce et à chaque fusion de fiches ou de
   brouillons, comme les fiches absorbées. D'ici là, « Repêcher » refait un brouillon à part (son
   lien quitte le gardé) ; ensuite il est refusé.
4. **La ligne du gardé le dit** : « + 2 liens fusionnés : Leboncoin, SeLoger », et les raisons
   d'écart des absorbés qui disent autre chose que la sienne.
5. **Le connecteur ne supprime rien** : la suppression est celle de l'application, sept jours
   après une fusion accordée par un membre.

## Conséquences

- Migration additive `20261116100000_lot31_absorbed_drafts` (deux colonnes) ; les fusions déjà
  faites sont reprises : `merged_at` = date de la fusion, liens recopiés sur le gardé avec la raison
  d'écart retrouvée dans le journal.
- Code : `contracts/src/drafts.ts` (`DraftMergedLinkSchema`, `mergedAt`, `mergedLinks`),
  `api/src/inbound/draft-merged-links.ts`, `drafts.service.ts`, `listings/merge-purge.ts`,
  `exploration/exploration-triage.service.ts`, `inbound/inbound.service.ts`,
  `web/src/lib/workflow.ts` (`mergedLinksText`).
