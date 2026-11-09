# Feuille de route

Lots courts, chacun livrable et testé. Les numéros renvoient aux besoins de
[etude-du-besoin.md](etude-du-besoin.md). Lancement validé le 3 novembre 2026.

État au 9 novembre 2026 : **les lots 0 à 20 sont livrés** côté code, tests et documentation ; les
lots 0 à 17 sont déployés (Vercel et Supabase cloud ; imports du lot 11, `import:places` et
`relocate:listings` du lot 12 faits en production ; migrations des lots 14 à 17 appliquées, le
rattrapage `refresh:criteria-fit` attend les critères de Richard). Le lot 18 (une annonce,
plusieurs portails) attend son déploiement : migration additive
`20261108100000_lot18_listing_links`, avec le rattrapage des liens d'origine des annonces
existantes dans la migration, sans variable ni import nouveau. Le lot 19 (une fiche, sept
questions) attend aussi son déploiement, sans migration. Le lot 20 (nos avis, critère par
critère) attend son déploiement : migration additive `20261110100000_lot20_opinion_criteria`,
sans rattrapage ni variable nouvelle. Restent les actions
d'exploitation (Supabase cloud, Vercel, clés et connecteur :
[docs/deploiement.md](../deploiement.md) § 11), ce qui est noté « plus tard » dans chaque lot, et
les critères « Fini quand » qui demandent le déploiement ou un usage réel (lot 1 : déploiement et
mobile de Chloé ; lot 2 : dix essais d'extraction ; lot 6 : push et partage sur les vrais
téléphones ; lot 8 : une vraie troisième adresse Google ; lot 9 : une lecture de fiche par
Richard et Chloé, sur ordinateur et sur téléphone ; lot 10 : un périmètre dessiné par Richard
sur la photo aérienne, sur le site déployé ; lot 11 : les imports faits sur la base de
production et l'onglet Quartier des annonces réelles relu par Richard ; lot 12 : le
rattrapage relu en simulation puis passé sur la production, et les quartiers retenus relus par
Richard ; lot 14 : les critères de Richard créés sur le site déployé et les deux onglets relus ;
lot 16 : une vraie exploration lancée depuis claude.ai dans le navigateur de Richard et l'onglet
« À valider » relu à deux ; lot 17 : une vraie série de questions envoyée par Claude après
validation, et sa réponse enregistrée ; lot 18 : une vraie tournée qui retrouve une annonce
d'agence sur un deuxième portail par sa référence ; lot 19 : une lecture des sept onglets par
Richard et Chloé sur ordinateur et sur téléphone ; lot 20 : une vraie visite notée à deux, à
l'aveugle, puis confrontée), à constater après la mise en ligne.

## Lot 0 : socle

Statut : livré.

- Monorepo pnpm, `tsconfig.base.json`, ESLint, Prettier, husky, CI GitHub Actions.
- `packages/domain` : portage de `compute`, des contrôles de louabilité et du verdict de
  l'artefact ; exemple chiffré du modèle de calcul et annonces réelles exportées comme jeux de
  tests.
- `packages/contracts` : schémas `Listing`, `Assumptions`, `RentalPlan`, `Renovation`, `Opinion`,
  `Task`, `SearchCriteria`, GeoJSON, avec provenance par champ.
- `apps/api` : NestJS, Prisma 7 avec `adapter-pg`, migration initiale avec PostGIS et index
  GiST, module `geo` (point dans un rayon, point dans un périmètre) avec ses tests e2e, auth
  Supabase, `/health`, journal de requêtes, en-têtes de sécurité, `nestjs-zod` et OpenAPI.
- Supabase CLI en local ; `.env.example` par application.
- Script d'import des données de l'artefact (collection `annonces`, réglages de financement),
  géocodage des adresses connues.

Fini quand : `pnpm test` passe, l'exemple chiffré est reproduit au centime, les annonces actuelles
sont en base locale avec leur point géographique.

## Lot 1 : MVP, parité avec l'artefact, carte et MCP

Statut : livré.

- Besoins C1, C2, S1 à S3, E1, E2, L1, K1 à K3, G1, G2.
- `apps/web` : connexion, synthèse, tableau comparatif et cartes, carte MapLibre des annonces
  avec filtre par point et rayon, filtres, panneau de fiche avec aperçu en direct, hypothèses,
  travaux, phase 2, avis, tâches.
- MCP : `list_listings` (dont point et rayon), `get_listing`, `get_assumptions`,
  `evaluate_listing`, `create_listing`, `update_listing`, `set_listing_status`, `add_opinion`,
  `add_task`, `complete_task` ; OAuth avec portées ; connecteur déclaré dans claude.ai.
- Déploiement Vercel + Supabase cloud, Sentry.

Fini quand : l'artefact peut être abandonné ; une annonce ajoutée par Claude depuis le navigateur
apparaît sur la carte et sur le mobile de Chloé comme « nouvelle ».

## Lot 2 : normalisation assistée par IA

Statut : livré.

- Besoins C3 (prompt MCP « analyser cette annonce »), C4, C5, C6, C7.
- Extraction serveur depuis texte collé et captures ; fiche pré-remplie à valider ; provenance et
  confiance affichées ; champs manquants en tâches ; doublons détectés à la création ; géocodage
  de l'adresse extraite.

Fini quand : une annonce collée depuis Leboncoin est enregistrée en moins d'une minute avec moins
de trois corrections manuelles en moyenne sur dix essais.

## Lot 3 : prix cible et négociation

Statut : livré.

- Besoins N1 à N3, S5, C8, E5.
- Prix cible par critère, décote, classement ; tableau de sensibilité ; historique des prix et des
  offres ; frais de notaire par barème ; `get_target_price` et `record_offer` dans le MCP.

Fini quand : la fiche répond « à partir de quel prix » et la propriété `rdtBrut(prixCible) = s_b`
est testée.

## Lot 4 : critères géographiques et données ouvertes

Statut : livré.

- Besoins G3 à G7, D1 à D5 et D7, L2, L3, N4 ; Géorisques (D6) passe au lot 5 avec la
  checklist réglementaire (ADR 0011).
- Critères de recherche enregistrés et partagés ; périmètre dessiné (terra-draw) ; isochrones
  Géoplateforme ; alertes à l'entrée d'une annonce dans un critère, y compris à la création par
  le MCP ; `list_search_criteria`, `create_search_criteria`, `update_search_criteria`.
- Géocodage systématique, DPE ADEME, plafond d'encadrement automatique ; import des arrêts TBM
  et distance au tram ; import DVF Gironde et comparables dans un rayon ; couches de carte.

Fini quand : un polygone dessiné filtre la liste, la carte et le MCP de façon identique ; saisir
une adresse remplit coordonnées, DPE vérifié, plafond et arrêt le plus proche ; les comparables
DVF du quartier s'affichent avec leur date.

## Lot 5 : phase 1 et phase 2 avancées

Statut : livré.

- Besoins E3, E4, E6, E7, L4, L5, D6.
- Coût d'occupation contre loyer actuel, scénarios « et si » enregistrables, fiscalité estimée,
  TRI et revente, loyer de marché par comparables saisis, checklist réglementaire datée
  (risques Géorisques à l'adresse compris).
- `evaluate_scenario`, `get_projection`, `get_compliance` et `add_rent_comparable` dans le MCP
  (25 outils) ; paramètres fiscaux et règles réglementaires datés et sourcés (ADR 0012, 0013).

Fini quand : la fiche dit ce que coûte la phase 1 par rapport au loyer actuel, compare un
scénario à la base en direct, projette jusqu'à la revente avec un TRI avant et après impôt par
régime (« estimation, pas un conseil fiscal »), calcule le loyer de marché de cinq comparables et
liste les points réglementaires datés et sourcés à la date de mise en location, risques à
l'adresse compris.

## Lot 6 : confort

Statut : livré.

- Besoins S4, S6, S7, K4, C9.
- Visites avec photos, journal d'activité, notifications, « ce qui a changé », partage mobile,
  export CSV et JSON.
- Livré : visites faites ou planifiées (participants, compte rendu, points positifs et négatifs,
  note, tâche « Préparer la visite », statut « visité » proposé), photos dans un bucket Supabase
  Storage privé (un dossier par espace, envoi direct par URL signée, vignettes réduites sur
  l'appareil, lecture par URL signées courtes, suppression par l'auteur) ; journal lisible par
  annonce et par espace avec filtres ; « ce qui a changé » par membre (bandeau, champs modifiés
  dans la fiche, « tout marquer comme vu ») ; notifications dans l'application, en web push
  (`web-push`, clés VAPID) et par e-mail en option (interface et envoi HTTP générique, inerte
  par défaut), préférences par type et par canal ; cible de partage de la PWA ; webhook signé
  d'alertes e-mail transférées en brouillons à valider ; export CSV et JSON versionné ;
  `add_visit`, `list_visits` et `whats_new` dans le MCP (28 outils). ADR 0014 et 0015.
- Plus tard : partage de captures d'écran vers la PWA (POST et service worker), import depuis
  l'export JSON, un fournisseur d'e-mails choisi par ADR si l'e-mail sert vraiment.

Fini quand : Chloé reçoit sur son téléphone la notification d'une annonce ajoutée par Claude,
l'ouvre, voit ce qui a changé, ajoute la visite et ses photos ; une annonce partagée depuis
l'application Leboncoin arrive pré-remplie ; l'export s'ouvre dans un tableur. (Vérifié en tests
automatisés ; à confirmer sur les vrais téléphones après le déploiement.)

## Lot 7 : environnement local

Statut : livré.

- Pile locale en une commande (`pnpm stack:up`, jeux de données `none`, `demo` ou `artifact`),
  jeu de démo fictif, connexion par e-mail et mot de passe réservée au local, page de
  consentement OAuth `/oauth/consent` pour le MCP, `pnpm verify` qui rejoue la CI et hook
  pre-push. Voir [docs/developpement-local.md](../developpement-local.md), ADR 0016 et 0017.

Fini quand : `pnpm install && pnpm stack:up --dataset demo && pnpm dev` donne une application
utilisable en local, MCP compris, et `pnpm verify` passe avant chaque push.

## Lot 8 : invitations par e-mail

Statut : livré (à déployer).

- Besoins K5, K6. Prolonge l'ADR 0004 (membres pré-créés, rattachement par e-mail), qui
  renvoyait l'invitation à un lot ultérieur.
- Rôles `owner` et `member` ; seul un propriétaire invite, annule une invitation ou retire un
  membre, et un espace garde toujours au moins un propriétaire.
- Inviter depuis la page de l'espace : e-mail et nom affiché ; crée un membre en attente (sans
  compte rattaché), daté, qui expire (14 jours par défaut) ; liste des invitations en attente,
  annulation. À la première connexion Google, le mécanisme actuel rattache l'identité au membre
  dont l'e-mail correspond, à condition que Google l'ait vérifié (`email_verified`) et que
  l'invitation ne soit ni expirée ni annulée.
