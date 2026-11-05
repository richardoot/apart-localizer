# 0024. Adéquation aux critères : quatre niveaux, marge de tolérance par critère, contour pour une adresse imprécise, mesures PostGIS et décision dans `domain`, rien n'est perdu

Statut : acceptée, 5 novembre 2026. Précise 0010 (§ 1, 2, 3, 5) et lève la limite notée « plus
tard » par 0022 (§ 7).

## Contexte

Jusqu'ici l'appartenance d'une annonce à un critère était binaire et testée sur son **point**
(`ST_Intersects(l.geom, c.perimeter)`) : une annonce placée au quartier dont le repère (centre du
quartier) tombe hors du polygone sortait du critère même si son quartier le chevauche ; aucune
tolérance (221 000 € pour un maximum à 220 000 € sortait ; une surface inconnue faisait échouer la
surface minimale) ; rien ne distinguait une annonce qui ne correspond plus à aucun critère.
Richard demande que les annonces actives coïncident avec les critères actifs, que celles qui en
sortent passent dans un état différent sans être perdues, et des critères non stricts : un peu
hors du polygone ou un peu au-dessus du prix doit rester visible ; une annonce au quartier ne doit
pas sortir tant que l'adresse exacte n'est pas connue. Conception et maquette validées (page
Annonces avec deux onglets, bloc de la fiche, marge de la page Critères, mobile 390 px). En
production, aucun critère n'existe encore.

## Décision

