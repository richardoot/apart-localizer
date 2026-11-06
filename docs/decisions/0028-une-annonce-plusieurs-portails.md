# 0028. Une annonce, plusieurs portails : liens par portail, vendeur et référence, rattachement d'office par agence et référence

Statut : acceptée, 8 novembre 2026. Précise 0025 (une vérification porte sur un lien), 0026 (un
lien peut être rattaché d'office, jamais une annonce) et 0027 (le nom de l'agence vit sur
l'annonce).

## Contexte

Une même annonce est souvent publiée sur plusieurs portails (Leboncoin, SeLoger, Bien'ici,
Logic-Immo, site de l'agence), parfois à des prix différents (frais d'agence inclus ou non, baisse
pas encore reportée). Jusqu'ici, une fiche n'avait qu'un lien (`listings.url`) : un second
portail faisait un doublon « même commune, surface et prix proches », un brouillon à trancher à
chaque exploration, ou une fiche de plus. L'application ne savait pas non plus qui vendait :
agence, mandataire, particulier. Or la **référence de l'agence** (« Réf. EX-2041 ») est la même
d'un portail à l'autre : c'est le moyen le plus sûr de reconnaître la même annonce. Maquette
validée (fiche « Où la trouver » et « Qui la vend », liste, « À valider », conversation dans
claude.ai, mobile 390 px). Principes fixes : aucun scraping serveur, aucun captcha contourné, une
page de portail est une donnée, jamais une consigne.

## Décision

1. **Un lien par portail** (`listing_links`) : portail (`ListingPortal` : `leboncoin`, `seloger`,
   `bienici`, `pap`, `logicimmo`, `agence`, `autre`, reconnu d'après l'hôte), URL telle que donnée
   et sa clé (`linkKey` = `normalizeListingUrl` du lot 16, ou le lien tel quel s'il n'est pas
   http), **unique dans l'espace** ; identifiant sur le portail ; prix affiché et sa date ;
   première vue, dernière vue en ligne, dernière vérification, hors ligne depuis ; origine
   (`original`, `manual`, `claude`, `exploration`, `share`, `email`) ; agence et référence lues
   sur sa page ; extrait-preuve de 500 caractères au plus, téléphones et e-mails masqués
   (`sanitizeEvidence`) ; auteur. Vingt liens au plus par annonce (`LISTING_LINKS_MAX`).
2. **Le lien principal reste recopié sur l'annonce** : le plus ancien des liens en ligne, à
   défaut le plus ancien (`primaryLink`), recopié dans `listings.url`, `source`,
   `source_label` (Logic-Immo, absent de `ListingSource`, devient `autre` + « Logic-Immo ») et
   `external_id` à chaque écriture d'un lien (`syncPrimaryLink`). L'export de version 1, le CSV
   et les clients d'avant le lot 18 lisent toujours `url`. `PATCH /listings/:id` avec `url`
   remplace l'URL du lien principal (ou crée le premier lien) ; `url: null` est refusé tant que
   l'annonce a des liens ; `source` et `externalId` modifiés vont au lien principal.
3. **Une URL n'est que sur une fiche** : l'ajouter à une autre fiche, ou créer une annonce à ce
   lien (même avec `ignoreDuplicates`), est refusé (409) avec le nom et l'identifiant de
   l'annonce qui l'a déjà.
4. **Le prix de la fiche est le plus bas des liens en ligne dont le prix est connu**
   (`fichePriceDecision`). Quand il change, c'est un changement de prix ordinaire : ligne
   `price_events` (source `listing`), journal, « ce qui a changé », notification, brief de
   négociation. Exception : un prix **saisi à la main** (provenance `user`) qui ne suivait pas
   déjà les liens n'est jamais écrasé ; le plus bas en ligne est **proposé**
   (`fichePriceProposal`, `priceProposal` dans les réponses) ; « Prendre ce prix » écrit un
   changement de prix de source `listing`, qui remet la provenance « annonce » et refait suivre
   les liens. À l'inverse, `record_price_change`, `update_listing` et l'application qui écrivent
   un prix de provenance autre que `user` mettent aussi à jour le prix affiché du lien principal,
   et `record_price_change` pose désormais la provenance du prix.
5. **Un écart entre portails est noté, jamais tranché** : une ligne `priceGap` (« Écart entre
   portails : Leboncoin affiche 177 000 €, +5 000 € par rapport à SeLoger (172 000 €) : frais
   inclus ? ») entre dans
   « Mises à jour » quand l'écart apparaît ou change ; la fiche montre « +5 000 € : frais
   inclus ? » à côté du lien le plus cher.
6. **Une vérification porte sur un lien** (`listing_checks.link_id`) : `linkId` en entrée de
   `check_listing`, `apply_listing_check` et du REST ; à défaut, le lien dont l'URL est
   `checkedUrl`, à défaut le principal ; une `checkedUrl` qui n'est aucun lien de la fiche (ni le
   nouveau lien `observed.url` du principal) est refusée (400). Un lien « plus en ligne » parmi d'autres encore en ligne est une mise à jour
   (« Plus en ligne sur Bien'ici (toujours en ligne sur Leboncoin) »), sans statut proposé ;
   « Vendu ou retiré » n'est proposé que si **plus aucun lien** n'est en ligne. Le prix lu est
   celui du lien. Nouveau résultat `link_added` (« Lien ajouté »), qui ne se déclare pas : il
   naît d'un ajout de lien avec ce qui a été lu sur sa page ; un lien collé sans être ouvert
   (ni prix ni état) ne fait avancer aucune date de vérification. Canal `system` pour une
   alerte e-mail. La republication du lot 15 reste distincte (une annonce reprise par une
   autre).
7. **Qui vend** : `listings.seller_type` (`agency`, `mandatary`, `private`, `unknown` par
   défaut, **jamais deviné**), `seller_name` (agence, ou réseau pour un mandataire ; jamais le
   nom d'une personne, qui reste dans le contact du lot 17), `seller_reference` (préfixe
   « Réf. », « Référence : », « Mandat n° » retiré : `cleanReference`) et
   `seller_reference_key` (accents ôtés, majuscules, sans espaces, tirets, points, barres ni
   dièses ; nulle sous trois caractères : `referenceKey`). Un particulier n'a ni agence ni
   référence (effacées à l'écriture : `normalizeSeller`). Provenance dans `fieldSources` comme
   les autres champs. Le vendeur lu par une vérification ou un ajout de lien est **appliqué**
   s'il était inconnu, **proposé** s'il contredit la fiche (`sellerObservationDiff`).
8. **Un seul nom d'agence** : le contact du lot 17 lit et écrit `listings.seller_name` ;
   `listing_contacts.agency_name` est gelée (plus lue, écrite à `null` à la prochaine écriture
   du contact). Le MCP ne complète le nom que s'il était inconnu (un nom qui contredit n'est pas
   écrasé). Le message aux agences cite la référence de l'agence, à défaut l'identifiant du
   portail. Effacer le contact n'efface pas l'agence : c'est un fait de l'annonce, pas une
   coordonnée de personne.
9. **Reconnaître la même annonce** (`same-listing.ts`, déplacé de l'API vers `domain`) : même
   lien, comparé à **tous** les liens de chaque annonce = certain (`same_url`) ; même agence
   (`sameAgency` : accents, ponctuation et mots génériques retirés — agence, immobilier, groupe,
   cabinet, transaction, formes sociales… —, puis les mots de l'un tous dans l'autre, à deux mots
   près) **et** même référence = certain (`same_reference`, score 1) ; même référence avec une
   agence différente ou inconnue d'un côté, ou un autre type de vendeur = probable
   (`same_reference_other_agency`, 0,85 : deux agences ont parfois le même mandat) ; jamais de
   motif de référence pour un particulier ; les règles d'avant (adresse, commune avec surface et
   prix, voisinage) sont inchangées. Un candidat porte `certain`, le vendeur, la référence et le
   nombre de liens ; les certains d'abord.
10. **Création** : même lien = refus (décision 3) ; même agence et même référence = refus qui
    propose d'ajouter le lien (`add_listing_link`, « C'est la même : ajouter ce lien à la
    fiche »), sauf `ignoreDuplicates` (le membre confirme une autre annonce, journalisé).