- Personne déjà connectée (elle a son propre « Mon espace ») : un bandeau propose de rejoindre
  l'espace qui l'invite ou de refuser ; règle pour l'espace personnel quitté (vide ou non) à
  fixer par ADR.
- Retrait d'un membre : l'accès est coupé dès la requête suivante (web, REST et jetons MCP) ; ses
  avis, tâches, visites et le journal restent attribués à son nom.
- E-mail d'invitation envoyé par l'envoi HTTP existant s'il est configuré (ADR 0015), sinon le
  propriétaire transmet lui-même le lien de l'application ; notification dans l'application.
- Chaque écriture au journal d'activité ; invitations et retraits uniquement par l'interface et
  le REST, aucun outil MCP (lecture seule des membres possible).

- Livré : une invitation est une ligne de membre en attente (`members.status`, dates
  d'invitation, d'échéance, d'arrivée et de retrait ; migration purement additive, les membres
  existants restent `active` avec leur rôle) ; page « Espace » (`/espace`) : renommer l'espace,
  membres actifs et anciens membres, invitations en attente, expirées ou refusées (annuler,
  renouveler), inviter (e-mail et nom affiché ; refus propres : adresse invalide, déjà membre,
  invitation en attente, dix invitations en attente au plus, `member` qui invite), lien à
  transmettre quand l'e-mail n'est pas configuré ou échoue, nommer propriétaire ou rendre
  membre, retirer, quitter l'espace ; rattachement à la première connexion seulement si
  l'adresse est vérifiée (`email_confirmed_at`, et Google ne disant pas `email_verified: false` ;
  `user_metadata` n'est pas lu), invitation ni expirée (14 jours, `INVITATION_TTL_DAYS`) ni
  annulée ; membres importés (sans invitation) toujours rattachés, avec la même exigence
  d'adresse vérifiée ; bandeau « Rejoindre / Refuser » pour une personne déjà inscrite, l'espace
  quitté restant intact (orphelin s'il n'a plus de membre actif, ses invitations alors
  annulées ; refus au seul propriétaire d'un espace qui a d'autres membres) ; retrait sans
  suppression (accès coupé à la requête suivante, web, REST et jetons MCP ; avis, tâches,
  visites et journal gardés à son nom ; réinvité, il retrouve sa ligne) ; journal
  (`member.invited`, `member.joined`, `member.invitation_canceled`,
  `member.invitation_declined`, `member.removed`, `member.left`, `member.role_changed`,
  `workspace.renamed`, sorte « Membres ») ; notification `member_joined` aux propriétaires ;
  e-mail d'invitation par l'envoi HTTP de l'ADR 0015 ; `list_members` en lecture seule dans le
  MCP (29 outils), aucune écriture sur les membres. ADR 0018.
- Plus tard : changer le nom affiché d'un membre, transférer un espace orphelin depuis
  l'interface, un fournisseur d'e-mails choisi par ADR, limiter les renvois d'une invitation à
  la même adresse.

Fini quand : Richard invite une troisième adresse ; la personne se connecte avec Google et arrive
dans l'espace partagé avec les annonces, avis et tâches ; une invitation expirée ou annulée la
laisse dans son propre espace ; un membre retiré n'accède plus à rien, et son historique reste
lisible. Testé en e2e (rattachement, expiration, annulation, retrait, dernier propriétaire).
(Vérifié en tests automatisés ; à confirmer avec une vraie adresse Google après le déploiement.)

## Lot 9 : lisibilité de la fiche annonce

Statut : livré (à déployer, sans migration).

- Constat : la fiche empilait tout et mêlait deux bases de calcul sans le dire (« Coût total » à
  côté de « Prix cible » ; dans la sensibilité, des lignes en prix affiché et des cases calculées
  sur le coût, détail au survol seulement). Maquette validée : synthèse, onglet « Négocier »,
  synthèse mobile. ADR 0019.
