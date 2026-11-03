# 0014. Visites et photos dans un bucket privé, journal lisible dérivé, « ce qui a changé » par membre, export versionné

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 6 ajoute les visites avec photos (S4), le journal d'activité lisible (S6), « ce qui a
changé depuis ma dernière visite » (K4) et l'export CSV et JSON (portabilité, étude § 5). Le
modèle du lot 0 portait une table `visits` (date, participants, compte rendu, colonne JSON
`photos`) jamais écrite : aucune visite dans les deux bases locales. Le journal `activity_logs`
est alimenté depuis le lot 1 sur chaque écriture (action, avant, après, canal), sans lecture.
Le « vu par » (`listing_views`) existe depuis le lot 1. Le stockage Supabase était désactivé.

## Décision

1. **Visites** : `visits` gagne l'état (`planned`, `done`), les points positifs et négatifs, une
   note sur 5, l'auteur et la tâche de préparation ; les participants restent des identifiants
   de membres (colonne `participants`). La colonne JSON `photos`, vide partout, est supprimée ;
   les photos sont des lignes `visit_photos`. Une visite planifiée peut créer la tâche
   « Préparer la visite » (nouvelle origine de tâche `visit`) ; une visite faite propose
   « visité » (une visite planifiée, « à visiter »), jamais appliqué d'office, comme les offres
   (ADR 0009). Le MCP ajoute et liste les visites, sans photo ni suppression.
2. **Photos** : un seul bucket privé (`visit-photos`, `STORAGE_BUCKET_VISIT_PHOTOS`) avec **un
   dossier par espace** (`<espace>/<annonce>/<visite>/<photo>.jpg` et sa vignette), aucune
   politique d'accès public ou authentifié : seule l'API (clé `service_role`) signe. Écart avec
   la lettre de la consigne (« bucket privé par espace ») : un bucket par espace demanderait de
   créer des buckets à la volée et autant de réglages en cloud, pour une isolation que l'API
   assure déjà (chemins dérivés côté serveur de l'espace du membre, URL signées seulement pour
   les lignes de son espace). L'envoi est direct, du navigateur au stockage, par deux URL
   d'envoi signées (photo et vignette) ; la fin d'envoi vérifie présence, taille et type
   (refus et suppression sinon) ; le bucket borne aussi taille (10 Mio) et types. Le navigateur
   réduit la photo (2 048 px, JPEG) et tire la vignette (360 px, WebP ou JPEG) sur une toile,
   ce qui retire les métadonnées EXIF (position GPS). Lecture par URL signées de 600 s
   (`STORAGE_SIGNED_URL_TTL_SECONDS`). Une photo ne se supprime que par son auteur, en REST ;
   une visite qui porte des photos d'un autre membre ne se supprime pas. Les tests remplacent le
   stockage par un faux en mémoire (`PHOTO_STORAGE`).
3. **Journal lisible** : `GET /activity` et `GET /listings/:id/activity`, paginés, filtres
   membre, canal et sorte. La phrase et le détail des champs (valeurs en euros, m², dates,
   libellés) sont dérivés à la lecture par `domain/describeActivity` à partir de l'action et de
   l'avant / après, et la sorte par `contracts/activityKindOf` (même table pour le filtre SQL).
   Rien n'est réécrit dans les lignes existantes. Les réglages personnels (préférences de
   notification, abonnements push, « vu ») ne sont pas journalisés : ce ne sont pas des
   données de l'espace.
4. **« Ce qui a changé »** : par membre, `last_visit_at` (dernière activité) et
   `whats_new_since` (point de départ) avec sa source. Le web signale une visite au chargement
   et au retour sur l'onglet ; après trente minutes sans activité, le point de départ avance à la
   fin de la visite précédente (`domain/nextVisitWindow`), sinon il ne bouge pas : le bandeau
   reste jusqu'à « tout marquer comme vu » (point de départ à maintenant, toutes les annonces
   vues). Un événement compte s'il suit à la fois ce point et la dernière ouverture de la fiche,
   et s'il ne vient pas du membre lui-même **dans l'application** : ce que Claude a fait pour lui
   au MCP est signalé ; avis et tâches ne comptent que venant de l'autre membre ; les
   changements d'une annonce nouvelle s'y fondent (sauf l'entrée dans un critère). Même calcul
   (`domain/computeWhatsNew`) pour le bandeau, la fiche (`GET /listings/:id/changes`, lu avant
   de marquer la fiche vue, champs modifiés mis en évidence) et l'outil MCP `whats_new`
   (lecture seule, rien n'est marqué vu). Ouvrir une fiche met désormais à jour le « vu » à
   chaque ouverture, plus seulement à la première.
5. **Export** : `GET /export?format=csv|json&scope=workspace|selection` (filtres de la liste et
   `ids` pour une sélection). CSV pour un tableur français (« ; », UTF-8 avec BOM, virgule
   décimale, en-têtes en français, indicateurs de `domain`, apostrophe devant un texte qui
   commencerait par `=`, `+`, `-` ou `@`). JSON complet et versionné
   (`format: "apart-localizer.export"`, `version: 1`, validé par `ExportDocumentSchema`) :
   annonces avec indicateurs, avis, tâches, prix, offres, visites sans photos, comparables de
   loyer, critères, scénarios, hypothèses et leur historique ; membres sans e-mail. Pas d'outil
   MCP d'export. Format décrit dans [docs/export.md](../export.md).

## Conséquences

- Migration `20261103230000_lot6_visits_notifications` (avec les tables de l'ADR 0015) ;
  suppressions d'index GiST proposées par Prisma écartées.
- Le stockage local s'active dans `supabase/config.toml` (bucket déclaré, créé par `supabase seed buckets`) ;
  en cloud, le bucket se crée à la main (docs/deploiement.md). Sans bucket, l'envoi de photo
  répond 503 et les visites restent lisibles.
- Une fiche jamais ouverte ne met rien en évidence : elle est « nouvelle » en entier.
- Le CSV ne porte qu'une ligne par annonce ; le détail (offres, visites, tâches) est dans le
  JSON.