1. **Quatre niveaux, distincts du statut** (`CriteriaFitLevelSchema`, `contracts/criteria-fit.ts`) :
   `in` « Dans les critères », `to_confirm` « À confirmer », `margin` « À la marge », `out` « Hors
   critères ». Pour un critère, le niveau est le moins bon de ses filtres ; pour l'annonce, le
   meilleur parmi les critères actifs (à égalité, le plus ancien), le détail par critère étant
   gardé. **Aucun critère actif : tout est `in`**. Ordre de préférence in > to_confirm > margin >
   out, gardé tel que proposé : « à confirmer » veut dire que rien ne contredit le critère
   (l'information manque), « à la marge » qu'un seuil est dépassé à coup sûr ; une annonce à la
   fois à confirmer et à la marge est donc « à la marge ». Le filtre `statuses` d'un critère et le
   statut de l'annonce **ne font pas partie** de l'adéquation (ils disent ce que le critère compte
   et ce que la liste montre) ; le filtre `verdicts` en fait partie, sans marge : un changement
   d'hypothèses peut changer l'adéquation.
2. **Règles** (`criteriaFit`, `domain/criteria-fit.ts`, pur) :
   - adresse exacte ou à la rue : le repère décide ; dans le périmètre = dans, à moins de la marge
     = à la marge (« 180 m hors du périmètre (marge 300 m) »), au-delà = hors (« à 2,4 km du
     périmètre ») ;
   - **adresse au quartier ou à la commune : le contour décide, jamais le repère** (l'exemple de
     Richard) : contour (`location_area`, lot 12) entièrement dedans = dans ; contour qui touche
     le périmètre élargi de la marge = à confirmer, « adresse à préciser », jusqu'à ce que
     l'adresse soit connue ; contour entièrement au-delà = hors. Sans contour : le repère et la
     marge, au mieux à confirmer. Point et rayon, polygone et isochrone suivent la même logique ;
   - distance au tram : depuis le repère ; pour une adresse imprécise, depuis la partie du contour
     la plus proche d'un arrêt, au mieux à confirmer ;
   - une donnée manquante (repère, surface, pièces, DPE, commune, arrêts de tram non importés)
     rend « à confirmer », **jamais « hors critères »** (le DPE inconnu, « retenu à vérifier »
     depuis le lot 4, devient « à confirmer ») ;
   - prix, surface, pièces, DPE avec leur marge ; commune et verdict sans marge ; chaque filtre
     non respecté donne une raison chiffrée en français (« Prix +3,6 % (maximum 220 000 €, marge
     5 %) », « 2 pièces (minimum 3) », « DPE E (maximum D, marge une classe) »).
3. **Marge de tolérance par critère** (`search_criteria.tolerance`, `CriteriaToleranceSchema`),
   défaut daté et sourcé `DEFAULT_CRITERIA_TOLERANCE` (validé par Richard le 5 novembre 2026) :
   périmètre 300 m, prix maximal +5 %, prix minimal −5 %, surface minimale −5 %, pièces 0, DPE une
   classe, tram +100 m ; 0 = strict. Réglable dans la page Critères (seuils réels « soit
   231 000 € », « Marge appliquée / désactivée ») et par le MCP (`tolerance`, fusionnée à la mise
   à jour).
4. **Une seule source de mesures, une seule décision** : `GeoService.criteriaFitMeasures` (et
   `criteriaFitMeasuresDraft` pour l'aperçu, ligne virtuelle `c`) remplace `CRITERIA_GEO_PREDICATE`
   et `APPROXIMATE` : distance du repère au périmètre, contour couvert, distance et part du
   contour dans le périmètre, distances au tram depuis le repère et depuis le contour, une fois
   par annonce. La décision, les textes et l'agrégation sont dans `domain` ; liste, aperçu,
   compteurs, alertes, MCP, export et rattrapage l'appellent tous.
5. **Stockage** (migration additive `20261106100000_lot14_criteria_fit`) : `criteria_matches`
   devient l'adéquation par (critère actif, annonce), à tout niveau, « hors critères » compris :
   `level`, `reasons`, `checks` (détail filtre par filtre), `level_changed_at` ; `matched_at` est
   la dernière entrée, `approximate` « à confirmer à cause de la localisation ». Une ligne non
   `out` est une entrée (badge, `criteriaMatches`). Sur l'annonce, `criteria_fit_level` (meilleur
   niveau, indexé), `criteria_fit_changed_at` et `criteria_fit_origin` (cause et déclencheur, pour
   « depuis »). Écrire l'adéquation **ne change pas `updatedAt`** de l'annonce : ce n'est pas une
   modification, et les garde-fous `expectedUpdatedAt` du MCP ne doivent pas en souffrir.
6. **Recalcul** (`CriteriaMatchService`, module global `CriteriaFitModule` pour que les
   hypothèses l'appellent sans dépendance circulaire) à chaque écriture qui peut le changer :
   annonce (création, modification, prix, statut, repère, géocodage, DPE retenu ou appliqué),
   critère (création, modification, archivage, suppression : toutes les annonces de l'espace),
   hypothèses (verdict), et rattrapage `pnpm refresh:criteria-fit` (`--dry-run`, `--workspace`,
   `--database-url`, idempotent, canal `system`) ; `relocate:listings` recalcule celle des annonces qu'il replace ; le rattrapage est enchaîné par `stack:up --opendata` après les
   arrêts de tram et le replacement des annonces.
7. **Journal, alertes, nouveautés** : une ligne par sorte de changement, avec critère, avant,
   après, raisons et cause (`listing`, `criteria`, `assumptions`, `refresh`) : `criteria.matched`
   (entrée : de hors critères ou jamais comparée à un niveau gardé), `criteria.unmatched` (sortie
   vers hors critères), `criteria.fit_changed` (dans, à confirmer, à la marge entre eux). Une
   première comparaison hors critères n'est pas journalisée (rien n'a bougé pour le membre). Seules
   les entrées dues à **l'annonce** alertent (notification `criteria_matched`, inchangée) et
   comptent dans « ce qui a changé » avec les sorties (nouvelle sorte `criteria_exit`) : quand un
   membre modifie un critère ou les hypothèses, il voit l'effet à l'écran (aperçu, compteurs), et
   un critère créé ferait entrer d'un coup toutes les annonces ; le rattrapage n'alerte pas. Une
   sortie n'envoie pas de push : elle n'appelle pas d'action immédiate, l'annonce reste visible
   dans l'onglet « Hors critères » et dans « ce qui a changé ». Les lignes d'avant le lot 14 (sans
   cause) restent lues comme venant de l'annonce.
8. **Page Annonces** : deux onglets « Dans les critères · n » (in, to_confirm, margin) et « Hors
   critères · n », filtre `fit` dans l'URL (Pinia ⇄ URL) ; pastilles « Adéquation » ; pastilles
   lisibles sans la couleur (pleine avec une coche, bord pointillé, ambre, gris foncé) et la
   raison dessous ; **exception** : une annonce hors critères avec une offre en cours (offre faite
   ou acceptée) ou une visite prévue reste aussi dans l'onglet principal (« Gardée dans la liste :
   offre en cours »). Les compteurs des onglets suivent les autres filtres, pas l'onglet ; la
   carte suit l'onglet. Les écartées et vendues restent gouvernées par le filtre de statut. Avec
   `criteriaId`, les niveaux sont ceux de ce critère.
9. **Fiche** : « Correspond-elle à ce qu'on cherche ? » en tête de la synthèse : niveau,
   explication, « Préciser l'adresse » quand la localisation reste à confirmer, détail par critère
   filtre par filtre (valeur, seuil, marge), marges appliquées, historique daté tiré du journal
   (`GET /listings/:id/criteria-fit/history`) ; la carte du quartier montre les périmètres des
   critères actifs sous le contour du quartier retenu (couche marquée, ADR 0020).
10. **MCP** (29 outils, aucun nouveau) : `list_listings` gagne `fit[]` et rend par défaut
    l'onglet principal (exception comprise) ; chaque annonce porte `criteriaFit` et le texte
    l'affiche ; `get_listing` donne le détail par critère ; `list_search_criteria` les compteurs
    par niveau et la marge ; `create_search_criteria` et `update_search_criteria` acceptent
    `tolerance` et rendent `fitChanges` ; `criteriaChanges` des écritures d'annonces donne les
    entrées, sorties et changements de niveau ; `set_assumptions` l'adéquation recalculée ;
    `whats_new` les sorties.
11. **Export** : colonnes « Adéquation » et « Raisons de l'adéquation » **en fin** de CSV (les
    colonnes existantes ne bougent pas) ; `criteriaFit` par annonce et `tolerance` des critères
    dans le JSON, champs ajoutés : la version du format reste 1.

