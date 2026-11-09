# 0031. Suivre ses annonces, étape par étape : six étapes, trier c'est proposer, décisions à plusieurs

Statut : acceptée, 9 novembre 2026. Précise 0015 (notifications), 0026 (brouillons) et 0029 (fiche).

## Contexte

La page Annonces mélangeait tout : les onglets d'adéquation, les pastilles de statut, les
brouillons à part. Richard s'y perd et veut un flux de travail : une vue des annonces à valider,
à étudier, à visiter, un mode pour tout classer d'un coup, et, à deux, que l'autre membre valide
un changement d'étape. Une conception et une maquette ont été validées (étapes, bandeau « Ce qui
t'attend », tri, passage du second membre, « À trancher ensemble », téléphone, fiche).

## Décision

- **Six étapes à la place des onglets et des pastilles** (`?etape=`, `WorkflowStageSchema`) : À
  valider (brouillons en attente), À étudier, À visiter, Visitées, Offres, Archives. L'étape se
  déduit du statut (`stageOfStatus`), aucune donnée ne bouge. Les anciens liens (`?vue=a-valider`,
  `?fit=`, `?status=`, notifications déjà envoyées) sont redirigés. Dans chaque étape les annonces
  hors critères sont repliées en bas (`isFoldedOut`), sauf si une proposition y est en cours : une
  décision à prendre reste visible. Le tableau complet reste accessible depuis « Filtres »
  (comparaison, colonnes par membre).
- **Trier, c'est proposer.** Garder ou écarter un brouillon, passer une annonce À visiter, écarter
  une annonce demandent l'accord de tous les membres actifs quand l'espace en a au moins deux et
  que « Décider à plusieurs » est activé (`agreementRequired`, `choiceOfStatusChange`). Tout le
  reste s'applique tout de suite (visite faite, offre, vendue, retour À étudier, Repêcher, « c'est
  la même », liens du lot 18). La règle est dans `domain` ; `POST /decisions`, `POST
/listings/:id/status`, `POST /listing-drafts/:id/accept` et `PATCH /listing-drafts/:id` y passent
  tous. Les propositions n'ont pas d'expiration.
- **Le modèle : une proposition, des réponses** (`decision_proposals`, `decision_responses`). Une
  proposition vise soit une annonce, soit un brouillon (`CHECK`), au plus une en cours par cible
  (index uniques partiels). États : ouverte, à trancher, appliquée, retirée, caduque. D'accord de
  tous : la décision s'applique et **seule** la ligne `listing.status_changed` (ou `draft.accepted`)
  entre au journal, en citant l'auteur et qui confirme. Non : à trancher ensemble (les choix côte à
  côte, un clic d'un membre suffit). « Décider sans attendre » reste au seul auteur, sur une
  proposition ouverte, et entre au journal avec cette mention. Un brouillon gardé devient une
  annonce **à l'accord complet**, par `DraftsService.accept` : avant, rien n'est créé.
- **Caducité.** Au moment d'appliquer, si l'annonce a changé de statut ou si le brouillon n'attend
  plus, la proposition se ferme caduque sans rien appliquer et l'interface le dit. Un fait appliqué
  directement (vendue, « c'est la même ») ferme la proposition ouverte de la même transaction.
- **Le départ d'un membre** : on ne l'attend plus ; ses propres propositions sont retirées ; une
  proposition qui n'attendait plus que lui reste ouverte, applicable par son auteur (« Décider sans
  attendre »), rien n'est appliqué d'office. Réglage désactivé plus tard : les propositions ouvertes
  se résolvent normalement.
- **Mode tri, annulation.** Une annonce à la fois (`/annonces/tri`, session et position dans l'URL,
  détails dans `sessionStorage`). Annuler retire la dernière proposition, réponse ou changement de
  statut ; quand la décision a déjà créé une annonce, Annuler n'est pas offert et une phrase renvoie
  vers la fiche pour l'écarter : on ne supprime jamais une annonce.
- **Écarter demande une raison, toujours.** La maquette montrait un « Écarter sans raison » que les
  règles validées excluent ; il n'existe pas. Une raison se choisit en un clic ou s'écrit (« Autre »).
- **Une notification par session de tri.** Elle part à « Terminer et prévenir », ou en quittant le
  tri s'il y a au moins une proposition ; même regroupement pour le retour. Hors session (fiche,
  MCP), aussitôt. **Si un onglet se ferme sans terminer, il n'y a pas de notification** : le
  navigateur ne le dit pas de façon fiable ; les propositions restent visibles dans le bandeau « Ce
  qui t'attend » de l'autre membre. Une `session` non terminée n'empêche rien d'autre.
- **MCP.** Pas d'outil nouveau (39 outils, aucune suppression). `set_listing_status` sur une
  décision à deux crée une proposition au nom du membre connecté et répond que l'annonce ne bouge
  pas ; si un autre membre a déjà proposé, l'appel est refusé en renvoyant vers l'application :
  Claude ne confirme jamais pour l'autre, ne tranche pas, ne décide pas sans attendre. `update_listing`
  ne peut plus changer le statut par la bande.
- **Compteurs légers.** `GET /decisions/overview` donne les compteurs et « Ce qui t'attend » sans la
  liste ; pendant un tri, seules ces données sont relues après chaque clic.
- **Annuler après un brouillon écarté ou un statut appliqué** repasse par les services existants
  (`drafts.decide('pending')`, `listings.setStatus`), journalisé ; un brouillon accepté n'a pas
  d'annulation.

## Conséquences

- Migration strictement additive (`20261111100000_lot21_decisions`) : deux tables, une colonne à
  valeur par défaut, valeurs d'énumération de notification ; aucune donnée existante modifiée, les
  annonces restent à leur statut (donc à leur étape).
- `?vue=`, `?fit=` et `?status=` restent lus le temps de la redirection ; `FitTabs` disparaît.
- Export JSON : additif (`decisions`, `decideTogether`), version inchangée ; CSV : une colonne
  « Décision en attente » en fin de ligne.
- Une session non terminée laisse des propositions sans notification ; l'autre membre les voit tout
  de même, à sa prochaine visite de la page.
- Un brouillon écarté n'est pas une annonce suivie : les archives le montrent à côté des annonces
  écartées (`GET /listing-drafts?status=dismissed`, compté dans l'étape), sans fiche, et
  « Repêcher » le remet À valider.
- À valider filtre côté navigateur : le panneau n'y montre que ce qui existe pour un brouillon
  (pas d'avis, de « nouvelles pour moi », de « à revérifier » ni de « plusieurs portails ») et les
  tris possibles (prix, prix au m², surface, date) ; sans loyer visé, aucun verdict ne convient.