- Livré : deux familles de valeurs marquées partout par une pastille (`CostBasisBadge`) : « sur
  le prix » (bordée, étiquette) et « tout compris » (pleine, +), en version compacte dans le
  tableau, les cartes et la comparaison ; bandeau « Deux bases de calcul » en tête de la
  synthèse et dans la légende de la liste ; « Coût total » devient « Coût tout compris » dans le
  web, le glossaire, `contracts`, les scénarios et le texte du MCP (la colonne CSV garde son nom,
  `docs/export.md`). Fiche en onglets (`ListingTabs`, `role="tablist"`, flèches, Début, Fin ;
  pastilles de 44 px qui défilent sur mobile) : **Synthèse** (les trois blocs « Combien
  négocier ? », « Combien ça coûte ? », « Est-ce rentable ? », l'encart « Et au prix cible ? »,
  résumés louabilité, suivi, quartier), **Négocier** (prix cible par critère avec prix affiché et
  coût tout compris maximaux, offre suggérée et brief, sensibilité, historique des prix et des
  offres), **Financer et louer** (louabilité, étude, saisie de la fiche, de la phase 2 et des
  hypothèses de l'annonce, avec l'aperçu en direct), **Quartier** (contexte, carte, DVF,
  risques Géorisques), **Suivi** (avis, tâches, visites, journal, nombre de tâches ouvertes sur
  l'onglet). L'onglet est dans l'URL (`?onglet=`) ; le panneau s'élargit (760 puis 1 160 px).
  « Modifier la fiche » ouvre la saisie ; la synthèse passe alors en aperçu en direct. Bouton
  « ? » à côté des indicateurs principaux (`DefinitionButton`, popover accessible) : la phrase
  courte du glossaire de `contracts`, le même que `apart://glossaire`. Sensibilité : phrase
  d'explication, axe « Prix affiché », coût tout compris sous chaque prix, ligne du prix cible
  insérée et libellée, verdicts par symbole (✓ ~ ✗) autant que par couleur, détail de la case
  choisie (coût, mensualité, rendements, effort) sous la grille, défilement dans sa boîte.
  `domain` : `maxTotalCost` par critère et `atTarget` (`outcomeAtPrice`) dans `targetPrice`,
  coût par pas et `includeTargetPrice` dans `sensitivityGrid` (`priceStepsWithTarget`),
  `furnitureValue` dans `compute`, lecture de la fiche (`profitabilityChecks`,
  `monthlyPaymentSplit`, `priceGauge`), tolérance d'arrondi du verdict (`VERDICT_TOLERANCE`) ;
  champs ajoutés aux schémas, aucun renommé ; aucun outil MCP nouveau.
- Plus tard : la même lecture en deux bases dans le tableau de bord et la page « Comparer »
  (encart « au prix cible » côte à côte) ; navigation au clavier entre les cases de la
  sensibilité ; la ligne du prix cible dans `get_target_price` par défaut si le MCP en tire
  profit ; une fiche en pleine page si le panneau élargi gêne sur portable.

Fini quand : à la première lecture d'une fiche, on sait pour chaque valeur si elle porte sur le
prix affiché ou sur le coût tout compris ; on voit au prix cible le coût, le rendement brut,
l'effort et le verdict ; la sensibilité se lit sans survol, sur ordinateur comme au toucher ; un
lien vers une fiche rouvre le même onglet. (Vérifié en tests automatisés et sur captures d'un banc
d'essai ; à confirmer par Richard et Chloé sur la vraie fiche après le déploiement.)

## Lot 10 : fonds de carte

Statut : livré (à déployer, sans migration ni variable nouvelle).

- Besoins G1 (précisé) et G8. Constat : au zoom de départ, le fond OpenFreeMap « Liberty » ne
  montre que les grands axes ; rues fines et bâtiments n'apparaissent qu'en zoomant beaucoup,
  ce qui gêne pour dessiner un périmètre. ADR 0020.
- Livré : trois fonds sans clé, communs aux trois cartes (annonces, périmètre du critère,
  quartier de la fiche) : **Plan OSM** (Liberty, toujours remplacé par `VITE_MAP_STYLE_URL`),
  **Plan IGN** (style vectoriel `PLAN.IGN` de la Géoplateforme : noms de rues, bâtiments) et
  **Photo aérienne** (orthophotos IGN en WMTS sous les voies et les noms de rues du Plan IGN) ;
  attributions « © IGN » et OpenFreeMap / OpenStreetMap ; URL, licence (Licence Ouverte) et
  niveaux de zoom vérifiés sur la Géoplateforme (docs/open-data.md). Sélecteur posé sur chaque
  carte (`BaseMapSwitcher`, groupe radio, flèches, 44 px sur mobile, jetons du thème) ; choix
  retenu par personne et par appareil (store `baseMap`, `localStorage` protégé). Changer de fond
  passe par `setStyle` avec un `transformStyle` qui recopie les couches de l'application
  (contexte, rayon, périmètres, dessin terra-draw) avec leurs données : rien n'est redessiné,
  terra-draw n'est pas relancé, un tracé commencé se termine sur le nouveau fond. Contours
  doublés d'un liseré blanc, zones d'encadrement bordées de leur couleur, pour rester lisibles
  sur la photo. Carte du critère : ouverte cadrée sur le périmètre existant, ou sur le centre de
  Bordeaux au niveau 15 quand on dessine ; entrer en dessin depuis la vue de la métropole
  rapproche la carte ; une isochrone calculée est cadrée ; recherche d'adresse « Centrer » par
  `GET /opendata/geocode` (géocodeur IGN de l'API, en cache, rien d'enregistré). CSP inchangée.
- Plus tard : un fond sombre si l'IGN en publie un ; le cadastre (parcelles) en couche ;
  l'autocomplétion d'adresse ; la même recherche d'adresse sur la carte des annonces (le filtre
  par point et rayon se pose aujourd'hui au clic).

Fini quand : on dessine un périmètre en voyant les rues et les bâtiments, sur le plan ou sur la
photo aérienne ; le choix du fond est retenu d'une visite à l'autre sur le même appareil ; les
couches de contexte, le rayon, le périmètre et le dessin en cours restent affichés après un
changement de fond. (Vérifié en tests automatisés et sur captures Chromium d'un banc d'essai,
tuiles réelles ; à confirmer par Richard sur le site déployé, sur ordinateur et sur téléphone.)

## Lot 11 : équipements et quartiers

Statut : livré (à déployer : migration additive
`20261105120000_lot11_amenities_neighbourhoods`, trois imports et le rattrapage du contexte des
annonces, [docs/deploiement.md](../deploiement.md) § 2).

- Besoins D8 à D11 et G9. Demande de Richard : en plus des arrêts de tram et de bus, voir sur la
  carte les pistes d'athlétisme, les supermarchés avec drive (préférence Carrefour, Auchan,
  Intermarché), les salles Fitness Park et les contours de tous les quartiers de la métropole,
  puis les retrouver dans l'onglet Quartier de chaque annonce. ADR 0021.
- Livré :
  - **Sources vérifiées** (URL, licence, date et volumes dans docs/open-data.md) : pistes du
    recensement des équipements sportifs (Data ES, ministère des Sports, Licence Ouverte 2.0 :
    77 pistes sur 24 communes, stades, pistes isolées et pistes 2 à 4 couloirs, les aires de saut
    et de lancer écartées), complétées par 7 pistes OpenStreetMap qu'aucune fiche ne décrit ;
    supermarchés avec drive d'OpenStreetMap (ODbL : 25, dont 21 signalés et 4 « à vérifier » ;
    Carrefour 3, Auchan 4, Intermarché 2) ; 6 salles Fitness Park d'OpenStreetMap, vérifiées une
    à une ; contours : 30 secteurs de vie de Bordeaux, 67 quartiers officiels de sept autres
    communes, IRIS de l'IGN-INSEE (édition 2026) ailleurs, cinq communes entières.
  - **Modèle** : tables `amenities` et `neighbourhoods` (PostGIS, GiST), écrites par le module
    `geo` ; scripts `import:sports-facilities`, `import:supermarkets`, `import:neighbourhoods`
    (`--help`, `--dry-run`, `--download`, fichiers locaux, remplacement par source, idempotents)
    et `refresh:surroundings` (rattrapage des annonces existantes).
  - **Règles** (`domain`) : enseigne et enseignes préférées, drive signalé ou « à vérifier »,
    jamais supposé ; quartier qui contient le point (quartier officiel, puis IRIS, puis commune ;
    « à vérifier » pour une localisation approchée ou une adresse à la rue en limite) ; drive
    le plus proche de chaque enseigne préférée et toutes enseignes (signalé d'abord).
  - **Fiche** : onglet Quartier (quartier et sa source, piste la plus proche et sa nature, drives
    par enseigne, Fitness Park, distances « à vol d'oiseau » calculées par PostGIS) et résumé
    Quartier de la Synthèse ; valeurs dans l'instantané `open_data_context.surroundings`
    (création, changement d'adresse, rattrapage) et dans `context` de `get_listing` (MCP) ;
    « non disponible » sans import.
  - **Cartes** : couches Quartiers, Pistes d'athlétisme, Supermarchés drive, Fitness Park sur la
    carte des annonces ; sur la carte du quartier de la fiche, les plus proches d'office, les
    couches complètes à la demande, contour du quartier de l'annonce mis en avant, cadrage sur
    l'annonce et ses équipements proches. Enseignes préférées en disque plein, autres en cercle
    creux, « à vérifier » plus pâle ; légende ; nom du quartier au survol et au clic ; fenêtres
    avec nom, enseigne, drive, nature, adresse et source ; attributions ; couches recopiées au
    changement de fond.
- Plus tard : ces équipements comme filtres des critères de recherche (« drive à moins de
  2 km ») ou dans le verdict ; des temps de trajet (isochrones Géoplateforme, approchés) plutôt
  que des distances à vol d'oiseau ; d'autres équipements (piscines, écoles, parcs) ; des
  quartiers officiels pour les vingt autres communes quand elles en publieront ; une source plus
  complète pour les drives des hypermarchés (OpenStreetMap ne signale pas tous les drives).

Fini quand : chaque annonce localisée montre son quartier (avec sa provenance), la piste
d'athlétisme, les drives par enseigne et la salle Fitness Park les plus proches, ou « non
disponible » ; les quatre couches s'allument sur la carte des annonces et la carte du quartier,
lisibles sur les trois fonds ; les imports et le rattrapage tournent sur la production sans
rien casser. (Vérifié en tests automatisés, sur une base jetable avec les vraies données et sur
captures Chromium d'un banc d'essai ; à confirmer par Richard sur le site déployé.)

## Lot 12 : placement des annonces

Statut : livré (à déployer : migration additive `20261105180000_lot12_listing_placement`,
`import:places`, puis `relocate:listings` en simulation et en vrai,
[docs/deploiement.md](../deploiement.md) § 2).

- Besoin D12. Demande de Richard : une annonce dont l'adresse n'est pas exacte doit être placée
  au centre de son quartier quand il est connu, au centre de la commune sinon, à l'adresse quand
  elle l'est ; tous les calculs partent du repère le plus précis ; on distingue les annonces
  exactement localisées des génériques. En production, 25 annonces sur 29 n'avaient pour repère
  que le centre de leur commune. ADR 0022.
- Livré :
  - **Hiérarchie** : adresse au numéro ou à la rue ; sinon quartier reconnu dans le champ
    « quartier » parmi les contours de la commune (secteur de vie, quartier officiel, IRIS,
    quartier qui regroupe des secteurs), repère au point intérieur du contour ; sinon lieu-dit
    OpenStreetMap ; sinon centre de la commune. Le plus précis cohérent l'emporte ; « près de »,
    noms incompatibles ou ambigus rendent « à vérifier » ; rien d'inventé. Un point saisi prime,
    un repère à l'adresse ne redescend jamais.
  - **Modèle** : `listings.location_placement` (méthode, zone retenue, texte reconnu, réserves),
    `listings.location_area` (contour retenu ou commune), table `places` (lieux-dits) ; script
    `import:places` ; rattrapage `relocate:listings` (`--dry-run`, idempotent, journal
    `listing.relocated`), enchaîné par `stack:up --opendata`.
  - **Calculs** : tous depuis le repère, avec la réserve d'un repère approché, textes dans
    `domain` : distances « ≈ » (tram, équipements, comparables), quartier indicatif, zone
    d'encadrement probable ou « à vérifier » selon le contour, critère à périmètre « sous
    réserve » seulement si le contour n'y est pas entier.
  - **Interface** : pastille de précision (liste, cartes, fiche, comparaison, export CSV),
    explication et « Préciser l'adresse » dans l'onglet Quartier ; carte : repère plein, creux
    ou pointillé, légende, contour du quartier au survol et à la sélection (suit le changement
    de fond), contour retenu sur la carte du quartier ; filtre « Repère » dans l'URL.
  - **MCP** : précision et placement dans `list_listings` et `get_listing`, filtre `precision`,
    consignes d'adresse et de quartier dans `create_listing` et `update_listing`.
  - **PWA** : après un déploiement, la page se recharge une fois quand la nouvelle version prend
    la main, sans boucle.
- Plus tard : inclure « sous réserve » dans un critère une annonce dont le repère est hors du
  périmètre mais dont le quartier le recoupe ; d'autres sources de noms d'usage ; une
  suggestion d'adresse depuis la photo ou le plan de l'annonce (lu par Claude, jamais par le
  serveur).

Fini quand : chaque annonce dit d'où vient son repère (pastille et explication) ; une annonce
dont le texte cite un quartier connu est placée en son centre, les autres au centre de la
commune, jamais ailleurs ; distances, quartier, encadrement et critères portent leur réserve ;
la carte distingue les trois sortes de repères et montre le contour du quartier ; le rattrapage
tourne sur la production sans toucher une annonce à l'adresse. (Vérifié en tests automatisés,
sur une base jetable avec les vraies données ouvertes et en évaluation locale des formes de
quartier relevées en production ; à confirmer par Richard sur le site déployé.)

## Lot 13 : lisibilité de la page Hypothèses

Statut : livré (à déployer, sans migration ni variable nouvelle).

- Besoin E2 (précisé). Demande de Richard : la page Hypothèses est « très compliquée à lire » ;
  hiérarchiser ce qui se saisit. Maquette validée (ordinateur et mobile 390 px). ADR 0023.
- Livré : cinq sections en questions, chacune avec « Sert à : … » : **Comment financez-vous
  l'achat ?** (apport, taux nominal hors assurance, durée, assurance ; repère « Pour 100 000 €
  empruntés ≈ … €/mois, assurance comprise » recalculé en direct), **Qu'est-ce qu'une bonne
  affaire pour vous ?** (une ligne par seuil, rendement brut, effort, rendement net facultatif et
  repère 220 × loyer, avec sa case « prix cible » sur la même ligne ; la case du net reste grisée
  sans seuil ; marge de négociation repliée avec l'échelle négociable, tendue, hors de portée et
  les deux décotes), **Quel est votre calendrier ?** (phase 1 « Vous y habitez » : date d'achat,
  loyer actuel, entretien ; phase 2 « Vous le louez » : date de mise en location avec l'année par
  défaut rappelée dessous et modifiable à la demande, vacance, frais fixes ; taxe foncière et
  charges saisies dans chaque annonce), **Frais de notaire** (barème officiel ou taux forfaitaire
  en choix segmenté ; en barème, origine et taux effectif sur un bien à 200 000 €, détail replié :
  droits de mutation, tranches d'émoluments, autres frais, retour au barème officiel), **Fiscalité
  et revente** (repliée en pastilles sur ordinateur ; impôt puis revente et projection ;
  estimations, pas un conseil fiscal ; paramètres fiscaux datés). Sommaire en colonne d'ancres sur
  ordinateur, accordéons résumés sur mobile. Unités dans les cases, chiffres à droite et à la
  française, clavier adapté, cases de 48 px sur mobile ; bouton « ? » sur les champs obscurs
  (six entrées nouvelles au glossaire, donc à `apart://glossaire`). Chaque champ modifié dit
  « modifié · avant … » ; barre collée en bas : nombre et liste des modifications, nom facultatif
  de la version, Annuler, « Voir l'impact » (aperçu au-dessus de la barre), Enregistrer ; erreurs
  en français au champ, reliées depuis la barre. Historique en tableau défilant, version en
  vigueur mise en avant ; en-tête avec la version en vigueur et un lien vers l'historique.
  `domain` : `referenceMonthlyPayment`, `notaryEffectiveRate`, `discountScale`
  (`assumptions-reading.ts`). Schémas, API, versions et MCP inchangés ; pour une même saisie, les
  hypothèses enregistrées sont celles d'avant (test de non-régression sur des sorties de l'ancien
  formulaire).
- Plus tard : le même découpage pour les hypothèses propres à une annonce (onglet « Financer et
  louer » de la fiche) ; cocher « Marché (DVF) » dans le web si Richard le souhaite (il ne se
  règle aujourd'hui que par le MCP) ; comparer deux versions de l'historique côte à côte.

Fini quand : sur ordinateur comme sur téléphone, on comprend à quoi sert chaque groupe de
réglages sans lire le modèle de calcul, on voit ce qu'on a changé avant d'enregistrer et son
impact sur les annonces, et une saisie identique enregistre les mêmes hypothèses qu'avant.
(Vérifié en tests automatisés et sur captures Chromium de la page réelle, API simulée ; à
confirmer par Richard sur le site déployé.)

## Lot 15 : suivi des mises à jour des annonces

Statut : livré (à déployer : migration additive `20261106110000_lot15_listing_checks`, sans
variable ni import nouveau, [docs/deploiement.md](../deploiement.md) § 2).

- Besoins C8 (précisé) et S8. Demande de Richard : « J'aimerais lui demander [à Claude] de faire
  une mise à jour des annonces enregistrées, et qu'il y ait pour chaque annonce un suivi de ces
  mises à jour. » Aucun scraping : Claude lit la page dans le navigateur de l'utilisateur (ou le
  texte collé) ; un portail qui bloque laisse l'annonce « non vérifiée : page inaccessible ».
  ADR 0025.
- Livré :
  - **Modèle** : `listings.last_checked_at`, `listings.last_seen_online_at`,
    `listings.republished_from_id` (republication rattachée, unique), table `listing_checks`
    (date, auteur et canal, résultat, écarts appliqués, proposés ou notés, résumé,
    extrait-preuve de 500 caractères au plus sans téléphone ni e-mail, URL consultée, annonce
    liée, statut proposé), notification `listing_checked`.
  - **Règles** (`domain`, `listing-checks.ts`) : `listingCheckDiff` (seuls les champs fournis,
    tolérances d'arrondi ; faits appliqués, « plus en ligne » propose « Vendu ou retiré »,
    annonce « remontée » notée, première publication gardée), `resolveCheckOutcome`,
    `listingCheckSummary` (« Prix 215 000 € → 205 000 € »), `isStale` et `checkFreshness`
    (7 jours, `DEFAULT_STALE_DAYS`), `sanitizeEvidence`, `orderRepublication`,
    `republicationLinkProblem` ; brief de négociation sur la chaîne de republication (durée en
    ligne depuis la publication d'origine, baisses cumulées, argument « Annonce republiée »).
  - **API** : `GET /listings/:id/checks`, `POST /listings/:id/checks/preview`,
    `POST /listings/:id/checks` ; une vérification s'applique en une transaction (faits,
    historique des prix source `listing`, dates, rattachement, ligne, journal
    `listing.checked`, notifications), puis plafond et marché si la surface ou les pièces
    changent ; garde-fous `expectedUpdatedAt` et `expectedPrice` ; « ce qui a changé » et
    notifications reprennent ce qu'une vérification trouve, jamais une vérification inchangée.
    Filtre `staleDays` et tri `lastCheckedAt` de la liste.
  - **MCP** : `check_listing` (lecture), `apply_listing_check` (écriture, statut jamais
    appliqué), file « à revérifier » de `list_listings`, prompt `review_listings` (tournée : une
    annonce à la fois, navigateur de l'utilisateur, arrêt sans contournement d'un portail qui
    bloque, résumé et statuts à confirmer) : 31 outils, deux prompts.
  - **Interface** : section « Mises à jour » de l'onglet Suivi (chronologie : date, qui,
    résultat, changements avant → après, extrait dépliable, annonce rattachée ; « Vue en ligne
    aujourd'hui », « Plus en ligne » avec confirmation puis statut proposé, appliqué seulement
    sur accord) ; mention « Vérifiée il y a 3 j », « Page inaccessible… » ou « À revérifier »
    dans la liste, les cartes et l'en-tête de la fiche ; filtre « À revérifier » (URL
    `staleDays=7`) et tri « Dernière vérification » ; note de republication dans le brief.
  - **Export** : trois colonnes CSV en fin de ligne (Vérifiée le, Vue en ligne le, Dernière
    vérification), `checks` par annonce dans le JSON (version 1, champ ajouté).
  - **Démo** : vérifications fictives (prix trouvé, inchangée, plus en ligne, republiée, page
    inaccessible) et une republication rattachée.
