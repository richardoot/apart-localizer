# 0023. Page Hypothèses : sections en questions, sommaire, modifications suivies, saisie émise à l'identique

Statut : acceptée, 5 novembre 2026.

## Contexte

La page Hypothèses empilait une quarantaine de champs en grilles de même poids, sous des titres
techniques (« Phase 1, fiscalité et horizon »), unités dans les intitulés, critères du prix cible
dans une liste séparée de leurs seuils, barème du notaire déplié d'office, et un seul bouton
« Enregistrer » au bas d'une page très longue, sans dire ce qui avait changé. Richard : « c'est
très compliqué à lire ». La maquette validée (ordinateur et mobile 390 px) hiérarchise : l'essentiel
d'abord, le détail sur demande.

## Décision

- **Cinq sections en questions**, chacune avec « Sert à : … » : financement (repère « Pour
  100 000 € empruntés »), bonne affaire (une ligne par seuil et sa case « prix cible », marge de
  négociation repliée avec son échelle), calendrier (phase 1 puis phase 2, l'année par défaut
  rappelée sous la date et modifiable à la demande), frais de notaire (barème ou forfait en choix
  segmenté, résumé et taux effectif, détail replié), fiscalité et revente (repliée en pastilles sur
  ordinateur).
- **Un sommaire selon l'écran.** Sur ordinateur (`min-width: 1024px`, lu par `matchMedia`), une
  colonne d'ancres collée en haut, un résumé d'une ligne par section, la section lue mise en avant
  (`IntersectionObserver`). Sur mobile, chaque section est un accordéon (vrai bouton,
  `aria-expanded`) dont l'en-tête porte ce résumé ; financement et bonne affaire ouverts. Les deux
  rendus ne coexistent pas dans le DOM : un seul titre, des identifiants uniques.
- **Présentation seulement.** Schémas, API, versions, MCP et calculs inchangés ; aucune migration.
  La conversion du formulaire (`lib/assumptions-form.ts`) est celle d'avant, à l'identique, mêmes
  arrondis compris. Un test rejoue des saisies enregistrées en faisant tourner l'ancien formulaire
  avant la refonte (`legacy-save.fixture.ts`) et exige les mêmes hypothèses émises. Les nombres
  s'affichent à la française (« 40 000 », « 3,65 ») par une réécriture textuelle exacte, que
  `parseNumberInput` relit au même nombre. « Marché (DVF) » ne se coche toujours pas dans le web ;
  reçu du MCP, il est signalé et gardé.
- **Modifications suivies.** Chaque champ est comparé au formulaire chargé, à la valeur près
  (« 3,65 » vaut « 3.65 ») : « ● modifié · avant … » sous le champ, nombre par section, barre
  collée en bas (nombre et liste, nom facultatif, Annuler, « Voir l'impact » au-dessus de la barre,
  Enregistrer). Sans modification, la barre n'est qu'une ligne d'état. Si une nouvelle version
  arrive pendant la saisie, les champs modifiés gardent la saisie et les autres prennent la
  nouvelle version (aucune valeur reçue écrasée sans avoir été touchée).
- **Erreurs en français, au champ.** Les refus du contrat sont rattachés au champ avec son unité
  (« 40 ans au maximum ») ; une liste dans la barre mène au champ, ouvre sa section et y porte le
  focus. Les deux règles d'avant restent (seuil net exigé s'il est retenu, décote tendue au moins
  égale à la négociable) ; la case du net reste grisée tant que son seuil est vide.
- **Calculs dans `domain`.** `assumptions-reading.ts` : `referenceMonthlyPayment` (mensualité pour
  100 000 €, `monthlyPayment`), `notaryEffectiveRate` (taux effectif sur 200 000 €,
  `notaryFeesFromScale`), `discountScale` (échelle des décotes). Les résumés sont du formatage pur
  côté web (`lib/assumptions-summary.ts`).
- **Glossaire enrichi** (`INDICATOR_GLOSSARY`, donc aussi `apart://glossaire`) : assurance
  emprunteur, vacance locative, frais fixes du bailleur, phases 1 et 2, TMI, indexation des loyers ;
  une phrase courte pour le coût d'occupation, les régimes fiscaux et la VAN, que la page montre.

## Conséquences

- La page se lit de haut en bas comme une suite de questions ; le détail rarement modifié (barème,
  fiscalité, marge, année par défaut) est replié, une modification ou une erreur l'ouvre.
- Cases de 48 px sur mobile, 44 px sur ordinateur, unités dans la case, clavier numérique ou
  décimal, aucun défilement horizontal de page à 390 px ; l'historique défile dans sa boîte.
- Enregistrer sans aucune modification n'est plus proposé (créer une version identique n'avait pas
  d'usage) ; le nom de version est limité à 120 caractères, comme le contrat.
- La ressource MCP `apart://glossaire` gagne six entrées, compatibles.
