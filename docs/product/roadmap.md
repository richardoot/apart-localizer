# Feuille de route

Lots courts, chacun livrable et testé. Les numéros renvoient aux besoins de
[etude-du-besoin.md](etude-du-besoin.md). Lancement validé le 3 novembre 2026.

État au 4 novembre 2026 : **les lots 0 à 10 sont livrés** côté code, tests et documentation ; les
lots 0 à 7 sont déployés (Vercel et Supabase cloud), le lot 8 (invitations) attend son
déploiement (migration additive `20261104120000_lot8_invitations`), le lot 9 (lisibilité de la
fiche, sans migration) le sien, et le lot 10 (fonds de carte, sans migration ni variable
nouvelle) aussi. Restent les actions
d'exploitation (Supabase cloud, Vercel, clés et connecteur :
[docs/deploiement.md](../deploiement.md) § 11), ce qui est noté « plus tard » dans chaque lot, et
les critères « Fini quand » qui demandent le déploiement ou un usage réel (lot 1 : déploiement et
mobile de Chloé ; lot 2 : dix essais d'extraction ; lot 6 : push et partage sur les vrais
téléphones ; lot 8 : une vraie troisième adresse Google ; lot 9 : une lecture de fiche par
Richard et Chloé, sur ordinateur et sur téléphone ; lot 10 : un périmètre dessiné par Richard
sur la photo aérienne, sur le site déployé), à constater après la mise en ligne.

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