- Plus tard : une tournée planifiée (rappel « à revérifier » par notification) ; le rattachement
  d'une republication proposé depuis la fiche (aujourd'hui par le MCP) ; la comparaison des
  photos d'une republication (lue par Claude, jamais par le serveur).

Fini quand : Claude fait la tournée des annonces à revérifier depuis le navigateur de Richard,
une à la fois, sans contourner un portail qui bloque ; chaque annonce montre ses vérifications
(qui, quand, quoi, preuve) ; un prix lu sur le portail entre dans l'historique et le brief, une
annonce disparue se voit proposer « Vendu ou retiré » sans que le statut change d'office ; une
republication rattachée cumule durée en ligne et baisses. (Vérifié en tests automatisés, e2e MCP
JSON-RPC compris, et sur captures Chromium d'un banc d'essai, jeu de démo fictif ; à confirmer par
Richard avec une vraie tournée après le déploiement.)

## Lot 14 : adéquation aux critères

Statut : livré (à déployer : migration additive `20261106100000_lot14_criteria_fit`, puis
`refresh:criteria-fit` en simulation et en vrai, [docs/deploiement.md](../deploiement.md) § 2).

- Besoins G3, G6 (précisés), D12. Demande de Richard : les annonces actives coïncident avec les
  critères actifs ; celles qui en sortent passent dans un état différent sans être perdues ;
  des critères non stricts (un peu hors du polygone, un peu au-dessus du prix) ; une annonce
  placée au quartier ne sort pas d'un critère dont le polygone recoupe son quartier tant que
  l'adresse exacte n'est pas connue. Conception et maquette validées (ordinateur et mobile
  390 px). ADR 0024.