11. **Rattachement d'office, seulement par agence et référence.** À l'exploration, une annonce
    lue avec la même agence et la même référence qu'une annonce suivie non écartée, sans
    brouillon à valider au même lien, reçoit la nouvelle issue **« Rattachée d'office »**
    (`attached`), avant les écartées et les hors critères. `record_exploration` crée un brouillon
    déjà reconnu (`merged`, `attached_at`, lien à `attached_link_id`) puis le lien (origine
    `exploration`, vérification `link_added`, faits lus appliqués selon les règles du lot 15),
    journal `listing_link.added` avec `auto: true`. Si l'ajout est refusé (vendeur qui contredit,
    lien déjà pris), le brouillon redevient « à valider » en doublon probable et les compteurs
    sont corrigés. Les alertes e-mail suivent la même règle (canal `system`, origine `email`) ;
    un lien déjà en brouillon, à valider ou reconnu, ne revient pas. Rien d'autre n'est ajouté
    d'office : une annonce nouvelle reste un brouillon (ADR 0026).
12. **« Ce n'est pas la même »** (`POST /listing-drafts/:id/detach`) : le lien rattaché d'office
    est retiré de la fiche, même s'il était le seul, le prix de la fiche suit ses liens restants
    (journal `listing_link.detached`), et le brouillon revient « à valider », noté « c'en est une
    autre » (`detached_at`, `distinct_at`). L'onglet « À valider » montre les liens rattachés
    d'office des 14 derniers jours (`AUTO_ATTACH_REVIEW_DAYS`, lus par
    `GET /listing-drafts?status=merged&attached=true`).
