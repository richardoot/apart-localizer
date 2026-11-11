# 0033. Le téléphone et l'accueil : une barre en bas, « Ce qui t'attend » en tête, toutes les tâches, la mise en route

Statut : acceptée, 10 novembre 2026. Précise 0031 (« Ce qui t'attend ») et 0032 (socle
d'interface) ; deuxième des lots 22 à 26 issus de l'audit d'interface du 10 novembre 2026.

## Contexte

Au téléphone (iPhone visé), l'en-tête collé prenait trois lignes (130 px sur 844), une seule
annonce tenait sur le premier écran de la liste et l'accueil faisait 5,9 écrans. « Ce qui
t'attend » n'existait que dans Annonces ; l'accueil montrait six tuiles, un « Par statut » qui
doublait les étapes avec un autre vocabulaire (et des liens `?status=` dont les chiffres ne
collaient pas à l'étape ouverte), « 71 tâches ouvertes » sans lien. Un espace vide affichait des
zéros. Rien ne disait qui est connecté ; les pages secondaires n'allumaient aucune entrée.

## Décision

- **Navigation** (`lib/navigation.ts`, seule table des entrées allumées) : au téléphone, une
  barre en bas (`BottomNav` : Accueil, Annonces, Ajouter, Notifications, Plus ; 60 px plus
  `safe-area-inset-bottom`) et un en-tête d'une ligne (56 px : la marque et le membre connecté,
  vers « Plus »). « Plus » est une page (`/plus`) : qui est connecté, Critères, Hypothèses,
  Activité, Espace, Critères des avis, le thème (clair, sombre, auto), la déconnexion. Sur
  ordinateur, l'en-tête garde cinq entrées de 44 px ; espace, critères des avis, notifications,
  thème et déconnexion passent dans un menu du compte (`AccountMenu`, `UiMenu`) dont le bouton
  porte le nom du membre. Chaque page secondaire allume sa page parente (brief d'un critère et
  compte rendu d'exploration : Critères ; critères des avis et notifications : le compte ;
  comparer : Annonces ; toutes les tâches : Accueil).
- **Qui possède le bas de l'écran.** Une seule mesure, posée par `App.vue` en variables CSS
  (`style.css`) : `--bottom-nav-space` (la place gardée sous la page) et `--bottom-nav` (le
  décalage de ce qui est collé en bas : la zone de messages, la barre d'enregistrement des
  Hypothèses). Le tri et « À trancher » restent des pages nues, sans barre ; la fiche et la
  nouvelle annonce sont des panneaux plein écran au téléphone : ils couvrent la barre et rendent
  la page inerte (reka-ui), leur pied et leur zone de messages gardent la marge de l'encoche.
  « Ajouter » ouvre la nouvelle annonce existante (le lot 24 y mettra la capture courte).
- **Le clavier à l'écran.** Safari iOS ne rétrécit pas la fenêtre de mise en page quand le
  clavier s'ouvre : un élément collé en bas peut couvrir le champ. La barre se retire dès qu'un
  champ qui ouvre un clavier (ou le sélecteur d'une liste) a le focus, et quand la fenêtre
  visible perd plus d'un quart de sa hauteur sans zoom (`useKeyboardOpen`) ; `--bottom-nav`
  repasse alors à zéro. `min-h-dvh` pour la page.
- **« Ce qui t'attend » en tête de l'accueil**, calculé par le seul `workflowOverview` (domain)
  et servi par `GET /decisions/overview`, étendu : visites à venir (planifiées aujourd'hui ou plus
  tard, heure de Paris, la plus proche en précision), messages à valider, relances dues (la
  règle des jours ouvrés du lot 17, calculée par le serveur), tâches en retard (ouvertes depuis
  plus de quatorze jours, la règle de la synthèse), en plus des lignes du lot 21. Chaque ligne
  porte sa précision (`detail`) et l'annonce qu'elle vise quand elle n'en vise qu'une
  (`listingId`) : la ligne ouvre alors la fiche au bon onglet, sinon l'étape, le tri, le bloc
  des messages de l'accueil ou toutes les tâches en retard (`lib/home.ts`). La réponse porte
  aussi les tâches ouvertes et en retard (`tasks`). Aucune note n'y entre (« avis à donner » ne
  lit que « a noté ou non » pour le membre connecté). La page Annonces garde les lignes de ses
  étapes (`STAGE_AGENDA_KEYS`).
- **Le reste de l'accueil** : « Depuis ta dernière visite » en une ligne, le détail à la demande ;
  les messages à valider (validation par lot inchangée) ; « À valider » réduit au compte au
  téléphone ; les six étapes à la place du « Par statut » (plus aucun lien `?status=` émis) et les
  tâches ; les nouvelles annonces et les meilleures (une carte au téléphone, trois sur ordinateur,
  « Voir les N ») ; les critères ; les chiffres généraux en bas. Une fiche ouverte depuis
  l'accueil, les tâches ou le tri y revient à la fermeture (par l'historique, `closesBack`), et
  son bouton retour le dit (« Accueil »).