- Livré :
  - **Quatre niveaux** par annonce et critère actif, distincts du statut : « dans les critères »,
    « à confirmer » (adresse au quartier ou à la commune dont le contour touche le périmètre ou
    sa marge, ou donnée manquante : jamais « hors » pour une donnée manquante), « à la marge »
    (dépassement dans la tolérance, raison chiffrée), « hors critères » ; le meilleur parmi les
    critères actifs, le détail gardé ; sans critère actif, tout est « dans les critères ». Le
    verdict en fait partie, le statut non.
  - **Adresse imprécise** : le contour du quartier ou de la commune décide, jamais le repère ;
    distance au tram depuis la partie du contour la plus proche d'un arrêt.
  - **Marge de tolérance** par critère, défaut daté (300 m, prix +5 %, prix minimal −5 %,
    surface −5 %, pièces 0, DPE une classe, tram +100 m), 0 = strict ; page Critères : seuils
    réels (« soit 231 000 € »), « Marge appliquée / désactivée », rappel de la règle des
    adresses imprécises, aperçu par niveau avant d'enregistrer, compteurs par niveau.
  - **Mesures et décision** : une requête PostGIS de mesures (module geo) pour la liste,
    l'aperçu, les alertes et le rattrapage ; la décision, les raisons et les textes dans
    `domain` (`criteriaFit`, `bestFit`). Stockage : `criteria_matches` étendue (niveau,
    raisons, détail, date du changement) et le meilleur niveau sur l'annonce ; recalcul à chaque
    écriture d'annonce, de critère ou d'hypothèses ; journal `criteria.matched`,
    `criteria.unmatched`, `criteria.fit_changed` avec la cause ; alerte seulement à l'entrée due
    à l'annonce ; sorties dans « ce qui a changé ».
  - **Page Annonces** : onglets « Dans les critères · n » et « Hors critères · n » dans l'URL,
    pastilles « Adéquation », pastilles lisibles sans la couleur et raison dessous ; une annonce
    hors critères avec une offre en cours ou une visite prévue reste dans l'onglet principal
    (« Gardée dans la liste ») ; onglet « Hors critères » : explication, raison, « depuis » ; la
    carte suit l'onglet.
  - **Fiche** : « Correspond-elle à ce qu'on cherche ? » en tête de la synthèse (niveau,
    explication, « Préciser l'adresse », détail par critère filtre par filtre, marges,
    historique daté) ; périmètres des critères sur la carte du quartier.
  - **MCP** : filtre `fit` et adéquation dans `list_listings` (l'onglet principal par défaut),
    détail dans `get_listing`, compteurs et marge dans `list_search_criteria`, `tolerance` à la
    création et à la modification d'un critère, changements de niveau dans les réponses
    d'écriture et dans `whats_new`. **Export** : deux colonnes en fin de CSV, `criteriaFit` dans
    le JSON (version 1). **Rattrapage** `pnpm refresh:criteria-fit` (`--dry-run`, idempotent,
    canal `system`), enchaîné par `stack:up --opendata` ; jeu de démo : un troisième critère à
    marge réglée, les quatre niveaux représentés.
- Plus tard : la distance au tram maximale d'un contour (une annonce au quartier tout près d'un
  arrêt pourrait être « dans ») ; un schéma périmètre et contour dans la fiche elle-même ; des
  marges plus fines (prix au m²).

Fini quand : chaque annonce dit, critère par critère, si elle correspond à ce qu'on cherche et
pourquoi ; une annonce au quartier dont le contour chevauche un périmètre y reste « à
confirmer » jusqu'à l'adresse ; un léger dépassement reste visible « à la marge » ; une annonce
hors critères n'est jamais perdue et revient d'elle-même ; la liste, l'aperçu, le MCP, l'export
et le rattrapage disent la même chose. (Vérifié en tests automatisés, sur une base jetable avec
les vraies données ouvertes et des annonces fictives, et sur captures Chromium ; à confirmer par
Richard sur le site déployé avec ses critères.)

## Lot 16 : exploration par les critères

Statut : livré (à déployer : migration additive `20261107100000_lot16_exploration`, sans variable
ni import nouveau, [docs/deploiement.md](../deploiement.md) § 2).

- Besoin C10 (nouveau), précise C3, C6, C9 et G3. Demande de Richard et Chloé : que Claude
  explore les portails (Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo) à partir des critères
  actifs, et que l'application trie ce qu'il trouve. Aucun scraping : Claude lit les pages dans
  le navigateur de l'utilisateur (Claude in Chrome) ; le serveur ne télécharge rien et fabrique
  seulement les liens de recherche. Maquette validée (onglet « À valider », déroulé dans
  claude.ai, « Ce que Claude cherche », compte rendu, mobile 390 px). ADR 0026.
