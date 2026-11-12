# 0043. Doublons confirmés dans l'application, fiche absorbée supprimée après sept jours

Statut : acceptée, 12 novembre 2026 (lot 30). Modifie 0037 (une fusion ne supprimait jamais la fiche
absorbée) et 0041 (un doublon probable fort bloquait aussi la création par le connecteur).

## Contexte

Depuis 0041, `create_listing` refuse une annonce dès qu'un doublon probable atteint 0,7 sans fait
contraire, et Claude doit demander au membre, dans la conversation, s'il s'agit du même bien. Le
membre répond alors à l'aveugle, sans les deux fiches sous les yeux ; et quand il répond plus tard,
la réponse se perd avec la conversation. Dans l'application, les fiches très proches n'étaient
signalées que dans la section discrète « Même bien, autre fiche ? » de l'onglet « Le bien ».

À côté, une fiche absorbée par une fusion restait en base pour toujours, cachée de partout. Rien
n'en sortait à l'écran, mais Richard la voulait supprimée : elle n'est plus utile une fois la fusion
sûre.

## Décision

1. **Au connecteur, un doublon probable devient une question.** `create_listing` passe
   `askDuplicates` : une annonce dont un doublon probable atteint `DUPLICATE_SCORES.blocking` est
   créée, et chaque paire (`duplicatesToAsk`) est enregistrée « à confirmer » dans
   `duplicate_pairs` (une ligne par paire, `listing_a_id` < `listing_b_id`, `duplicatePairOf`). La
   réponse le dit à Claude, qui le dit au membre. Un doublon certain (même lien, même agence et
   même référence) bloque toujours : il n'y a rien à demander, Claude ajoute le lien à la fiche
   existante. `ignoreDuplicates: true` (le membre a déjà dit que c'est une autre annonce) ne pose
   aucune question.
2. **L'application pose la question sur les deux fiches.** `EvaluatedListing.duplicateQuestions`
   porte les questions en attente dont l'autre fiche est suivie ; `DuplicateQuestions.vue` les
   affiche en haut de la fiche : « Claude a enregistré cette annonce alors qu'elle ressemble beaucoup
   à « … ». Est-ce le même bien ? ». **Oui, comparer et fusionner** ouvre l'aperçu de la fusion
   (0037), qui tranche la question en effaçant la paire ; **Non, deux biens différents**
   (`POST /listings/:id/duplicate-distinct`) la déclare distincte, journalisé des deux côtés
   (`listing.duplicate_denied`).
3. **Une paire distincte ne revient plus.** Elle sort des doublons (`DuplicatesService.find`
   par une fiche enregistrée) et des suggestions de fusion sans recherche
   (`SimilarListingsService`) ; elle se retrouve en la cherchant, et une fusion reste possible.
   « Créer quand même » dans le formulaire ne tranche rien : seul le « Non » d'un membre déclare
   deux fiches distinctes.
4. **Le formulaire de l'application garde son blocage** (0041) : le membre est là, le bandeau lui
   montre la ressemblance au moment de créer.
5. **La fiche absorbée est supprimée sept jours après la fusion**
   (`MERGED_LISTING_RETENTION_DAYS`). D'ici là, la fusion s'annule dans l'application comme avant ;
   la fiche gardée dit jusqu'à quand (`undoUntil`, `mergeUndoText`) ; ensuite l'annulation est
   refusée (`mergeUndoRefusal`, 409) et le bouton disparaît. La suppression
   (`purgeExpiredMerges`) a lieu à la création d'une annonce et à chaque fusion de l'espace, sans
   tâche planifiée : une fiche absorbée est déjà cachée partout, la supprimer un peu plus tard ne
   change rien de visible. Ce qui était passé à la fiche gardée (liens, visites et photos, offres,
   avis, tâches, agences, questions aux agences) y reste ; ce qui était resté sur la fiche absorbée
   (son historique des prix, son journal, les avis et tâches non repris) part avec elle par les
   clés étrangères, comme la ligne de la fusion. Le journal de la fiche gardée garde la phrase de
   la fusion.
6. **Le connecteur ne supprime toujours rien.** La suppression est faite par l'application, sept
   jours après une fusion accordée par un membre ; aucun outil MCP ne supprime ni n'annule.

## Options écartées

- **Supprimer la fiche absorbée au moment de la fusion** : une fusion se fait souvent d'un clic au
  téléphone, et une erreur ne se rattraperait plus.
- **Une tâche planifiée (Vercel Cron)** pour la purge : une route protégée, un secret et une
  configuration de plus pour un effet invisible ; la purge à l'écriture suffit.
- **Une tâche « Vérifier le doublon » dans « À faire »** : la question vit sur les deux fiches,
  une tâche cochée sans réponse la contredirait.

## Conséquences

- Migration additive `20261114100000_lot30_duplicate_questions` : la table `duplicate_pairs` et
  l'énumération `DuplicatePairVerdict`, une contrainte `CHECK` écrite à la main.
- Une fiche fusionnée depuis plus de sept jours n'existe plus : son lien direct mène à « annonce
  introuvable », et l'export ne la contient plus.
- Code : `contracts/src/duplicates.ts` (`DuplicateQuestionSchema`, `DuplicateDistinctInputSchema`),
  `contracts/src/listing-merge.ts` (`MERGED_LISTING_RETENTION_DAYS`, `undoUntil`),
  `domain/src/same-listing.ts` (`duplicatesToAsk`, `duplicatePairOf`, `duplicateQuestionText`),
  `domain/src/listing-merge.ts` (`mergeUndoUntil`, `mergeUndoRefusal`, `mergePurgeBefore`,
  `mergeUndoText`), `api/src/listings/merge-purge.ts`, `listings.service.ts` (`askDuplicates`),
  `listing-merge.service.ts` (`declareDistinct`), `web/src/components/merge/DuplicateQuestions.vue`.
