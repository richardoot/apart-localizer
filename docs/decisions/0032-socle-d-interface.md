# 0032. Socle d'interface : composants partagés, une zone de messages, une garde des modifications

Statut : acceptée, 10 novembre 2026. Précise 0023 (Hypothèses) et 0029 (fiche) ; premier des lots
22 à 26 issus de l'audit d'interface du 10 novembre 2026.

## Contexte

L'audit d'interface a relevé dans `apps/web/src` 281 boutons pour 159 recettes de classes, 144
champs de texte pour 22, quatre composants partagés seulement, 35 copies du même bandeau
d'erreur, 24 composants qui gèrent leur propre `failure`, 23 « Chargement… » sans squelette ni
« Réessayer », aucune garde de navigation, et des nombres illisibles enregistrés vides en silence
(« 45 m² » dans une fiche, « 250k » dans un critère). Une requête échouée ressemblait à « rien à
faire » (tri, « À trancher », « À valider »). Les textes mélangeaient « vous » (52 fichiers) et
« tu » (8). Le téléphone visé est un **iPhone** (Safari et l'application installée sur l'écran
d'accueil).

## Décision

- **Des composants partagés, une seule recette chacun** (`components/ui`, classes dans
  `lib/ui.ts`, pur et testé) : `UiButton` (principal, secondaire, contour, destructif, discret,
  lien ; « en cours » ; lien du routeur ou externe), `UiField` (le `UnitField` des Hypothèses
  généralisé : intitulé, « ? », provenance, « à compléter », « modifié », unité dans la case,
  aide, erreur au champ) avec ses cases `UiInput`, `UiSelect`, `UiTextarea`, `UiCheckbox`,
  `UiBadge`, `UiCard` (`rounded-2xl p-4`), `UiChip`, `UiSegmented`, `UiMenu`/`UiMenuItem` et
  `UiPopover` sur reka-ui (Échap, clic ailleurs, retour du focus : la cloche, l'export),
  `UiConfirm` (confirmation sur place, à la place du dernier `window.confirm`), `UiAlert`,
  `UiIcon` (un seul jeu d'icônes au trait, `lib/icons.ts`, dessiné pour l'application, aucune
  dépendance), `UiSkeleton`. `UnitField`, `SelectField` et `FormField` disparaissent.
- **Une zone de messages** (`stores/feedback.ts`, `FeedbackHost`) : la réussite s'y dit, avec
  « Annuler » quand l'action se défait par les appels existants (tâche cochée, « Repêcher »,
  réponse du vendeur). L'erreur s'affiche **dans la section où l'on a cliqué** (`useAction`,
  `UiAlert`), plus en haut de la page. Un panneau modal (`SidePanel`) rend la page inerte : il a sa
  propre zone, seule la plus récente montre les messages. Le message d'un échec est écrit une
  fois (`lib/errors.ts` : celui du serveur, « Pas de connexion au serveur » sans réseau, sinon le
  repli de l'action).
- **Trois états communs pour une lecture** (`QueryState`) : squelette pendant le premier
  chargement (annoncé aux lecteurs d'écran), erreur avec « Réessayer » à la place du contenu,
  vide qui dit quoi faire et parle des filtres quand il y en a (« Effacer les filtres »). Une
  relecture qui échoue garde les données affichées sous un message.
- **Une garde des modifications** (`stores/leave-guard.ts`, `useLeaveGuard`, `UnsavedDialog`) :
  une saisie en cours s'y déclare (section de la fiche, nouvelle annonce, critère dessiné). Le
  bouton retour du navigateur et le glissé arrière de l'iPhone (garde du routeur), la fermeture
  d'un panneau, le rechargement après une mise à jour du service worker (`lib/pwa.ts` : il attend,
  « Mettre à jour » le propose) et la fermeture de l'onglet (`beforeunload`) passent par elle. La
  fiche garde son bandeau « Modifications non enregistrées » ; les autres saisies passent par une
  boîte commune aux mêmes mots. Un retour arrière accepté est rejoué en arrière (l'historique
  n'est pas empilé).
- **Saisie** : un nombre illisible est refusé avec un message au champ qui reprend ce qui a été
  tapé (`numberInputError`), jamais enregistré vide ; aucune valeur n'est ramenée en silence dans
  ses bornes. À l'échec, le premier champ en erreur reçoit le focus ; une erreur dans une autre
  section de la fiche est nommée, avec son message ; un refus du serveur se dit dans la section.
  Les charges utiles d'une saisie valide ne changent pas (`legacy-save.fixture.ts`,
  `legacy-listing-save.fixture.ts`).
- **Tactile et lisibilité (iPhone)** : toute cible fait 44 px au téléphone et sur un écran tactile
  (`pointer-coarse`), un peu moins à la souris ; les champs sont à 16 px (Safari iOS zoome au
  focus en dessous : règle constatée et documentée par la communauté, pas par Apple, à vérifier
  sur l'appareil) ; focus visible partout (`:focus-visible` global de spécificité nulle) ;
  ce qui est collé en bas (zone de messages, pied d'un panneau, barre d'enregistrement) respecte
  `safe-area-inset-bottom`. Encre des fonds pleins par jeton (`--good-fg`, `--warn-fg`,
  `--bad-fg` : blanc en clair, sombre en thème sombre) au lieu de `text-white` ; DPE de A à F en
  encre sombre ; plus d'opacité sur les lignes écartées ; plus de tailles arbitraires de 10, 11
  ou 13 px ; `font-display` en graisse 700 (seules 500 et 700 sont chargées).
- **Textes** : « tu » partout, sauf ce qui s'adresse à un tiers (les messages aux agences du
  lot 17, leur signature et leurs formules de politesse restent au « vous ») ; pluriels accordés
  (`plural`, plus de « (s) ») ; vocabulaire de développeur retiré des écrans ; l'accueil s'appelle
  « Accueil » (« Synthèse » reste le premier onglet de la fiche).

## Conséquences

- Aucun changement d'API, de schéma, de DTO ni de calcul ; seuls des textes de `domain` et de
  `contracts` changent (tutoiement, pluriels), avec leurs tests.
- Safari iOS n'envoie pas `beforeunload` de façon fiable : fermer l'onglet ou l'application n'y
  demande rien ; le glissé arrière, lui, passe par la garde du routeur.
- Un nouvel écran n'écrit plus de bouton, de champ, de carte ni de pastille à la main : il prend
  les composants de `components/ui`. Les quelques exceptions restantes (contrôles spécialisés)
  portent un commentaire « Lot 22 ».
- Les lots 23 à 26 (navigation au téléphone, mode visite, fiche pleine page, filtres visibles)
  s'appuient sur ces composants, la zone de messages, `QueryState` et la garde.