- Livré :
  - **Règles** : Claude n'ajoute jamais une annonce : toute annonce gardée devient un brouillon
    « À valider » (origine `exploration`), même « dans les critères » ; écartée = jamais
    reproposée (même lien normalisé, ou doublon probable d'une annonce ou d'un brouillon écartés),
    raison gardée ; hors critères même avec la marge = une ligne du compte rendu seulement (lien,
    portail, titre, prix, raison), remontée par la prochaine exploration si un critère s'élargit ;
    même lien qu'une annonce suivie = une vérification du lot 15 (faits appliqués, rien de plus) ;
    doublon probable sous un autre lien = brouillon à trancher, jamais fusionné d'office ; portail
    bloqué (captcha, vérification anti-robot, connexion) = arrêt sans contournement, noté
    « bloqué » ; exploration à la demande.
  - **Modèle** : tables `explorations` (membre, canal, début et fin, critères, bilan par portail,
    compteurs, résumé ; `run_key` unique par espace) et `exploration_candidates` (une ligne par
    annonce lue, extrait de 500 caractères au plus, masqué) ; `listing_drafts` : origine
    `exploration`, état `merged`, lecteur `claude`, exploration, portail, extrait, raison de l'écart,
    « c'en est une autre », vérification liée, placement du repère ; `search_criteria.portals`
    (portails cochés, tous par défaut).
  - **`domain`** (`exploration.ts`) : `normalizeListingUrl`, `portalFromUrl`, brief
    (`searchBrief`, seuils élargis de la marge, zones, lignes, `portalSearchUrls` sans réseau d'après
    `PORTAL_SEARCH_TEMPLATES`, daté du 5 novembre 2026 : Leboncoin pré-rempli, les autres portails
    « filtres à saisir »), fiche d'un brouillon, `triageCandidate`, compteurs, phrases, bilan par
    portail et résumé des hors critères ; verdict inconnu sans loyer visé = « à confirmer ».
  - **API** : `GET /explorations`, `GET /explorations/:id`, `GET /explorations/brief`,
    `GET /search-criteria/:id/brief` ; brouillons : liste avec l'adéquation calculée à la lecture,
    `POST /listing-drafts/:id/accept` (« Ajouter à la liste »), `POST /listing-drafts/accept-in-criteria`,
    écart avec raison et annulation (`PATCH`), `POST /listing-drafts/:id/merge` (« C'est la même »,
    vérification lot 15), `POST /listing-drafts/:id/distinct` ; adéquation d'une annonce pas
    enregistrée par le chemin du lot 14 (placement du lot 12 en cache, mesures PostGIS d'une ligne
    virtuelle) ; zones du brief par PostGIS ; journal `exploration.recorded`, `draft.merged`,
    `draft.restored`, `draft.distinct` ; notification « Claude a trouvé N annonces à valider » pour
    l'autre membre (préférence des annonces à valider).
  - **MCP** : `get_search_brief`, `triage_candidates` (lecture), `record_exploration` (écriture :
    le serveur retrie, `runKey` idempotent), prompt `explore_listings` : 34 outils, trois prompts (38 et cinq avec le lot 17).
  - **Interface** : onglet « À valider » de la page Annonces (`?vue=a-valider`, compteur) pour tous
    les brouillons, e-mail compris : portail, adéquation, raison, doublon probable et ses deux
    boutons, « Lu sur la page par Claude », Ajouter, Modifier avant d'ajouter, Écarter (raison
    facultative, Annuler), Ouvrir sur le portail, bandeau de la dernière exploration et « Ajouter
    celles « dans les critères » » ; « Ce que Claude cherche » d'un critère (`/criteres/:id` :
    brief, portails à cocher, « Ouvrir la recherche », demande à copier, dernières explorations) ;
    compte rendu (`/criteres/explorations/:id`, bilan par portail, filtre `?resultat=`) ; la boîte
    de la Synthèse renvoie vers l'onglet ; cartes soignées à 390 px.
  - **Export** : `explorations` dans le JSON (version 1, `[]` par défaut) ; CSV inchangé.
  - **Démo** : deux explorations fictives « [Exemple] » (brouillons des quatre sortes, un doublon,
    une annonce suivie au prix baissé, des hors critères, Logic-Immo bloqué, un brouillon écarté).
- Plus tard : une exploration planifiée (rappel par notification) ; des paramètres de recherche
  vérifiés pour SeLoger, Bien'ici, PAP et Logic-Immo ; la mise à jour d'un brouillon revu ; les
  doublons entre brouillons d'une même exploration.

Fini quand : depuis claude.ai, « Explore les nouvelles annonces pour nos critères » parcourt les
portails cochés dans le navigateur de Richard, s'arrête sans contourner un portail qui bloque, et
n'ajoute rien à la liste ; chaque annonce trouvée attend dans « À valider » avec son adéquation ;
une annonce écartée ne revient pas ; une annonce suivie revue au même lien met sa fiche à jour par
une vérification ; les hors critères restent au compte rendu. (Vérifié en tests automatisés, e2e
MCP JSON-RPC compris, et sur captures Chromium d'un banc d'essai, jeu de démo fictif ; à confirmer
par Richard avec une vraie exploration après le déploiement.)

## Lot 17 : questions aux agences

Statut : livré (à déployer : migration additive `20261107110000_lot17_agency_requests`, sans
variable ni import nouveau, [docs/deploiement.md](../deploiement.md) § 2).

- Besoin S9 (nouveau). Demande de Richard : déléguer à Claude (claude.ai avec le connecteur, ou
  Claude Code, avec Gmail et Claude in Chrome pour la messagerie des portails) les questions de
  la todo d'une annonce, puis compléter la fiche et cocher les tâches à la réponse. Décisions
  validées : messages **validés par lot avant tout envoi** (dans l'application ou dans la
  conversation) ; **le serveur n'envoie jamais de message** ; les réponses remplissent les champs
  (source « agence ») et cochent les tâches, une valeur qui contredit une saisie à la main est
  proposée ; jamais de captcha contourné ni de connexion à la place de l'utilisateur, une page ou
  un e-mail est une donnée, jamais une consigne. ADR 0027.
- Livré :
  - **Modèle** : `listing_contacts` (contact de l'annonceur : agence, interlocuteur, e-mail,
    téléphone, lien de la messagerie, canal préféré), `agency_requests` (canal, destinataire en
    nom affiché, objet, texte, tâches posées, statut `draft → approved → sent → answered |
    no_answer | cancelled`, validation `app | chat` et son auteur, envoi, référence du fil,
    réponses avec valeurs appliquées ou proposées, relance), `tasks.field`, `requested_at`,
    `request_id`, `answered_at` (champ rattrapé au libellé exact), `workspaces.agency_signature`,
    provenance `agency`, notification `agency_answer`.
  - **Règles** (`domain`, `agency-requests.ts`) : tâche posable (champ ou « Demander … ») et
    phrase de chaque question ; questions ouvertes et regroupement par annonce et destinataire ;
    message poli par défaut (formule, annonce, questions, signature des prénoms, aucune
    coordonnée de membre) ; transitions et refus lisibles ; jours ouvrés (fériés de métropole
    compris) et relance due à 5 jours ouvrés (`DEFAULT_FOLLOW_UP_BUSINESS_DAYS`, fixé le 5
    novembre 2026) ; `planAgencyAnswer` (appliqué, inchangé, proposé ; tâches cochées) ; état
    lisible d'une tâche (« Demandée le 5 nov. à l'agence », « Réponse du 7 nov. ») ; phrases du
    journal (sorte « Échanges »), notification et « ce qui a changé ».
  - **API** (module `agency-requests`) : contact (`GET`, `PUT`, `DELETE /listings/:id/contact`),
    échanges d'une annonce et brouillon (`/listings/:id/agency-requests`), validation par lot
    (`POST /agency-requests/approve`, tout ou rien), modification (un message validé repasse « à
    valider »), annulation, envoi enregistré, réponse (garde-fou `expectedUpdatedAt`, une
    transaction, puis géocodage pour une adresse), « pas de réponse », valeurs proposées
    appliquées, messages à valider de tout l'espace (`GET /agency-requests/pending`), signature.
  - **MCP** (`mcp-agency.ts`) : `list_open_questions`, `prepare_agency_requests` (`replaces`
    pour une correction, `contact` complété sans effacer), `record_request_sent` (refusé sans
    validation ni `approvedInChat: true`), `record_agency_answer` ; prompts `ask_agencies` et
    `check_agency_answers` : 35 outils, 4 prompts sans le lot 16 (38 et cinq avec), aucun outil de suppression.
  - **Interface** : onglet « Échanges » de la fiche (`?onglet=echanges`, pastille « n à
    valider ») : messages à valider au texte modifiable et « Valider l'envoi » par lot, messages
    validés en attente d'envoi (« Je l'ai envoyé »), questions à poser et « Préparer un
    message », contact modifiable et effaçable, chronologie (statut, canal, validation, envoi,
    questions cochées, réponse dépliable, valeurs « appliqué » ou « proposé » avec
    « Appliquer », relance due avec « Préparer une relance », « Pas de réponse »), signature ;
    état des tâches demandées dans Suivi ; bloc « Messages à valider » de la Synthèse.
  - **Export** : `contact` et `agencyRequests` par annonce et les champs des tâches dans le JSON
    (version 1) ; CSV inchangé (coordonnées de tiers, liste de demandes).
  - **Démo** : trois contacts fictifs, une réponse qui a rempli les charges (taxe foncière
    proposée), un message à valider, une relance due.
