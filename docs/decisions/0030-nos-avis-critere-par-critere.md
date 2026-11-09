# 0030. Nos avis, critère par critère : critères de l'espace, avis à l'aveugle côté serveur, confrontation dans `domain`

Statut : acceptée, 9 novembre 2026. Précise 0014 (journal), 0015 (notifications) et 0029 (Synthèse).

## Contexte

« Nos avis » (Synthèse de la fiche, lot 19) ne gardait qu'une note sur 5 et une phrase par
membre. Richard veut que chacun note plusieurs critères (lumière, calme, état…) pour ensuite
confronter les avis : où l'on est d'accord, où l'on ne l'est pas, ce qu'il faut revoir à la
contre-visite. Une maquette (Synthèse confrontée, saisie critère par critère, avis à l'aveugle,
téléphone, liste et comparaison, réglage des critères, À faire, Historique, notification, MCP) et
ses règles ont été validées.

## Décision

- **Critères de l'espace.** Huit par défaut, clés stables en anglais (`luminosity`, `layout`,
  `condition`, `quiet`, `outdoor`, `building`, `street`, `feel`), libellés et aides en français
  (`DEFAULT_OPINION_CRITERIA` dans contracts). Un propriétaire renomme, masque, réordonne, ajoute
  (clé générée `custom_…`), dix critères au plus, masqués compris. Renommer garde les notes (la
  clé ne change pas) ; masquer retire le critère des fiches et des calculs, ses notes restent en
  base ; un critère par défaut ou noté ne se retire pas (il se masque), un critère ajouté jamais
  noté si. Chaque réglage entre au journal (`opinion_settings.*`). Aucun réglage au MCP.
- **Défauts paresseux, à l'écriture.** Un espace sans ligne `opinion_criteria` a les huit
  critères par défaut, lus depuis contracts (`effectiveOpinionCriteria`) ; ses lignes s'écrivent
  au premier réglage d'un propriétaire (les huit, puis le changement), sous un verrou de l'espace.
  Pourquoi pas dans la migration : une seule source pour les libellés (contracts), aucun espace
  oublié quel que soit son chemin de création (API, jeu de démo, import, tests), et aucune
  écriture sur une lecture. Le résultat est identique : la même liste, les mêmes clés.
- **Échelle en mots, note globale à part.** 1 rédhibitoire, 2 bof, 3 correct, 4 bien,
  5 excellent ; « — » = pas d'avis (pas de ligne, ou une note nulle avec un mot) ; jamais 0 en
  base (contrainte `CHECK`). Un mot facultatif par critère (80 caractères). La note globale
  (`Opinion.rating`) et la phrase restent : la moyenne des critères n'est qu'une indication,
  jamais recopiée. Les notes se fusionnent par clé (`PUT …/opinions/me`, `add_opinion`) : seules
  les clés données changent, null efface ; garde-fou `expectedUpdatedAt`.
- **Avis à l'aveugle, appliqué côté serveur.** Activé par défaut, réglable par espace. Tant qu'un
  membre n'a noté ni critère affiché ni note globale sur une annonce, les notes, mots, phrase et
  désaccords des autres ne lui sont jamais rendus : `splitOpinionsForViewer` (domain) les sépare
  avant toute réponse — fiche, liste, avis, comparaison, MCP, journal et « ce qui a changé »
  (`redactOpinionActivity` : qui, combien de critères, « après la visite »), export. Il voit qui a
  noté et combien de critères. « Voir quand même » (`opinion_reveals`) les révèle pour lui sur
  cette annonce ; sa première note porte alors « après avoir vu celui de … »
  (`opinions.seen_member_ids`). **Export** : la règle la plus prudente, celle de l'écran, pour le
  membre qui exporte ; un avis masqué n'est pas dans le fichier.
- **Confrontation dans `domain`.** `confrontOpinions` : par membre (état visible, masqué ou
  manquant, note globale, moyenne des critères, après visite), par critère (notes, écart max − min,
  accord), désaccord à partir de 2 points, accords, note commune = moyenne, sur les critères notés
  par tous, des moyennes par critère, calculée seulement quand chaque membre actif a un avis
  visible (« en attente » sinon), et la phrase de bilan (« D'accord sur 5 critères. Désaccord sur
  le calme (Richard 4, Chloé 2) et « on s'y voit » (4 et 2). Chloé n'a pas encore noté la rue. »),
  rien d'inventé. « Après visite » : la dernière visite faite de l'annonce, avec le membre parmi les
  participants, avant son avis.
- **Effets.** « Ce qui plaît » : un critère noté au moins « bien » par tous ; « À surveiller » : un
  « rédhibitoire », puis les désaccords ; ces points viennent après ce qui tranche (verdict d'un
  côté, contrôles de louabilité bloquants de l'autre) et avant le reste, trois au plus. « Prochaines
  étapes » : « À rediscuter » après la visite planifiée. Sur un désaccord, « À revoir à la
  contre-visite : le calme » propose une tâche (titre, contexte des notes et des mots dans
  `tasks.details`, origine `opinion`, rangée avec les visites) que le membre confirme ; jamais
  créée d'office. Journal : « Chloé a donné son avis : 3/5, 7 critères. Deux désaccords avec
  Richard : calme, on s'y voit. » ; notification `opinion_added` aux autres membres (le nombre de
  désaccords avec chacun, ou « à toi de noter » sans les notes), préférences habituelles. Liste :
  colonnes par membre, note commune, désaccords ; filtre `opinions` (« À rediscuter », « Avis en
  attente ») et tris `commonScore`, `disagreement`. Comparaison : une ligne par critère, la
  meilleure note commune en gras. **Le verdict ne change pas** ; aucun poids par personne.
- **MCP.** `add_opinion` accepte des notes par critère (clé ou libellé de l'espace) dictées par le
  membre, toujours pour le membre connecté (`member` qui désigne un autre membre : refus rendu) ;
  sa description dit que Claude ne note jamais à la place de quelqu'un. Les lectures rendent ce
  que le membre voit. Toujours trente-neuf outils, aucun de suppression.
- **Données.** Migration additive `20261110100000_lot20_opinion_criteria` : tables
  `opinion_criteria`, `opinion_scores`, `opinion_reveals`, colonnes `opinions.rated_at`,
  `opinions.seen_member_ids`, `workspaces.opinions_blind`, `tasks.details`, valeurs `opinion`
  (origine de tâche) et `opinion_added` (notification). Aucune donnée existante modifiée. Export
  JSON version 1 (ajouts seulement) ; CSV : trois colonnes en fin de ligne.

## Conséquences

- Un membre qui n'a pas noté ne voit plus l'avis de l'autre (comportement nouveau, voulu) ; « Voir
  quand même » ou la case « Avis à l'aveugle » de l'espace le rétablissent.
- La première lecture d'un avis d'avant le lot 20 dérive sa première note de `rating` et de la
  création ; il n'a aucune note par critère et compte comme noté s'il a une note globale.
- Plus tard : des poids par critère pour la note commune, un rappel « noter la visite » par
  notification, l'avis à l'aveugle levé automatiquement après une date.