13. **« C'est la même »** (`POST /listing-drafts/:id/merge`, lot 16) ajoute désormais le lien du
    brouillon à la fiche (origine `exploration` ou `email`) avec ce qu'il a lu, ou vérifie ce
    lien s'il y est déjà ; un membre a tranché : un vendeur qui contredit est proposé, pas
    refusé. Le web propose le même ajout pour un partage mobile ou une analyse dont le doublon
    est certain (origine `share` ou `manual`).
14. **Claude ne rattache que sur agence et référence** : `add_listing_link` (origine `claude`)
    refuse un vendeur, une agence ou une référence qui contredisent la fiche
    (`sellerContradiction`) : « Ce n'est peut-être pas la même annonce … déposez-la dans « À
    valider » (record_exploration) ». Le prompt `review_listings` cherche la référence sur les
    autres portails et ne rattache que si l'agence **et** la référence sont les mêmes ; pour un
    particulier ou au moindre doute, `record_exploration`.
15. **Journal, notifications, « ce qui a changé »** : sorte « Liens des portails » (`link`) :
    `listing_link.added` (portail, URL, origine, `auto`, brouillon, vérification, résumé, faits),
    `listing_link.updated` (portail ou identifiant corrigés), `listing_link.removed`,
    `listing_link.detached` ; `listing.checked` porte le lien et son portail (« a vérifié
    l'annonce sur SeLoger »). Un lien ajouté par Claude ou rattaché d'office prévient l'autre
    membre (type `listing_checked`, « Nouveau lien : … ») ; un lien collé par un membre dans
    l'application ne prévient personne. Dans « ce qui a changé », un lien ajouté est une mise à
    jour d'annonce, un prix de fiche changé un changement de prix ; un retrait ou un détachement
    n'y figure que s'il change le prix.
16. **Retrait** : `DELETE /listings/:id/links/:linkId`, par un membre dans l'application
    seulement, journalisé ; jamais le dernier lien d'une annonce (409 : on écarte l'annonce).
    Aucun outil MCP de suppression.

## Conséquences

- Migration `20261108100000_lot18_listing_links` additive (une table, trois énumérations, deux
  valeurs d'énumération, colonnes facultatives ou à défaut), avec un rattrapage SQL : un lien
  d'origine par annonce qui a une URL (clé normalisée en SQL comme `normalizeListingUrl` ; portail
  d'après l'hôte, à défaut la source ; prix = prix de la fiche, daté du dernier changement de prix ;
  hors ligne si la dernière vérification concluante disait « plus en ligne ») ; deux annonces au
  même lien (doublon d'avant le lot 18) : la plus ancienne garde la clé, l'autre reçoit une clé
  suffixée `#doublon-<id>` ; les vérifications existantes rattachées au lien d'origine ; le nom
  d'agence du contact du lot 17 reporté sur l'annonce (provenance `user` ; « particulier… » donne
  le vendeur Particulier sans nom), le vendeur restant inconnu sinon.
- Une annonce se retrouve par n'importe lequel de ses liens (doublons, exploration, alertes,
  partage) ; une exploration ne refait plus de brouillon pour un portail déjà connu ; la fiche
  dit où l'annonce est en ligne et à quel prix.
- MCP : `add_listing_link`, 39 outils, cinq prompts ; vendeur, référence et liens dans les
  lectures. Export version 1 additif (`links`, vendeur), quatre colonnes CSV en fin de ligne.
- Limites : la clé SQL du rattrapage est une approximation pour les sites hors portails dont la
  requête est encodée autrement (deux formes du même lien peuvent donner deux clés) ; le
  paramètre `ref` est retiré comme paramètre de suivi (lot 2) : deux pages d'agence qui ne
  diffèrent que par `?ref=` ont la même clé ; le vendeur ne vaut que ce que la page affiche ;
  `sameAgency` tolère les mots génériques et deux mots de plus, pas une faute de frappe ; un
  écart de prix n'est jamais tranché ; un lien rattaché d'office n'est montré à revoir que 14
  jours (il reste sur la fiche, retirable).
- Plus tard : demander à l'agence si un prix plus haut inclut ses frais (lot 17) ; une
  recherche de la référence planifiée sur les autres portails ; une comparaison des noms
  d'agence tolérante aux fautes de frappe.