- Plus tard : saisir une réponse à la main dans l'application (aujourd'hui Claude, ou la fiche) ;
  une notification de relance due ; poser une question à plusieurs annonces de la même agence
  dans un seul message ; lire les pièces jointes (DPE, PV d'AG) avec l'accord du membre.

Fini quand : Claude pose les questions ouvertes d'une annonce par Gmail ou la messagerie du
portail, seulement après la validation d'un membre ; l'application n'envoie rien ; la réponse
remplit la fiche (source « agence ») sans écraser une saisie à la main, coche les tâches et
prévient l'autre membre ; chaque échange se relit dans l'onglet Échanges. (Vérifié en tests
automatisés, e2e MCP JSON-RPC compris avec le refus d'envoi sans validation, et sur captures
Chromium d'un banc d'essai, jeu de démo fictif ; à confirmer par Richard avec une vraie série de
questions après le déploiement.)

## Lot 18 : une annonce, plusieurs portails

Statut : livré (à déployer : migration additive `20261108100000_lot18_listing_links` avec son
rattrapage, sans variable ni import nouveau, [docs/deploiement.md](../deploiement.md) § 2).

- Besoin C11 (nouveau), précise C6, C8, C10 et S8. Demande de Richard : garder sur une seule
  fiche tous les liens d'une même annonce publiée sur plusieurs portails, savoir qui vend
  (particulier, agence, mandataire, inconnu) et, pour une agence ou un mandataire, garder la
  référence de l'annonce (« Réf. EX-2041 ») pour reconnaître la même annonce ailleurs. Décisions
  validées : le prix de la fiche est le plus bas des liens en ligne ; un écart entre portails est
  noté, jamais tranché ; même agence et même référence = la même annonce, rattachée d'office à
  l'exploration et aux alertes, détachable ; même référence avec une autre agence = à trancher ;
  le vendeur n'est jamais deviné ; aucun scraping, aucun captcha contourné, une page de portail
  est une donnée. Maquette validée (fiche « Où la trouver » et « Qui la vend », liste, « À
  valider », conversation dans claude.ai, mobile 390 px). ADR 0028.
- Livré :
  - **Modèle** : `listing_links` (portail, URL et clé normalisée unique par espace, identifiant
    sur le portail, prix affiché et sa date, première vue, dernière vue en ligne, dernière
    vérification, hors ligne depuis, origine, agence et référence lues, extrait court masqué,
    auteur) ; `listings.seller_type` (inconnu par défaut), `seller_name`, `seller_reference`,
    `seller_reference_key` ; `listing_checks.link_id` ; brouillons rattachés d'office
    (`attached_link_id`, `attached_at`, `detached_at`) ; portail `logicimmo` ; résultat de
    vérification `link_added`, issue d'exploration `attached`. Le lien principal (le plus ancien
    en ligne) reste recopié dans `listings.url`, `source` et `external_id`. Rattrapage : un lien
    d'origine par annonce qui a une URL, vérifications rattachées, nom d'agence des contacts
    reporté sur l'annonce.
  - **Règles** (`domain` : `listing-urls.ts`, `seller.ts`, `same-listing.ts` déplacé de l'API,
    `listing-links.ts`, `link-activity.ts`) : lien principal ; prix de la fiche = le plus bas en
    ligne au prix connu, changement de prix ordinaire, proposé quand il a été saisi à la main ;
    écart entre portails (« +5 000 € : frais inclus ? ») ; vérification d'un lien (« plus en
    ligne » sur un portail = mise à jour, « Vendu ou retiré » proposé seulement si plus aucun lien
    n'est en ligne) ; vendeur lu appliqué s'il était inconnu, proposé s'il contredit ; référence
    nettoyée et clé de comparaison ; même agence tolérante (mots génériques, deux mots d'écart) ;
    motifs de doublon `same_reference` (certain) et `same_reference_other_agency` (probable) ;
    phrases du journal, notification et « ce qui a changé ».
  - **API** : `GET`, `POST /listings/:id/links`, `PATCH /listings/:id/links/:linkId` (prix ou
    état relevés = une vérification ; portail ou identifiant corrigés), `DELETE` (jamais le
    dernier lien) ; vendeur dans la création et la modification ; une URL déjà sur une autre fiche
    refusée avec son nom ; création refusée pour même agence et même référence sauf
    `ignoreDuplicates` ; filtres `sellerType`, `multiPortal`, `reference`, recherche par référence
    et agence ; vérifications par lien (`linkId`) ; exploration et alertes e-mail : rattachement
    d'office par agence et référence, `POST /listing-drafts/:id/detach` (« Ce n'est pas la
    même »), `GET /listing-drafts?attached=true` ; « C'est la même » ajoute le lien du brouillon ;
    le contact du lot 17 lit et écrit le nom d'agence de l'annonce ; journal `listing_link.added`,
    `updated`, `removed`, `detached` (sorte « Liens des portails »).
  - **MCP** (`mcp-links.ts`) : `add_listing_link` (seulement si l'agence et la référence sont
    les mêmes ; refus rendus pour un lien pris, un vendeur qui contredit) ; vendeur, référence et
    liens dans `get_listing`, `list_listings`, `extract_listing`, `create_listing`,
    `update_listing`, `find_duplicates`, `triage_candidates`, `record_exploration`,
    `check_listing` et `apply_listing_check` (`linkId`) ; prompts `review_listings` (chercher la
    référence sur les autres portails), `explore_listings` et `analyze_listing` : 39 outils, cinq
    prompts, aucun outil de suppression.
  - **IA** : l'extraction lit le vendeur, l'agence ou le réseau et la référence, sans rien
    deviner (règle « Vendeur » de l'invite).
  - **Interface** : en-tête de fiche (pastilles des portails, vendeur, référence) ; dans la
    Synthèse, « Où la trouver » (portail, prix affiché et écart, en ligne ou non, ajouté, ouvrir ; « Ajouter un
    lien » avec le portail reconnu ; proposition de prix) et « Qui la vend » (vendeur, agence ou
    réseau, référence à copier, provenance) ; liste : colonnes Portails, Vendeur, Référence,
    filtres « Vendeur » et « Sur plusieurs portails » dans l'URL, recherche par référence ;
    « À valider » : « Liens rattachés d'office : même agence, même référence » avec « Ce n'est
    pas la même », doublon « C'est la même : ajouter ce lien à la fiche » ; popup de la carte ;
    mobile 390 px.
  - **Export** : `links` et vendeur dans le JSON (version 1, additif) ; quatre colonnes CSV en fin
    de ligne (Vendeur, Agence, Référence, Liens).
  - **Démo** : le T2 des Chartrons sur trois portails (écart de prix, un lien plus en ligne), un
    particulier sur deux portails, un mandataire au lien rattaché d'office par l'exploration, une
    agence à référence, un brouillon « même référence, autre agence », des vendeurs à relever.
- Plus tard : demander à l'agence si un prix plus haut inclut ses frais (lot 17) ; une recherche
  planifiée de la référence sur les autres portails ; une comparaison des noms d'agence tolérante
  aux fautes de frappe.

Fini quand : une annonce publiée sur trois portails n'a qu'une fiche, avec ses trois liens, son
prix le plus bas en ligne et l'écart noté ; le vendeur et la référence se lisent sur la fiche et
dans la liste ; une annonce d'agence trouvée ailleurs avec la même agence et la même référence
rejoint la fiche (et se détache d'un clic si ce n'est pas la même) ; une même référence chez une
autre agence attend dans « À valider ». (Vérifié en tests automatisés, e2e MCP JSON-RPC compris,
et sur captures Chromium d'un banc d'essai, jeu de démo fictif ; à confirmer par Richard avec une
vraie tournée après le déploiement.)

## Lot 19 : une fiche, sept questions

Statut : livré (à déployer, sans migration ni variable nouvelle).

- Précise le lot 9 (fiche) et le lot 13 (page Hypothèses). Demande de Richard : rendre chaque
  onglet de la fiche lisible. Critiques : l'adéquation aux critères prenait trop de place en tête
  de la Synthèse ; les travaux étaient cachés dans « Fiche et saisie » (Financer et louer), un
  grand formulaire fouillis qui portait aussi des réglages de l'espace ; Quartier était très
  verbeux ; Suivi mêlait historique, notation et tâches ; Échanges était séparé des tâches.
  Maquette validée (sept onglets, en-tête, correspondance de chaque section, mobile 390 px) ;
  décision validée : les réglages de l'espace quittent la fiche. ADR 0029.
- Livré :
  - **Sept onglets, une question chacun** (`?onglet=`) : **Synthèse** (« Faut-il y aller ? » :
    quatre chiffres qui ouvrent leur onglet, l'adéquation en une ligne avec son détail
    dépliable, « Ce qui plaît » et « À surveiller » tirés des données par `domain`, nos avis,
    prochaines étapes, dernière vérification), **Le bien** (travaux en tête, caractéristiques,
    énergie avec le DPE de l'ADEME, copropriété et charges, l'annonce et son adresse, description
    et notes ; « Où la trouver » et « Qui la vend » à droite ; marque « IA »), **Budget**
    (hypothèses de l'espace rappelées, achat et sa répartition, phase 1, phase 2 avec le loyer
    visé, le marché, le plafond d'encadrement et les contrôles, rendement et projection par
    scénario), **Négocier** (prix cible et jauge, ventes comparables DVF, arguments à copier, prix
    et offres avec « Préparer une offre » au montant choisi, sensibilité repliée), **Quartier**
    (six tuiles, le détail de la tuile choisie, la carte, les sources), **À faire** (tâches,
    questions à l'annonceur avec l'état de leur demande et visites en une liste filtrable, ajout
    « À demander à l'agence », contact de l'annonceur, points à vérifier pendant la visite,
    visites), **Historique** (une chronologie : journal, vérifications, prix et offres,
    adéquation, échanges, filtrable ; « Vérifier sur les portails » ; dates et champs lus par
    l'IA). Pastille de « À faire » : tâches ouvertes, messages à valider, relances dues. Les
    anciens identifiants (`financer`, `suivi`, `echanges`) mènent au nouvel onglet ; les
    notifications pointent Historique (vérification) et À faire (réponse de l'annonceur).
  - **En-tête allégé** : retour, statut, titre, prix et prix au m², surface, pièces, étage, lieu,
    pastilles, portails, fraîcheur ; barre d'onglets collée en haut, défilante sur mobile.
  - **Édition par section** : chaque section se modifie sur place, une à la fois, avec l'aperçu
    en direct (coût tout compris, mensualité, verdict) ; quitter une section modifiée demande
    confirmation dans la fiche. Même mise à jour qu'avant pour les champs de la section (même
    DTO, mêmes garde-fous, même journal), testée sur une charge utile relevée avec le code
    d'avant ; les champs des autres sections gardent leur provenance.
  - **Réglages de l'espace hors de la fiche** : plus d'hypothèses surchargées par annonce (retirées
    de l'interface, des entrées REST et MCP et des calculs) ; l'année et le type de location de
    la phase 2 se règlent dans la page Hypothèses (type de location ajouté au calendrier, résumé
    compris) et valent pour toutes les annonces (louabilité, encadrement, comparables, fiscalité,
    projection, scénarios, verdict, prix cible, MCP, export). Une entrée qui envoie encore ces
    clés est acceptée et elles sont ignorées. Colonnes gardées, documentées « plus lues ».
  - **`domain`** : `listing-overview.ts` (`listingHighlights`, `todoItems`, `filterTodo`,
    `todoProgress`, `todoPendingCount`, `nextSteps`, `visitWhen`), lecture de la fiche
    (`marketGap`, `costShares`, `priceRangeGauge`, `rentGauge`) ; `studyInputFromListing` et
    `complianceInputFromListing` prennent les hypothèses ; aucune formule changée.
  - **Export** : version 1 ; `leaseType` dans les hypothèses, plus de surcharge ni d'année ou de
    type par annonce.
- Plus tard : un rappel « ce qui a changé » par section ; l'édition de plusieurs sections d'un
  coup sur ordinateur ; une fiche en pleine page si le panneau élargi gêne sur portable.

Fini quand : chaque onglet répond à sa question sans défiler longtemps ; les travaux se lisent et
se modifient en tête du bien ; plus aucun réglage de l'espace dans la fiche ; un lien d'avant le
lot 19 ouvre le bon onglet. (Vérifié en tests automatisés, e2e REST et MCP JSON-RPC compris, et
sur captures Chromium, jeu fictif ; à confirmer par Richard et Chloé sur la vraie fiche après le
déploiement.)

## Lot 20 : nos avis, critère par critère

Statut : livré (à déployer : migration additive `20261110100000_lot20_opinion_criteria`, sans
variable nouvelle).

- Précise le lot 1 (avis, besoin K2) et le lot 19 (Synthèse). Demande de Richard : dans « Nos
  avis », que chaque membre note plusieurs critères, pour ensuite confronter les avis. Maquette et
  règles validées (Synthèse confrontée, saisie, avis à l'aveugle, téléphone, liste et comparaison,
  réglage des critères, À faire, Historique, notification, MCP). ADR 0030.
- Livré :
  - **Critères de l'espace** : huit par défaut (luminosité, agencement, état, calme, extérieur et
    vue, immeuble, rue et ambiance, « on s'y voit »), clés stables ; page « Critères des avis »
    (`/espace/criteres-des-avis`, reliée depuis la page Espace) : renommer, masquer ou afficher,
    monter et descendre, ajouter (dix au plus, masqués compris), retirer un critère ajouté jamais
    noté, case « Avis à l'aveugle » ; propriétaires seulement, lecture seule pour un membre ;
    chaque changement au journal.
  - **Saisie « Mon avis »** : par critère, six choix (« — » puis 1 rédhibitoire à 5 excellent,
    groupe de boutons radio au clavier), un mot facultatif, la note globale à part (le ressenti,
    pas une moyenne), la moyenne des critères recalculée en direct à titre indicatif, la phrase ;
    mention « après visite » quand le membre était à une visite faite ; même garde des
    modifications non enregistrées que les sections de la fiche. Au téléphone : une grille de six
    boutons par critère, « Notez pendant que c'est frais » après une visite faite.
  - **Avis à l'aveugle** (par défaut, côté serveur partout : fiche, liste, comparaison, MCP,
    journal, « ce qui a changé », export) : tant qu'on n'a rien noté, l'avis des autres est masqué
    (on sait qui a noté, combien de critères, après quelle visite) ; « Voir quand même » le
    révèle, et l'avis porte ensuite « après avoir vu celui de … ».
  - **Confrontation** (`domain`) : cartes par personne (note globale, moyenne des critères,
    phrase, après visite), bilan (« D'accord sur 5 critères. Désaccord sur le calme (Richard 4,
    Chloé 2) et « on s'y voit » (4 et 2). »), note commune, détail par critère dépliable avec les
    désaccords surlignés ; « À revoir à la contre-visite : le calme » propose une tâche (titre et
    contexte des notes et des mots) confirmée d'un clic, jamais créée d'office, rangée avec les
    visites et « Pendant la visite ».
  - **Effets** : « Ce qui plaît » (un critère noté au moins « bien » par tous), « À surveiller »
    (un « rédhibitoire », un désaccord), « À rediscuter » dans les prochaines étapes ; journal
    (« Chloé a donné son avis : 3/5, 7 critères. Deux désaccords avec Richard : calme, on s'y
    voit. »), filtre « Avis » de l'Historique ; notification à l'autre membre (désaccords, ou « à
    toi de noter » sans les notes) ; liste : colonnes par membre, note commune, désaccords, filtres
    « À rediscuter » et « Avis en attente », tris par note commune et plus gros désaccord ;
    comparaison : une ligne par critère, la meilleure note commune en gras. Le verdict ne change
    pas.
  - **MCP** : `add_opinion` prend des notes par critère dictées (clé ou libellé), fusionnées,
    toujours pour le membre connecté ; lectures à l'aveugle avec la confrontation. Trente-neuf
    outils.
  - **Export** : version 1 (notes par critère, confrontation, critères de l'espace) ; CSV : note
    commune, désaccords, notes par critère.
  - **Jeu de démo** : neuf critères (dont « Cuisine », ajouté), avis à critères fictifs, une
    annonce à deux désaccords, une en attente d'un membre.
- Plus tard : des poids par critère pour la note commune, une notification « noter la visite »,
  des critères qui varient selon le type de bien.

Fini quand : chacun note de son côté sans voir l'autre, puis la Synthèse dit où l'on est d'accord
et où l'on ne l'est pas ; un désaccord devient, d'un clic, un point de la contre-visite ; la liste
trie par note commune. (Vérifié en tests automatisés, e2e REST et MCP JSON-RPC compris, et sur
captures Chromium, jeu fictif ; à confirmer par Richard et Chloé après une vraie visite.)
