# Feuille de route

Lots courts, chacun livrable et testé. Les numéros renvoient aux besoins de
[etude-du-besoin.md](etude-du-besoin.md). Lancement validé le 3 novembre 2026.

## Lot 0 : socle

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

- Besoins C3 (prompt MCP « analyser cette annonce »), C4, C5, C6, C7.
- Extraction serveur depuis texte collé et captures ; fiche pré-remplie à valider ; provenance et
  confiance affichées ; champs manquants en tâches ; doublons détectés à la création ; géocodage
  de l'adresse extraite.

Fini quand : une annonce collée depuis Leboncoin est enregistrée en moins d'une minute avec moins
de trois corrections manuelles en moyenne sur dix essais.

## Lot 3 : prix cible et négociation

- Besoins N1 à N3, S5, C8, E5.
- Prix cible par critère, décote, classement ; tableau de sensibilité ; historique des prix et des
  offres ; frais de notaire par barème ; `get_target_price` et `record_offer` dans le MCP.

Fini quand : la fiche répond « à partir de quel prix » et la propriété `rdtBrut(prixCible) = s_b`
est testée.

## Lot 4 : critères géographiques et données ouvertes

- Besoins G3 à G7, D1 à D7, L2, L3, N4.
- Critères de recherche enregistrés et partagés ; périmètre dessiné (terra-draw) ; isochrones
  Géoplateforme ; alertes à l'entrée d'une annonce dans un critère, y compris à la création par
  le MCP ; `list_search_criteria`, `create_search_criteria`, `update_search_criteria`.
- Géocodage systématique, DPE ADEME, plafond d'encadrement automatique ; import des arrêts TBM
  et distance au tram ; import DVF Gironde et comparables dans un rayon ; couches de carte.

Fini quand : un polygone dessiné filtre la liste, la carte et le MCP de façon identique ; saisir
une adresse remplit coordonnées, DPE vérifié, plafond et arrêt le plus proche ; les comparables
DVF du quartier s'affichent avec leur date.

## Lot 5 : phase 1 et phase 2 avancées

- Besoins E3, E4, E6, E7, L4, L5.
- Coût d'occupation contre loyer actuel, scénarios « et si » enregistrables, fiscalité estimée,
  TRI et revente, loyer de marché par comparables saisis, checklist réglementaire datée.

## Lot 6 : confort

- Besoins S4, S6, S7, K4, C9.
- Visites avec photos, journal d'activité, notifications, « ce qui a changé », partage mobile,
  export CSV et JSON.
