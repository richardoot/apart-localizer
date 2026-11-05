# Feuille de route

Lots courts, chacun livrable et testé. Les numéros renvoient aux besoins de
[etude-du-besoin.md](etude-du-besoin.md). Lancement validé le 3 novembre 2026.

État au 5 novembre 2026 : **les lots 0 à 15 sont livrés** côté code, tests et documentation ; les
lots 0 à 13 sont déployés (Vercel et Supabase cloud ; imports du lot 11, `import:places` et
`relocate:listings` du lot 12 faits en production). Le lot 14 (adéquation aux critères) attend
son déploiement : migration additive `20261106100000_lot14_criteria_fit`, puis
`refresh:criteria-fit` en simulation et en vrai ([docs/deploiement.md](../deploiement.md) § 2) ;
le lot 15 (suivi des mises à jour des annonces) le sien : migration additive
`20261106110000_lot15_listing_checks`, sans variable ni import nouveau. Restent les actions
d'exploitation (Supabase cloud, Vercel, clés et connecteur :
[docs/deploiement.md](../deploiement.md) § 11), ce qui est noté « plus tard » dans chaque lot, et
les critères « Fini quand » qui demandent le déploiement ou un usage réel (lot 1 : déploiement et
mobile de Chloé ; lot 2 : dix essais d'extraction ; lot 6 : push et partage sur les vrais
téléphones ; lot 8 : une vraie troisième adresse Google ; lot 9 : une lecture de fiche par
Richard et Chloé, sur ordinateur et sur téléphone ; lot 10 : un périmètre dessiné par Richard
sur la photo aérienne, sur le site déployé ; lot 11 : les imports faits sur la base de
production et l'onglet Quartier des annonces réelles relu par Richard ; lot 12 : le
rattrapage relu en simulation puis passé sur la production, et les quartiers retenus relus par
Richard ; lot 14 : les critères de Richard créés sur le site déployé et les deux onglets relus),
à constater après la mise en ligne.

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
