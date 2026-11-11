# 0036. Trouver, comparer, Claude : filtres visibles et compteurs qui les suivent, comparaison dans l'URL, vrais liens, une page « Claude »

Statut : acceptée, 11 novembre 2026. Précise 0031 (étapes), 0026 (exploration), 0017 (portées et
consentement du connecteur), 0020 (couches de carte) et 0032 à 0035 ; dernier des lots 22 à 26
issus de l'audit d'interface du 10 novembre 2026.

## Contexte

Les filtres actifs restaient cachés derrière « Filtres (n) », suivaient d'une étape à l'autre, et
les compteurs de la barre venaient de l'aperçu non filtré : une étape pouvait paraître vide sans
raison visible. Un clic n'importe où sur la carte posait un filtre de rayon. Comparer passait par
« Filtres », « Voir le tableau complet », puis des cases dont la sélection vivait dans le tableau
seul ; le retour de la comparaison perdait l'étape et la vue. Les lignes, cartes et lignes de
tableau ouvraient la fiche chacune à sa façon (un `<article tabindex=0>` sans rôle, un `<tr>`
cliquable), sans lien : pas de « ouvrir dans un nouvel onglet ». Aucune page ne disait comment
brancher Claude ni ce qu'il avait fait. Au téléphone, le lot 25 avait coûté de la place : l'en-tête
de la fiche finissait vers 290 px, trois pastilles de jugements prenaient deux lignes dans chaque
ligne de liste, et la phrase de la Synthèse empilait des parenthèses.

## Décision

- **La réponse de la Synthèse** (`listingAnswer`, domain) : le mot qui répond (« Oui », « Peut-être »,
  « Pas à ce prix », « Plutôt non », « Pas encore de réponse »), puis **trois raisons courtes au plus**
  (`reasons`, `ANSWER_REASONS_MAX`), une phrase chacune, « Tête : détail. », jamais de parenthèses
  imbriquées : rentabilité (le DPE qui échoue nommé par sa classe, `dpeClass`), prix cible (« Baisser
  le prix ne suffit pas : le DPE la laisse hors cible, même à 159 070 € »), recherche ; la recherche
  passe en tête quand c'est elle qui dit non. Mêmes faits, rien d'inventé ; `sentence` reste le
  texte suivi.
- **Les jugements d'une ligne** : un jugement « à confirmer » n'est pas un jugement ; une ligne de
  liste l'omet (`rowJudgements`) et le dit au lecteur d'écran (`pendingJudgementsText` : « Rentabilité
  et recherche à confirmer ») ; la fiche, les cartes et le tri le montrent en entier. Au téléphone,
  forme « mini » : le symbole et la forme courte (« ✓ Renta. »), la valeur lue par le lecteur d'écran
  et l'infobulle ; pour chaque jugement, un symbole ne correspond qu'à une valeur, donc rien n'est
  perdu. Sur ordinateur, l'étiquette entière.
- **L'en-tête de la fiche au téléphone** : la ligne collée porte retour, titre (deux lignes au plus),
  prix, « Corriger » et **le statut en menu court sur la ligne du prix** ; dessous, une ligne de
  jugements (formes courtes) et une ligne de faits et de pastilles qui défile en largeur (rien de
  retiré, tout replié) ; la barre d'onglets commence à 142–162 px (290 avant).
