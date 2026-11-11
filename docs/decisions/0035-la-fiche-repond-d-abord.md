# 0035. La fiche répond d'abord : pleine page sur ordinateur, une phrase et une action, trois jugements étiquetés, une photo de couverture

Statut : acceptée, 11 novembre 2026. Précise 0029 (la fiche en sept onglets), 0014 (photos de
visite), 0030 (avis), 0031 (étapes et décisions à plusieurs) et 0032 à 0034 ; quatrième des lots
22 à 26 issus de l'audit d'interface du 10 novembre 2026.

## Contexte

La fiche s'ouvrait dans un tiroir de 1160 px sur un écran de 1440 (une bande de liste grisée
inutile à gauche) ; seule la barre d'onglets restait collée : retour, titre, prix et verdict
disparaissaient au défilement. La Synthèse commençait par le journal « Depuis ta dernière
ouverture », en entier (3,6 écrans de téléphone, un premier écran qui ne répond à rien). Trois
jugements indépendants s'affichaient en pastilles sans étiquette : une même carte portait
« Cible » et « Hors critères ». Dans Négocier, 65 ventes comparables précédaient « Prix et offres »
(3,5 écrans, 5 au téléphone) ; la réponse du vendeur s'enregistrait au changement d'une liste ; le
formulaire d'offre se vidait avant la réponse du serveur. Au téléphone, « Nos notes » était dans un
dépli fermé en bas du bien, le prix ne se corrigeait que dans la cinquième carte, et les boutons
d'une section longue passaient sous le clavier. Un conflit d'enregistrement affichait une date ISO.
Aucune image ne distinguait deux appartements.

## Décision

- **Pleine page sur ordinateur, panneau au téléphone, une seule route.** La fiche reste la route
  enfant `/annonces/:id` de la page Annonces (liens directs, `?onglet=`, anciens onglets
  `financer`, `suivi`, `echanges`, notifications inchangés). À partir de 1024 px (`FICHE_PAGE_QUERY`,
  `lib/navigation.ts`), la page Annonces cache sa liste (`v-show` : étape, filtres, lignes
  dépliées et défilement gardés ; la carte MapLibre se remonte au retour, elle ne se dessine pas
  dans un bloc caché) et montre la fiche comme une page sous l'en-tête de l'application
  (`FicheShell` : un `article`, pas de dialogue) ; en dessous, le panneau plein écran du lot 19
  (dialogue reka-ui). Une nouvelle route de premier niveau aurait cassé le panneau du téléphone et
  doublé les règles d'URL ; deux composants auraient doublé la fiche. Défilement (règle du
  routeur, `listingScroll`) : un panneau s'ouvre et se ferme sans faire bouger la liste ; la
  pleine page s'ouvre en haut ; un retour arrière reprend la position enregistrée par le routeur.
  **Fermer revient par l'historique** quand la page d'avant est l'accueil, les tâches, le tri (lot 23) ou la liste elle-même (`closeTarget`) : même étape, mêmes filtres, même position, et le
  bouton retour du navigateur ne rouvre plus la fiche fermée depuis la liste ; un lien direct
  mène à la liste. La garde des modifications (lot 22) passe par les mêmes chemins.
- **Une ligne d'identité collée** (`ListingIdentity`) : retour, titre, prix (« Corriger »), les
  trois jugements étiquetés et le statut sur ordinateur ; au téléphone, retour, titre (deux
  lignes au plus) et prix, les jugements et le statut juste dessous dans l'en-tête qui défile,
  pour que les trois étiquettes tiennent en entier sur 390 px. La barre d'onglets se colle sous la
  ligne, quelle que soit sa hauteur (mesurée) ; le bandeau « Modifications non enregistrées » et
  les ancres se posent sous le tout (`--fiche-sticky`).
- **La Synthèse répond d'abord.** En tête, la réponse en une phrase (`listingAnswer`, domain) :
  « Oui », « Peut-être », « Pas à ce prix », « Plutôt non » ou « Pas encore de réponse », puis la
  rentabilité (et ce qui échoue), le prix cible (la décote et son classement, ou « le DPE la
  laisse hors cible quel que soit le prix ») et la recherche (avec la raison) ; sans prix ou sans
  loyer visé, elle le dit et ne juge pas la rentabilité. Ensuite l'action que l'étape demande
  (`ficheNextAction`, sur l'état des lignes du lot 21 `listingRowKind`) : trier (le tri, qui
  propose quand l'espace décide à plusieurs), répondre à une proposition (le bandeau de
  décision), trancher, planifier une visite (le formulaire de « À faire » s'ouvre), ouvrir le mode
  visite (visite le jour même, heure de Paris), préparer la visite, donner mon avis, voir nos
  désaccords, préparer une offre, noter la réponse du vendeur, repêcher (par le changement de
  statut habituel, donc une proposition à plusieurs). « Depuis ta dernière ouverture » tient en
  une ligne (`listingChangesLine` : combien, qui, quels champs), son détail à la demande. Chaque
  prochaine étape mène à son bloc (`nextStepTarget`).
- **Trois jugements étiquetés, une seule source.** `contracts/src/fiche.ts` :
  `JUDGEMENT_KEYS` (rentabilité, recherche, location, toujours cet ordre), `JUDGEMENT_LABELS`,
  `JUDGEMENT_SHORT_LABELS` (« Renta. », « Rech. », « Loc. »), `JUDGEMENT_DESCRIPTIONS` ;
  `listingJudgements`, `judgementsOfListing`, `judgementsOfDraft` (domain) : un jugement qui ne
  s'applique pas (aucun critère actif) est omis sans changer l'ordre ; sans loyer visé, un
  brouillon garde « Rentabilité : À confirmer » (lot 16). Un seul composant (`JudgementPills`) :
  symbole (✓, ~, ✗, ?) et mot, jamais la couleur seule ; formes courtes dans les lignes au
  téléphone, l'étiquette entière pour le lecteur d'écran. Partout : lignes d'étape (et brouillons
  « À valider »), cartes (et l'accueil), fiche, tri, brouillons ; le tableau, la comparaison, le
  filtre, la projection, la sensibilité et « Préparer une offre » nomment « Rentabilité » ce qui
  s'appelait « Verdict ». Le mot « Verdict » reste celui du glossaire et du MCP (aucun outil
  changé).
