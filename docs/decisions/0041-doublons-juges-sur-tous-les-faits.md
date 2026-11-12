# 0041. Doublons jugés sur tous les faits : contradictions, score modulé, blocage à la création

Statut : acceptée, 12 novembre 2026. Précise 0028 (une annonce, plusieurs portails) et 0037
(fusion des doublons).

## Contexte

Deux défauts relevés à l'usage : des annonces sans rapport signalées comme doublons, et des
doublons créés quand même, puis fusionnés à la main. La règle de 0028 a été rejouée sur toutes les
paires d'un espace réel (41 annonces, dont deux fiches absorbées par une fusion) :

- **24 paires signalées, presque toutes à tort.** La plupart par « même commune, surface et prix
  proches » : dans une même ville, beaucoup de T3 font 55 à 70 m² pour 190 000 à 210 000 €. Les
  faits qui les distinguent étaient pourtant connus des deux côtés (3 pièces contre 4, 2e étage
  contre 7e, DPE C contre E), mais la comparaison ne les lisait pas.
- **« À 0 m » sans être voisines.** Deux annonces placées au centre du même quartier (lot 12) ont
  le même point : le voisinage à 50 m les rapprochait.
- **Trois lots d'un même immeuble** chez la même agence, chacun avec sa référence : « même adresse »
  les donnait pour doublons, alors que deux références de la même agence sont deux mandats.
- **Les vrais doublons étaient signalés, mais pas bloqués.** Le même bien, vu sur un deuxième puis
  un troisième portail par deux autres vendeurs, avait bien le motif « même commune, surface et
  prix » (mêmes valeurs exactes). Seuls le même lien et la même agence avec la même référence
  bloquaient la création : un doublon probable n'était qu'une ligne de la réponse, noyée parmi les
  faux.
- **Deux formes de lien Bien'ici** pour la même page (`/annonce/vente/<ville>/<type>/<pièces>/<id>`
  et `/annonce/<id>`) n'étaient pas reconnues comme le même lien.

## Décision

1. **Un fait contraire écarte un doublon probable** (`duplicateContradictions`, `domain`), s'il est
   connu des deux côtés : autre nombre de pièces, autre étage, surface à plus de 5 %, DPE à deux
   classes ou plus, construction à plus de trois ans, même agence avec une autre référence. Un
   doublon certain (même lien, même agence et même référence) le reste : ses faits contraires sont
   dits (`differences`), un membre tranche.
2. **Le score suit la ressemblance.** « Même commune, surface et prix » vaut de 0,8 (mêmes
   valeurs) à 0,6 (au bord des tolérances) ; un DPE à une classe ou un prix à plus de 5 % retirent
   0,15 chacun (`duplicateDifferences`). Sous 0,5 (`DUPLICATE_SCORES.minimum`), rien n'est rendu :
   « Déjà vue » (0037) reste là pour chercher plus large.
3. **Des motifs plus exigeants.** « Même adresse » demande un numéro (une rue n'est pas une
   adresse) ; le voisinage à 50 m ne vaut qu'entre deux repères à l'adresse (ni rue, ni quartier, ni
   commune) ; « même référence, autre agence » demande quatre caractères au moins (« 216 » chez deux
   agences est une coïncidence).
4. **Un doublon probable fort bloque la création** : à partir de 0,7 (`DUPLICATE_SCORES.blocking`,
   `blockingDuplicateOf`), `ListingsService.create` refuse (409, MCP : refus rendu en réponse) comme
   pour la même référence, et `ignoreDuplicates: true` passe outre quand le membre confirme que
   c'est une autre annonce. Le web reprend le refus existant (« C'est la même : ajouter ce lien »,
   « Créer quand même »). Un brouillon accepté passe outre les doublons qu'il montrait déjà.
5. **Les liens se comparent par leur identité** (`linkIdentity`) : les deux formes d'une page
   Bien'ici n'en font qu'une. Les clés enregistrées (`listing_links.normalized_url`) ne changent
   pas : aucune migration, la comparaison passe par l'identité des deux côtés.
6. **La sonde porte les faits** : `DuplicateProbe` gagne `precision`, `rooms`, `floor`, `dpeClass`,
   `constructionYear` ; `probeFromInput` les lit dans l'annonce à créer, `listingId` dans la fiche
   (vendeur et référence compris). La même règle sert à l'extraction, à la création, aux alertes
   e-mail, à l'exploration et à « Déjà vue ».

Écartée : une distance entre les zones des deux repères (contour du quartier). Les portails ne
nomment pas le même quartier pour le même bien (dans l'espace rejoué, un même appartement était
annoncé dans deux quartiers voisins) : la zone aurait écarté de vrais doublons.

## Conséquences

- Rejouée sur le même espace, la règle signale 7 paires au lieu de 24 : les deux doublons fusionnés
  à la main sont bloqués à la création (0,8), aucun des lots du même immeuble ni des T3 aux étages
  différents n'est signalé ; deux paires restent des signaux faibles (0,63), une paire où tout
  concorde (pièces, étage, DPE, surface et prix à 0,5 % près) bloque et sera tranchée par un membre.
- Une création par le connecteur peut être refusée là où elle passait : Claude montre le doublon au
  membre et ne repasse `ignoreDuplicates` qu'après son accord.
- Les jeux d'essai e2e qui créent exprès des annonces fictives semblables passent
  `ignoreDuplicates: true`.
- Code : `packages/domain/src/same-listing.ts` (`assessDuplicate`), `listing-urls.ts`
  (`linkIdentity`), seuils dans `packages/contracts/src/duplicates.ts` ; tests
  `packages/domain/test/duplicate-contradictions.spec.ts` et `apps/api/test/duplicates.e2e-spec.ts`.