- **Filtres visibles, compteurs qui suivent.** Une puce par filtre actif au-dessus de la liste
  (`activeFilterChips`, domain : une seule règle, celle de « Filtres (n) » aussi), retirable, et
  « Tout effacer » (le tri reste : il ne cache rien). **Les compteurs suivent les filtres** : sous
  des filtres, la page fait une seule lecture de tous les statuts (au lieu de l'étape seule ; changer
  d'étape ne relit rien) et `stageCountsUnderFilters` compte chaque étape selon la règle de l'aperçu
  (hors critères non gardée repliée, brouillons écartés aux archives) en gardant le total : « 1/4 »,
  « avec les filtres », la phrase entière pour le lecteur d'écran. Une étape vide sous des filtres
  dit lesquels et combien d'annonces ils cachent (`hiddenByFiltersText`). Les filtres restent
  partagés entre les étapes, comme avant, mais se voient. Limite : la lecture filtrée est d'une page
  de 200 annonces ; au-delà, les compteurs seraient bas (l'espace en est loin).
- **Comparer.** Une case sur chaque ligne d'annonce, chaque carte et chaque ligne du tableau ; la
  sélection vit dans l'URL de la page (`?comparer=a,b,c`, store `filters`) : elle survit à la fiche
  ouverte, au retour, à un lien partagé. Une barre « Comparer (n) » collée en bas de la liste, au-dessus
  de la barre du bas au téléphone. **Six au plus** (`COMPARE_MAX`, contracts) : la limite de l'API et
  du MCP (`CompareRequestSchema`), et ce qu'une table côte à côte garde de lisible sur 1440 px ; une
  case de plus se désactive. La page Comparer emporte la requête de la page Annonces (étape, vue,
  filtres) : « Retour aux annonces » y ramène, sélection cochée ; un titre de la comparaison est un
  lien vers la fiche, que la fermeture rend à la comparaison (l'historique, lot 25). Le tableau
  complet entre dans le choix de la vue (« Tableau », ordinateur seulement ; trop large au téléphone) :
  il est allumé quand il est affiché.
- **Vrais liens.** Le titre d'une annonce est un lien du routeur dans les lignes, les cartes, le
  tableau et la comparaison, avec la requête de la page (étape, vue, filtres, sélection) : clic du
  milieu et nouvel onglet fonctionnent. Une seule cible au clavier : le lien. La carte s'ouvre au
  clic partout par un lien étiré (`::after`), la case passe au-dessus ; une ligne du tableau s'ouvre
  au clic de souris sauf sur un lien, un bouton, une case ou avec une touche (nouvel onglet), et n'a
  plus de `tabindex`. `aria-sort` sur chaque en-tête triable (« none » quand il ne trie pas). Le
  bouton retour après la fermeture d'une fiche ne la rouvre pas (lot 25, vérifié). La page Annonces
  ne réécrit plus l'URL quand on la quitte vers Comparer.
- **La page « Claude »** (`/claude`, dans le menu du compte sur ordinateur et dans « Plus » au
  téléphone ; l'étape « Connecter Claude » de la mise en route y mène) : l'adresse du connecteur à
  copier (une adresse locale est signalée : claude.ai ne la joint pas), les quatre étapes dans
  claude.ai (repliées quand Claude écrit déjà pour le membre), **ce qu'on sait honnêtement** :
  `GET /activity/claude` lit le journal (canal `mcp`) par membre actif ; `claudeUsage` (domain) dit
  « jamais vu », « écrit pour un autre membre, pas encore pour toi » ou « branché pour toi », avec la
  dernière écriture. Une lecture par Claude ne laisse pas de trace et aucune API ne liste les
  applications autorisées : la page ne prétend jamais « connecté ». Puis les demandes courtes à
  copier, une par prompt du serveur (`CLAUDE_REQUESTS`, contracts) avec le titre de l'invite
  (`MCP_PROMPT_TITLES`, que le serveur MCP utilise pour enregistrer ses prompts : un test e2e vérifie
  noms et titres) ; aucun corps de prompt n'est recopié. Les messages aux agences à valider (le bloc
  de l'accueil), la liste des explorations avec leur compte rendu, et ce que Claude a écrit (cinq
  entrées du journal, « Tout voir » ouvre l'activité filtrée `?canal=mcp`). Les filtres de l'activité
  vivent dans l'URL (`canal`, `membre`, `type`). Le brief d'un critère renvoie à la page et copie la
  même demande d'exploration.
- **Cartes.** Carte des annonces : un clic ne pose plus de filtre ; « Filtrer autour d'un point »
  passe en mode pose (le clic suivant pose le point), puis le rayon, « Déplacer le point », « Retirer
  le point » ; couches, légendes, fond de carte et couleur des repères repliés derrière « Couches et
  légende (n) », un panneau posé sur la carte ; une ligne de contrôles au-dessus de la carte (76 px
  entre la question de l'étape et la carte, environ 460 avant) ; gestes coopératifs au toucher. Carte
  d'un critère au téléphone : gestes coopératifs hors dessin (un doigt fait défiler le panneau, deux
  doigts la carte), coupés pendant le dessin ; consignes « Touche » ou « Clique » selon le pointeur ;
  « Annuler le dernier point » (annulation par mode de terra-draw) et « Effacer » (vide la forme ;
  l'enregistrement demande alors un périmètre) ; « Placer le point ici » après une adresse trouvée par
  `GET /opendata/geocode` (point et rayon, départ d'une isochrone). Toute couche passe toujours par
  `upsertGeoJsonLayer`.
- **L'application installée sur l'iPhone** : `apple-touch-icon` de 180 px opaque, icône masquable à
  part (marge de sécurité) et `purpose` séparés, `id`, `scope`, titre « Apart », barre d'état
  opaque ; une aide courte (« Plus » et préférences de notification) pour l'ajouter à l'écran
  d'accueil depuis Safari, montrée seulement sur iPhone ou iPad hors application installée.
  Documentation consultée le 11 novembre 2026 : WebKit, « Web Push for Web Apps on iOS and iPadOS »
  (iOS 16.4, 16 février 2023) : le push n'existe que pour une application ajoutée à l'écran d'accueil,
  et l'autorisation suit un geste ; WebKit, « News from WWDC25 » (9 juin 2025) : depuis iOS 26, un
  site ajouté s'ouvre en application web par défaut, rien ne change pour le push. Aucune lecture
  hors ligne n'est ajoutée (seule la coquille est mise en cache).
- **Retouches** : « Ouvrir la fiche » sur les cartes de téléphone du compte rendu d'exploration ;
  « Copié » redevient « Copier » après deux secondes (`useCopy`) ; « Vos notes s'écartent » devient
  « Nos notes s'écartent » (le « vous » collectif retiré des écrans du membre).

## Conséquences

- Aucune migration ni variable nouvelle. Une route de lecture (`GET /activity/claude`, contrôleur de
  l'activité, DTO de `contracts`, e2e). **Aucun outil MCP ajouté, retiré ni changé** : les cinq
  prompts gardent noms, titres et textes ; le serveur n'envoie toujours rien à une agence.
- Sous des filtres, la liste lit tous les statuts en une fois (archives comprises) : un peu plus de
  calcul côté serveur par lecture filtrée, aucune lecture de plus au changement d'étape.
- La sélection à comparer apparaît dans l'URL de la page Annonces et dans les liens des fiches ; un
  identifiant illisible est ignoré.
- Non vérifié sur un iPhone : la ligne de faits qui défile en largeur, la barre « Comparer » au-dessus
  de la barre du bas et du clavier, les gestes coopératifs dans le panneau d'un critère et le glissé
  des sommets, l'aide d'installation et le push dans l'application installée ; captures sur
  Chromium seulement.
