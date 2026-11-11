# 0037. Fusionner les doublons, plusieurs agences pour un même bien, « Déjà vue » : une fusion qui ne supprime rien et s'annule

Statut : acceptée, 11 novembre 2026. Précise 0028 (une annonce, plusieurs portails : le vendeur
n'est plus unique, une agence qui contredit n'est plus toujours « à vérifier »), 0026 et 0031 (le
tri : « C'est la même » ne se limite plus aux doublons probables). La règle « pas de suppression
par le MCP » tient : une fusion n'en est pas une.

## Contexte

Le lot 18 reconnaît la même annonce sur un autre portail quand l'agence **et** la référence sont
les mêmes, et rattache alors un lien. Trois cas restaient sans réponse :

- **Deux fiches pour le même bien.** Une annonce saisie deux fois, ou validée depuis « À
  valider » avant qu'on la reconnaisse : rien ne permettait de réunir les deux fiches. On en
  écartait une, en perdant ses liens, ses visites et ses avis.
- **Un bien, plusieurs agences.** Un mandat simple est confié à plusieurs agences, chacune avec
  sa propre référence ; le propriétaire vend parfois aussi en direct. Une fiche ne portait qu'un
  vendeur : la seconde agence était « à vérifier » à chaque lecture, son lien refusé à Claude, et
  sa référence, perdue, ne servait pas à reconnaître l'annonce.
- **« On l'a déjà vue. »** Dans le tri, une annonce déjà vue (souvent déjà écartée) ne se
  rattachait à sa fiche que si le serveur l'avait proposée comme doublon probable. Sans adresse et
  avec un prix qui a bougé, il ne la proposait pas, et rien ne permettait de la chercher.

## Décision

1. **Une fusion garde une fiche et absorbe l'autre, sans rien supprimer.** `POST
/listings/:id/merge` (`absorbedId`) : la fiche `:id` est gardée. La fiche absorbée reste en
   base : écartée (`discarded`, raison « Doublon de « … » (fiches fusionnées) »), liée à la fiche
   gardée (`listings.merged_into_id`, `merged_at`) et **cachée de toutes les listes**, archives
   comprises, des compteurs des étapes, des doublons, de l'exploration et de l'export. Elle reste
   lisible par son lien, avec un bandeau qui mène à la fiche gardée.
2. **Ce qui rejoint la fiche gardée** (une transaction) : ses liens avec leurs vérifications ;
   ses agences et leurs références (décision 6) ; ses visites (photos comprises), offres, questions
   aux agences ; ses avis, sauf celui d'un membre qui en a déjà un sur la fiche gardée ; ses
   tâches, sauf celles que la fiche gardée a déjà (même libellé, casse et accents ignorés ; une
   tâche liée à une question ou à une visite suit toujours) ; son contact, ses travaux et sa phase
   2 si la fiche gardée n'en a pas ; ses brouillons reconnus et ses lignes d'exploration. Ses notes
   sont recopiées à la suite, sous un en-tête. **Ne bougent pas** : son historique des prix, son
   journal, ses « vu par », son adéquation aux critères.
3. **La fiche gardée l'emporte, ses vides se complètent.** Un champ du bien déjà rempli n'est
   jamais écrasé ; un champ vide reçoit la valeur de l'autre fiche avec sa provenance
   (`MERGE_FILL_FIELDS`, `mergeFieldPlan`). Ni le prix, ni l'adresse et le repère (ils se
   corrigent sur la fiche, avec le géocodage), ni le statut. Le prix suit la règle du lot 18 : le
   plus bas des liens en ligne, liens reçus compris (`fichePriceDecision`), jamais à la place
   d'un prix saisi à la main ; un changement est une ligne ordinaire de l'historique des prix.
4. **Une fusion s'annule**, dans l'application seulement (`POST /listing-merges/:mergeId/undo`).
   `listing_merges` garde ce qui est passé d'une fiche à l'autre (`moved` : identifiants par
   table, champs complétés, bloc de notes, état d'avant). L'annulation rend ce qui est encore sur
   la fiche gardée, vide les champs complétés **qui portent encore la valeur reçue**, retire les
   notes recopiées si elles n'ont pas été retouchées, et rend à la fiche absorbée son statut. Ce
   qui a été ajouté depuis sur la fiche gardée y reste. Refusée si la fiche gardée a elle-même été
   fusionnée ailleurs.
5. **Laquelle garder** : l'aperçu (`GET /listings/:id/merge-preview?with=`) propose la plus
   avancée dans le parcours, puis celle qui porte le plus de suivi, puis la mieux placée sur la
   carte, puis la plus ancienne (`suggestKeep`) ; le membre choisit. Il montre ce qui rejoint la
   fiche, les champs complétés, ceux qui diffèrent, les agences, ce qui reste, et pourquoi une
   fusion est impossible (`mergeRefusal` : une fiche déjà fusionnée, plus de vingt liens à deux).
6. **Plusieurs agences** (`listing_sellers`) : l'agence principale reste sur l'annonce
   (`seller_type`, `seller_name`, `seller_reference`, lus par le contact du lot 17, l'export et les
   clients existants) ; les **autres** agences s'ajoutent à côté, chacune avec son type, son nom,
   sa référence et sa clé, et son origine (`manual`, `claude`, `link`, `merge`). Huit au plus. Un
   particulier qui vend en direct en parallèle est une ligne sans nom ni référence. Deux vendeurs
   sont le même (`sameSeller`) si l'agence est la même et que les références ne se contredisent
   pas ; une même agence avec deux références fait deux lignes, chaque référence servant à
   reconnaître l'annonce. Une fiche qui ne sait rien de son vendeur reçoit l'agence comme
   principale.
7. **La référence de chaque agence reconnaît l'annonce.** Le motif « même agence, même
   référence » (certain) et le rattachement d'office comparent la sonde à toutes les agences de la
   fiche (`referenceReason`). `add_listing_link` de Claude n'est plus refusé quand la page montre
   une des autres agences (`sellerContradictionAmong`) ; une vérification d'un lien qui montre une
   autre agence de la fiche ne propose plus de changer le vendeur.
8. **Quand un membre a tranché, l'agence qui diffère est enregistrée.** Un lien rattaché dans
   l'application, « C'est la même » sur un brouillon ou un partage : l'agence et la référence lues
   qui contredisent la principale ne sont plus « proposées, à vérifier » ; elles deviennent une
   autre agence de la fiche (`sellerObservationAmong`, écart `otherSeller` appliqué, origine
   `link`). Pour Claude et les rattachements d'office, rien ne change : refus.
9. **« Déjà vue »** (`GET /listings/similar`) : les annonces de l'espace, **écartées comprises**,
   classées par ressemblance avec une annonce, un brouillon ou des caractéristiques lues. La note
   (0 à 1) est la moyenne pondérée des caractéristiques connues des deux côtés (commune 2, quartier
   1, distance 3, surface 3, prix 3, pièces 1,5, étage 1, DPE 1, année 0,5, même agence 1 ;
   surface comparée jusqu'à 15 % d'écart, prix 20 %, distance 1 km), rabattue quand peu de faits
   sont comparables ; un motif de doublon du lot 18 fixe un plancher (son score), un motif certain
   donne 1. Quatre niveaux : la même annonce, très proche (0,75), proche (0,5), peu ressemblante ;
   sous 0,35 une annonce n'est proposée que si le texte cherché la désigne. Le texte (titre,
   commune, quartier, adresse, agences, références, prix, surface) **filtre**, le classement reste
   celui de la ressemblance. Chaque annonce dit ce qui concorde et ce qui diffère. La distance
   n'est comptée qu'entre deux repères plus précis que la commune.
10. **Dans le tri** : « Déjà vue ? La retrouver » (touche D) ouvre cette recherche pour la carte.
    « C'est la même » rattache un brouillon à l'annonce retrouvée (`POST
/listing-drafts/:id/merge` accepte désormais toute annonce de l'espace, plus seulement un
    doublon probable), ou fusionne l'annonce de la carte **dans** l'annonce retrouvée (c'est elle,
    déjà vue, qu'on garde) ; « Annuler » défait la fusion. Le bilan compte les « déjà vues ».
11. **Dans la fiche** : « Même bien, autre fiche ? » (onglet « Le bien ») signale les fiches très
    proches, ouvre la recherche puis l'aperçu, liste les doublons fusionnés avec « Annuler la
    fusion ». « Qui la vend » liste les autres agences, en ajoute, en retire.
12. **Au connecteur**, trois outils (42) : `find_similar_listings` (lecture), `merge_listings` et
    `add_listing_seller` (écriture). Les deux écritures exigent `confirmedInChat: true` : Claude
    montre les deux fiches, le membre confirme que c'est le même bien, sinon refus en réponse.
    Garde-fous `updatedAt` des deux fiches. **Ni annulation de fusion ni retrait d'agence par le
    connecteur.**
13. **Une fiche fusionnée ne s'écrit plus** tant que la fusion n'est pas annulée : statut,
    modification, ajout de lien et nouvelle fusion sont refusés (409) avec le nom de la fiche
    gardée.
14. **Journal et notifications** : `listing.merged` sur la fiche gardée (résumé, compteurs, prix
    avant et après s'il change), `listing.absorbed` sur l'autre, `listing.unmerged` et
    `listing.unabsorbed` à l'annulation, `listing.seller_added` et `listing.seller_removed`. Une
    fusion prévient les autres membres, d'où qu'elle vienne (« Fiches fusionnées : … ») : une fiche
    qu'ils connaissent disparaît des listes. Dans « ce qui a changé », c'est une mise à jour de la
    fiche gardée, ou un changement de prix.

## Conséquences

- Migration `20261113100000_lot27_listing_merge` additive : deux colonnes facultatives sur
  `listings`, les tables `listing_sellers` et `listing_merges`, une énumération. Aucune donnée
  existante modifiée.
- « Pas de suppression par le MCP » tient : `merge_listings` ne supprime rien et se défait dans
  l'application.
- Une proposition en cours sur la fiche absorbée (lot 21) devient caduque. Fusionner n'est pas
  « écarter » : c'est un fait (« c'est la même »), appliqué tout de suite comme au lot 18, sans
  accord à plusieurs ; l'autre membre est prévenu et peut annuler.
- L'export JSON gagne `sellers` par annonce (liste vide par défaut) ; une fiche absorbée n'est
  pas exportée. Le CSV ne change pas.
- Limites : l'adresse et le repère de la fiche gardée ne changent pas (à corriger ensuite si
  l'autre était mieux placée) ; pas de choix champ par champ (la fiche gardée l'emporte, les
  écarts sont montrés avant) ; l'historique des prix de la fiche absorbée reste sur elle ; un
  avis ou une tâche en double n'est pas repris ; la ressemblance n'est pas une preuve, elle
  classe ; `sameAgency` ne tolère toujours pas une faute de frappe ; l'agence principale ne se
  permute pas avec une autre (on la corrige dans « Qui la vend »).
- Plus tard : choisir une valeur champ par champ à la fusion ; faire d'une autre agence la
  principale ; proposer les fiches très proches dès la liste ; fusionner depuis la comparaison.
