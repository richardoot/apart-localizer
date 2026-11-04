# Feuille de route

Lots courts, chacun livrable et testé. Les numéros renvoient aux besoins de
[etude-du-besoin.md](etude-du-besoin.md). Lancement validé le 3 novembre 2026.

État au 4 novembre 2026 : **les lots 0 à 7 sont livrés** côté code, tests et documentation, et
déployés (Vercel et Supabase cloud) ; le lot 8 (invitations) est à faire. Restent les actions d'exploitation (Supabase cloud, Vercel, clés et
connecteur : [docs/deploiement.md](../deploiement.md) § 11), ce qui est noté « plus tard »
dans chaque lot, et les critères « Fini quand » qui demandent le déploiement ou un usage réel
(lot 1 : déploiement et mobile de Chloé ; lot 2 : dix essais d'extraction ; lot 6 : push et
partage sur les vrais téléphones), à constater après la mise en ligne.

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

Statut : à faire.

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

Fini quand : Richard invite une troisième adresse ; la personne se connecte avec Google et arrive
dans l'espace partagé avec les annonces, avis et tâches ; une invitation expirée ou annulée la
laisse dans son propre espace ; un membre retiré n'accède plus à rien, et son historique reste
lisible. Testé en e2e (rattachement, expiration, annulation, retrait, dernier propriétaire).