## Conséquences

- La limite notée par 0022 (« une annonce dont le repère est hors du périmètre n'y entre pas,
  même si une partie de son quartier y est ») est levée : elle est « à confirmer ».
- Les critères existants (aucun en production) prennent la marge par défaut : une annonce un peu
  au-delà d'un seuil qui en était exclue y revient « à la marge ». Pour retrouver l'ancien
  comportement strict, « Marge désactivée » (ou `tolerance` à 0). Les tests du lot 4 ont été
  ajustés en ce sens.
- À déployer : la migration, puis `refresh:criteria-fit` en simulation et en vrai
  (docs/deploiement.md § 2). Sans critère en production, il ne fait qu'écrire « dans les
  critères » sur les annonces ; le premier critère créé compare toutes les annonces.
- Après un import qui change les mesures (arrêts de tram, contours) sans écriture d'annonce, les
  niveaux enregistrés retardent jusqu'au rattrapage ou à la prochaine écriture ; les compteurs et
  l'aperçu de la page Critères, recalculés à la lecture, sont toujours à jour.
- Le contour d'une commune entière (annonce « commune seulement ») touche souvent un périmètre :
  une telle annonce est souvent « à confirmer » ; c'est voulu (rien ne la place dehors) et
  « Préciser l'adresse » la tranche.
- Plus tard : une marge par critère plus fine (prix au m², distance au tram par ligne) ; la
  distance au tram maximale d'un contour (une annonce au quartier tout près d'un arrêt pourrait
  être « dans ») ; un schéma du périmètre et du contour dans la fiche elle-même.
