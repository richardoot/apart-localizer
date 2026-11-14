# 0047. Lot 32 : photos du portail, brouillons lus comme une fiche, lecture complète par Claude

Statut : acceptée, 15 novembre 2026. Complète 0026 (exploration), 0040 (champs du connecteur) et
0044 (brouillons au connecteur) ; ne change pas la photo de couverture de 0035.

## Contexte

Les membres retournaient sur les portails pour trois raisons : voir les photos, juger une annonce
« À valider » (la carte d'un brouillon ne montrait que prix, surface, pièces, DPE et lieu), et
retrouver ce qui manquait à la fiche, le plus souvent les charges de copropriété et la taxe
foncière. Pour les brouillons d'exploration, la cause était la consigne même : Claude ne lisait que
les pages de résultats (qui n'affichent ni charges ni taxe foncière) et n'ouvrait une annonce qu'en
dernier recours. Pour les fiches créées au connecteur, la taxe foncière envoyée sans extrait était
écartée (0040) et les charges, souvent affichées par mois dans une section repliée, oubliées.

## Décision

1. **Photos du portail = des liens** (`portalPhotos`, `contracts/src/portal-photos.ts`) : liens
   https des images de l'annonce, dans l'ordre de la page, trente au plus (`PORTAL_PHOTOS_MAX`),
   relevés par Claude dans le navigateur de l'utilisateur (`create_listing`, `update_listing`,
   `update_draft`, `record_exploration` → `photos`) ou envoyés en REST. Le serveur ne télécharge
   ni la page ni l'image : le navigateur du membre affiche l'image depuis le portail
   (`referrerpolicy="no-referrer"`, CSP `img-src https:` déjà permise). Une image retirée par le
   portail disparaît ; si aucune ne se charge, la galerie le dit. Colonne
   `listings.portal_photos` (JSONB, `[]` par défaut, migration additive) ; les brouillons les
   portent dans leur fiche pré-remplie. Fusion : les photos de la fiche absorbée complètent une
   fiche qui n'en a pas ; journal : « N photos », jamais la liste.
2. **Galerie** (`PortalPhotos.vue`) : grande photo, flèches, vignettes de 44 px, dans la Synthèse
   de la fiche (après les quatre chiffres) et dans le détail d'un brouillon. La couverture des
   listes reste la photo de visite (0035).
3. **Brouillon lu comme une fiche** (`DraftDetailPanel.vue`, `lib/draft-details.ts`) : la première
   photo en tête de carte, « Voir tout le détail » ouvre un panneau : photos, les quatre chiffres
   (`keyFigures`, hypothèses de l'espace), jugements et adéquation, faits par thème (le bien,
   énergie, copropriété et charges, prix et honoraires) où surface, pièces, étage, DPE, charges et
   taxe foncière sont dits « non indiqué » quand ils manquent, remarques, description entière, lien
   vers le portail, « Ajouter à la liste ». Pas de données de quartier (tram, ventes, équipements) :
   elles sont calculées à la création de la fiche.
4. **L'exploration ouvre les annonces gardées** : après `triage_candidates`, Claude ouvre la page
   de chaque annonce nouvelle ou doublon probable (pas les hors critères, déjà suivies, écartées ni
   rattachées) et relève tout ce qu'elle affiche. L'annonce lue gagne `opened`, `description`
   (8 000 caractères, masquée), `photos` et les champs de la fiche (`CANDIDATE_PAGE_FIELDS` :
   honoraires, étage, ascenseur, construction, DPE complet, chauffage, extérieur, stationnement,
   cave, orientation, état, lots, procédures, travaux votés, syndic), recopiés dans le brouillon en
   provenance « annonce ». Une page ouverte sans charges ni taxe foncière le dit dans les remarques
   (« à demander »).
5. **Consignes de lecture en un seul endroit** (`domain/src/listing-reading-guide.ts`) :
   `READING_FACTS` (quoi, où, comment : charges ANNUELLES — mensuelles × 12, trimestrielles × 4 —,
   taxe foncière avec la phrase lue en extrait, photos sans logo ni carte) nourrit les
   `instructions` du serveur MCP (envoyées à l'initialisation), les descriptions des outils et le
   prompt d'exploration (`PAGE_READING_SUMMARY`). Les réponses de `create_listing`,
   `update_listing`, `get_listing`, `get_draft` et `update_draft` disent ce qui n'a pas été relevé
   (`readingGaps`, « Non relevé : charges de copropriété, taxe foncière et photos ») et demandent
   de relire la page ou de le dire au membre, sans rien estimer.

## Options écartées

- **Copier les images dans le bucket privé** : les photos survivraient au retrait de l'annonce,
  mais le serveur irait chercher des fichiers chez les portails (contraire à « pas de scraping
  serveur ») et le stockage grossirait. Choix du membre : des liens.
- **Envoyer les images en base64 par le MCP** : coûteux en jetons et lent pour vingt photos.
- **Ouvrir toutes les annonces lues, hors critères comprises** : plus long, plus exposé aux
  captchas, pour des annonces que le membre ne verra pas.
- **Le contexte de quartier dans le détail d'un brouillon** : des requêtes géographiques à chaque
  ouverture pour une annonce peut-être écartée ; il arrive à la création de la fiche.

## Conséquences

- Une migration (`20261117100000_lot32_portal_photos`), aucune variable, aucun outil MCP nouveau ;
  descriptions de `create_listing`, `update_listing`, `extract_listing`, `update_draft`,
  `check_listing`, `triage_candidates`, `record_exploration` et prompt `explore_listings` (une
  étape 6 de plus) mises à jour.
- L'export JSON porte `listing.portalPhotos` (liste vide dans un export antérieur) ; le CSV ne
  change pas.
- Le portail voit l'adresse IP du membre qui affiche ses photos, comme s'il ouvrait l'annonce
  (`docs/confidentialite.md`).
- Une photo de portail ne devient jamais la couverture d'une annonce (0035 tient).
