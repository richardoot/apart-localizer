# 0042. Une adresse saisie recalcule la fiche : le point saisi cède à l'adresse trouvée, une règle unique des recalculs

Statut : acceptée, 12 novembre 2026. Modifie 0022 (placement du repère, point 8) ; complète 0011
(données ouvertes) et 0040 (BAN et INSEE à côté d'un point saisi).

## Contexte

Saisir l'adresse exacte d'une annonce dans la fiche ne recalculait rien quand son repère avait été
posé « à la main » : à la création par Claude (un point au quartier, souvent), par la carte ou par
le formulaire. Le formulaire renvoie l'ancien point avec la nouvelle adresse ; un point saisi
primant toujours (0022, point 8), le repère restait où il était, et avec lui la desserte, le
quartier, les équipements, les ventes DVF, la zone d'encadrement et l'adéquation aux critères. Pire,
l'identifiant BAN et l'adresse normalisée restaient ceux de l'ancienne adresse, et guidaient la
recherche du DPE. Une réponse d'agence qui donne l'adresse passait par le même chemin.

À côté, chaque écriture tenait sa propre liste des champs qui relancent les données ouvertes (fiche,
réponses d'agence, vérifications, liens, fusion), sans la même couverture ; une surface, un étage ou
une classe DPE corrigés ne relançaient jamais la recherche du DPE ; et l'interface ne relisait ni
l'historique de l'adéquation, ni le journal, ni les ressemblances après un enregistrement, ni la
conformité (Géorisques suit le repère) après une relance du géocodage.

## Décision

1. **Le point saisi renvoyé tel quel cède à une adresse trouvée à l'adresse**
   (`addressOverridesManualPoint`, `domain/manual-point.ts`). Quand l'adresse ou la commune
   changent et que le patch renvoie l'ancien point saisi, l'adresse est géocodée
   (`relocationNeeded` rend `if_address`) : trouvée au numéro ou à la rue, elle replace le repère
   (placement `address`, provenance `open_data`). Le point saisi reste seulement s'il est lui-même à
   l'adresse et à moins de `MANUAL_POINT_ADDRESS_TOLERANCE_METERS` (150 m) de l'adresse trouvée : il
   la précise (entrée, bâtiment). Trouvée seulement au quartier ou à la commune, l'adresse ne
   déplace pas un point saisi ; un quartier changé seul non plus. Un point nouveau dans le patch
   prime toujours.
2. **Le point saisi qui reste reçoit les sorties du géocodeur de la nouvelle adresse** (règle de 0040) : BAN et adresse normalisée près du point, code INSEE, sans second appel ; géocodeur muet,
   rien de l'ancienne adresse n'est gardé.
3. **L'ancien code INSEE n'oriente plus le géocodage d'une nouvelle commune**
   (`inseeCodeForLocate`).
4. **Une règle unique des recalculs** (`enrichmentNeeds`, `domain/listing-enrichment.ts`) pour la
   fiche, le connecteur, les réponses d'agence, les vérifications, les liens et la fusion : un
   repère ou une adresse changés relancent tout ; surface, pièces, époque de construction, étage,
   classe DPE et phase 2 relancent l'instantané et le plafond ; surface, étage et classe DPE
   relancent aussi la recherche du DPE (cache de trente jours). Dans la fiche, seules les valeurs
   qui changent comptent (`changedKeys`) : enregistrer une section sans rien changer de ces champs
   ne relance rien.
5. **L'interface relit tout ce qui dépend de la fiche** après chaque écriture
   (`invalidateListingReads`, `composables/useListings.ts`) : liste, étapes, prix cible,
   sensibilité, conformité et Géorisques, loyers comparables, contexte, contours, historique de
   l'adéquation, journal de la fiche, ressemblances et comparaison ; la relance du géocodage et le
   DPE passent par la même liste.

## Conséquences

- Une annonce créée par Claude au quartier se replace dès que l'adresse exacte est saisie, dans la
  fiche ou par une réponse d'agence, et tout ce qui part du repère suit.
- Un repère glissé à la main sur le bon bâtiment survit à une correction de l'adresse ; une adresse
  qui désigne un autre endroit l'emporte. Pour garder un point loin de l'adresse, on le replace
  après l'adresse.
- Le journal compte une entrée `listing.enriched` de moins quand une section est enregistrée sans
  changement utile.