- **Toutes les tâches** (`/taches`, `GET /tasks/open`, lecture seule, `openTasksView` de
  domain) : les tâches ouvertes des annonces suivies, par annonce, celles qui ont du retard
  d'abord, la plus ancienne en tête ; « En retard » dans l'URL (`?retard=1`). Cocher passe par la
  route de l'annonce, comme dans la fiche (même journal), et se défait par « Annuler ».
- **Mise en route** (`GET /workspace/getting-started`, `gettingStarted` de domain) : hypothèses
  enregistrées (plus d'une version, ou une autre que celle créée d'office), un critère actif, une
  annonce, Claude vu. Un espace sans annonce ni annonce à valider voit la liste entière à la place
  des chiffres ; ensuite, ce qui reste, en bref, en bas. Claude n'est « vu » que s'il a écrit au
  journal (canal `mcp`) : une lecture ne laisse pas de trace, l'étape le dit. En attendant la page
  « Claude » du lot 26, l'étape copie l'adresse du connecteur et dit où la coller dans claude.ai.
- **Annonces au téléphone** : « Ce qui t'attend » sur une ligne qui défile ; le titre et l'export
  rangés (titre lu par les lecteurs d'écran, export et choix de la vue dans « Filtres ») ;
  « Filtres » sur la ligne de la question ; l'état et le bouton d'une ligne côte à côte. L'étape
  courante est ramenée au milieu de sa barre ; quand « Ce qui t'attend » change l'étape, la
  question de l'étape reçoit le focus et vient à l'écran.
- **Retouches du lot 22** : un champ en erreur n'a plus qu'un trait autour de sa case (le
  contour du focus prend la couleur de l'erreur, collé à la bordure, `controlFocusClasses`) ;
  l'en-tête d'ordinateur a des cibles de 44 px.

## Conséquences

- Aucune migration, aucune variable nouvelle, aucun outil MCP nouveau. `WorkflowOverviewSchema`
  et `WorkflowAgendaItemSchema` gagnent des champs à valeur par défaut (`tasks`, `detail`,
  `listingId`) et quatre clés ; deux routes de lecture s'ajoutent.
- `GET /decisions/overview` lit en plus les demandes aux agences en attente
  (`AgencyRequestsService.pending`) et les tâches des annonces : un peu plus lourd, toujours sans
  la liste des annonces.
- La règle « en retard = ouverte depuis plus de quatorze jours » reste celle de la synthèse ; avec
  la checklist par défaut, une annonce suivie depuis deux semaines compte une dizaine de tâches en
  retard. La rendre plus fine (échéance par tâche) demanderait une colonne.
- Non vérifié sur un iPhone : la barre qui se retire au clavier, `safe-area-inset-bottom` dans
  l'application installée, le défilement des barres de pastilles ; captures sur Chromium
  seulement.