- **Négocier** : « Prix et offres » sous le prix cible, les ventes comparables ensuite, cinq
  d'abord puis « Voir les N ventes ». La réponse du vendeur se choisit, puis se confirme
  (« Enregistrer « Refusée » comme réponse du vendeur… ? », le montant d'une contre-proposition
  dans la même confirmation) et se défait par « Annuler » (lot 22). L'offre et le nouveau prix
  gardent leur saisie jusqu'à la réponse du serveur ; un refus la laisse en place.
- **Le bien** : « Nos notes » juste après les travaux, lisibles sans déplier (la description
  brute reste repliée) ; « Corriger le prix » de l'en-tête ouvre la section « L'annonce et son
  adresse » sur le prix : même section, même charge utile (`legacy-listing-save.fixture.ts`
  inchangé), même garde-fou, même journal.
- **Édition par section** : « Modifier » met le focus dans la section (le champ demandé, sinon le
  premier), la fermeture le rend à « Modifier » ; au téléphone, « Annuler » et « Enregistrer »
  restent collés en bas de la section, au-dessus du clavier (`keyboardInset` : la fenêtre visible
  de Safari iOS) ; un conflit (409) se dit en mots, sans date technique, avec « Recharger en
  gardant ma saisie » : la fiche relue, les champs tapés de la section gardés, ceux changés des
  deux côtés nommés (`rebaseSection`). Les flèches de la barre d'onglets ne donnent plus le focus
  à un onglet que la garde a refusé.
- **Tableaux au téléphone** : le détail des avis et les ventes comparables passent en blocs
  empilés sous 640 px ; la projection, la sensibilité et le prix maximal par critère défilent dans
  leur propre cadre (région nommée, focus au clavier, première colonne collée, « Fais glisser le
  tableau… »), jamais la page.
- **Glossaire** : TRI, VAN et cash-flow net d'impôt ont leur « ? » dans la projection ; TRI et
  cash-flow gagnent leur phrase courte (`short`) dans `INDICATOR_GLOSSARY`. La ressource MCP
  `apart://glossaire` ne lit que les définitions longues : son contenu ne change pas.
- **Photo de couverture** : la photo choisie par un membre, sinon la première photo prête de la
  première visite (`coverPhotoOf`, domain) ; rien avant la première photo de visite ; jamais une
  image de portail. Choix sur la photo d'une visite (« Couverture », « Annuler » remet la
  précédente), `PUT /listings/:id/cover` (photo prête d'une visite de l'annonce, sinon 400/404 ;
  null : retour à la première), journalisé (`visit.cover_chosen`) sans toucher à la date de la
  fiche (aucun conflit pour une section en cours). Lecture `GET /listing-covers?ids=` (deux cents
  annonces au plus) : **vignettes seulement, signées en un seul appel au stockage** pour toute une
  liste, à la durée courte des photos (dix minutes par défaut), relues une minute avant
  expiration ; une image expirée disparaît et demande une relecture. Montrée dans la ligne
  d'identité (ordinateur), l'en-tête (téléphone), les cartes (et l'accueil) et les lignes
  d'étape, seulement quand elle existe. Colonne `listings.cover_photo_id` (migration additive,
  clé étrangère `ON DELETE SET NULL` : une photo supprimée rend la première).

## Conséquences

- **Une migration** (`20261112100000_lot25_listing_cover`, additive : une colonne facultative et
  sa clé étrangère) ; aucune variable nouvelle ; aucun outil MCP nouveau ni changé ; le MCP et
  l'export ne portent ni la couverture ni son URL (testé de bout en bout). `photo-storage.ts` reste le seul appelant du stockage
  (`ListingCoversService` passe par le même jeton `PHOTO_STORAGE`).
- Le message d'un conflit du serveur (avec sa date, lu aussi par le MCP) ne change pas : la
  fiche le remplace par le sien.
- La fiche pleine page garde la liste montée : un peu de mémoire, aucune requête de plus. Sa
  largeur est celle de la page Annonces (1280 px au plus).
- Au téléphone, les lignes d'étape portent une ligne de jugements de plus : la ligne du prix et
  du lieu fusionne pour compenser ; à l'étape À valider, trois annonces restent visibles, la
  troisième sans ses boutons.
- Non vérifié sur un iPhone : la barre collée au-dessus du clavier (`visualViewport`), le
  défilement des cadres de tableaux, les pastilles à la ligne ; captures sur Chromium seulement.
