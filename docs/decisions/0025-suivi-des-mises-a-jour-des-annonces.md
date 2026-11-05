# 0025. Suivi des mises à jour : vérifications datées, faits appliqués, statut proposé, republication rattachée

Statut : acceptée, 6 novembre 2026.

## Contexte

Richard : « J'aimerais lui demander [à Claude] de faire une mise à jour des annonces
enregistrées, et qu'il y ait pour chaque annonce un suivi de ces mises à jour. » Rien ne disait
quand une annonce avait été revérifiée (`publishedAt` et `sourceUpdatedAt` existaient, pas de
date de vérification) ; revérifier demandait `get_listing`, `extract_listing`, une comparaison à
la main, `record_price_change` et `update_listing` ; une annonce retirée ne laissait ni date ni
preuve ; une annonce republiée (autre lien, autre prix) était vue comme doublon sans être
rattachée à l'ancienne, d'où la perte de la durée en ligne et des baisses passées, arguments de
négociation. Principe fixe : aucun scraping, le serveur ne télécharge jamais une page de portail.

## Décision

- **Une vérification est une ligne datée** (`listing_checks`) : auteur et canal (`mcp`, `web`),
  résultat (`unchanged`, `changed`, `offline`, `republished`, `inaccessible`), écarts (champ,
  avant, après, sort, phrase), résumé, extrait-preuve, URL consultée, annonce liée, statut
  proposé. Sur l'annonce, `last_checked_at` (toute vérification, même une page inaccessible : la
  tournée suivante ne s'acharne pas) et `last_seen_online_at`. Migration purement additive.
- **Les faits s'appliquent, le statut se propose.** `listingCheckDiff` (`domain`) ne compare que
  les champs fournis (un champ absent n'est pas un changement), à la tolérance d'arrondi près
  (`LISTING_CHECK_TOLERANCES` : prix et taxe à l'euro, charges à 12 €, surface au demi-mètre
  carré). Prix, charges, taxe, surface, pièces, DPE, GES, consommation, description, date de mise
  à jour et lien sont **appliqués** ; « plus en ligne » **propose** « Vendu ou retiré », jamais
  appliqué (le membre confirme, puis `set_listing_status`) ; une date de publication plus récente
  que celle enregistrée (annonce « remontée ») est **notée** et la première gardée, parce qu'elle
  compte dans la négociation. Le résultat déclaré doit coller à ce qui a été lu, sinon refus
  lisible ; sans déclaration, il est déduit.
- **Une transaction par vérification** : faits, historique des prix par la même écriture que
  `record_price_change` (`priceEventData`, source `listing`), dates, rattachement, ligne, journal
  `listing.checked` (sorte « Vérification ») et notifications ; puis plafond et marché si la
  surface ou les pièces changent, et critères. Garde-fous optimistes `expectedUpdatedAt`
  (obligatoire) et `expectedPrice`. Une vérification qui ne change aucun fait garde `updatedAt` :
  elle ne « modifie » pas la fiche et ne périme pas la lecture des autres.
- **Nouveautés et notifications** : une vérification qui trouve quelque chose (mise à jour, plus
  en ligne, republiée) est un changement de prix ou une « mise à jour d'annonce » dans « ce qui a
  changé », et une notification `listing_checked` pour les autres membres (vers l'onglet Suivi) ;
  une vérification inchangée ou une page inaccessible ne prévient personne.
- **Republication rattachée par une colonne** `republished_from_id` (unique) : une annonce reprend
  au plus une annonce et n'est reprise que par une, sans boucle ; la plus ancienne (première
  publication constatée, à défaut ajout) devient la publication d'origine, dans un sens comme
  dans l'autre. Le brief de négociation remonte la chaîne : durée en ligne depuis la publication
  d'origine, baisses cumulées (republier moins cher compte comme une baisse), argument
  « Annonce republiée ». La publication d'origine se voit proposer « Vendu ou retiré ».
- **MCP** : `check_listing` (lecture : écarts classés, résultat, statut proposé, doublons
  probables, garde-fous à repasser ; `pageText` passe par l'extraction existante, coût signalé),
  `apply_listing_check` (écriture), filtre `staleDays` et tri `lastCheckedAt` de `list_listings`,
  prompt `review_listings` (tournée : une annonce à la fois, lien ouvert dans le navigateur de
  l'utilisateur, arrêt sans contournement si un portail bloque, résumé et statuts à confirmer).
  31 outils, deux prompts.
- **Extrait-preuve** : 500 caractères au plus, téléphones et adresses e-mail masqués
  (`sanitizeEvidence`), pour ne pas garder les coordonnées d'un agent ou d'un vendeur.
- **Interface** : section « Mises à jour » de l'onglet Suivi (chronologie, extrait dépliable,
  annonce rattachée, « Vue en ligne aujourd'hui », « Plus en ligne » avec confirmation puis statut
  proposé) ; mention « Vérifiée il y a 3 j », « Page inaccessible… » ou « À revérifier » dans la
  liste et filtre « À revérifier » (7 jours, `DEFAULT_STALE_DAYS`) dans l'URL ; note de
  republication dans le brief.

## Conséquences

- Une annonce dit quand elle a été revérifiée, par qui, avec quel résultat et sur quelle preuve ;
  la file « à revérifier » se lit dans la liste et au MCP.
- Les statuts restent entre les mains des membres ; aucun outil ne supprime.
- Le format d'export reste en version 1 : trois colonnes CSV en fin de ligne, `checks` par
  annonce dans le JSON (absent d'un export antérieur).
- Limites : la vérification dépend de ce que Claude lit (un portail qui bloque reste « non
  vérifié ») ; le rattachement d'une republication est une décision (Claude ou le membre), jamais
  déduit d'office des doublons ; la description lue par l'extraction n'est pas comparée (le
  modèle la condense).
