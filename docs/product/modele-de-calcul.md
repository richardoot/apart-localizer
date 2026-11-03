# Modèle de calcul

Formules reprises de l'artefact actuel, puis étendues (coût d'occupation, prix cible,
sensibilité). Tout ce qui est décrit ici vit dans le paquet `packages/domain`, en fonctions pures
et testées, utilisé à l'identique par l'interface, l'API et le MCP.

## 1. Notations

| Symbole | Sens | Origine |
| --- | --- | --- |
| `P` | prix affiché (FAI) | annonce |
| `H` | honoraires d'agence à charge acquéreur (0 si à charge vendeur ou inclus net vendeur) | annonce |
| `n` | taux de frais de notaire (fraction, 7,5 % aujourd'hui) ou barème | hypothèses |
| `T` | total des travaux (somme des postes si la section est active, sinon 0) | annonce |
| `M` | mobilier | annonce |
| `A` | apport | hypothèses, surchargeable |
| `t`, `d`, `a` | taux nominal annuel, durée en années, assurance annuelle (fraction du capital) | hypothèses |
| `S` | surface | annonce |
| `L_v` | loyer visé HC mensuel | annonce |
| `L_p` | plafond mensuel d'encadrement = loyer de référence majoré au m² × `S`, si la commune est encadrée | référence + annonce |
| `L` | loyer retenu = `min(L_v, L_p)` si un plafond existe, sinon `L_v` | calcul |
| `v` | vacance en mois par an | hypothèses |
| `TF` | taxe foncière annuelle, estimée à `L` (un mois de loyer) si absente | annonce ou estimé |
| `C` | charges de copropriété non récupérables mensuelles, estimées à 25 % des charges annuelles / 12 si absentes | annonce ou estimé |
| `F` | frais fixes annuels (PNO, CFE, comptable, entretien) | hypothèses |
| `s_b`, `s_n` | seuils de rendement brut et net | hypothèses |
| `E` | effort mensuel maximal accepté | hypothèses |

Toute valeur estimée est marquée `estimated` dans la provenance et affichée « ≈ ».

## 2. Coût et financement

```
notaire   = n × (P − H)                      base = net vendeur quand les honoraires sont à charge acquéreur
cout      = P + notaire + T + M
emprunt   = max(0, cout − A)
r         = t / 12 ;  N = 12 × d
k         = r / (1 − (1 + r)^−N) + a / 12    facteur mensuel crédit + assurance (si r = 0 : 1/N + a/12)
mens      = emprunt × k
pm2       = P / S
```

### Frais de notaire : taux ou barème (lot 3, besoin E5)

Deux modes, choisis dans les hypothèses (`notaryMode`) et versionnés avec elles :

- **`rate`** (défaut, parité avec l'artefact et le jeu golden) : `notaire = n × (P − H)`.
- **`scale`** : barème d'un logement ancien, détaillé par poste sur l'assiette
  `B = P − H − mobilier compris dans la vente` (le mobilier à acheter pour louer meublé, `M`,
  n'entre pas dans l'assiette : il n'est pas vendu avec le bien) :

```
droits      = B × d × (1 + f) + B × c        d droit départemental, f frais d'assiette (fraction de d), c taxe communale
emoluments  = Σ sur les tranches de (part de B dans la tranche × taux de la tranche)
CSI         = max(B × 0,10 %, minimum)       contribution de sécurité immobilière
notaire     = droits + emoluments × (1 + TVA) + CSI + debours
```

Barème par défaut (`DEFAULT_NOTARY_SCALE` dans `contracts`), Gironde, relevé le 3 novembre 2026 :

| Poste | Valeur | Source |
| --- | --- | --- |
| Droit départemental `d` | **5 %** depuis le 1er mai 2025 (4,5 % de droit commun avant, et toujours 4,5 % pour les primo-accédants) | Loi n° 2025-127 du 14 février 2025 de finances pour 2025, art. 116 (hausse autorisée du 1er avril 2025 au 31 mars 2028) ; délibération de la Gironde relevée par legifiscal.fr (21 mai 2025), pretto.fr (mis à jour le 7 juillet 2026) et toutsurmesfinances.com (mis à jour le 28 octobre 2026, taux global 6,32 %) |
| Taxe communale additionnelle `c` | 1,20 % | CGI, art. 1584 |
| Frais d'assiette et de recouvrement `f` | 2,37 % du droit départemental | CGI, art. 1647 V |
| Émoluments proportionnels | 3,870 % jusqu'à 6 500 € ; 1,596 % de 6 500 à 17 000 € ; 1,064 % de 17 000 à 60 000 € ; 0,799 % au-delà ; TVA 20 % | Code de commerce, art. A444-91 (tarif en vigueur depuis le 1er janvier 2021, reconduit ; dernière prolongation annoncée jusqu'au 29 février 2028 par arrêté du 25 février 2026, à vérifier sur Légifrance) |
| Contribution de sécurité immobilière | 0,10 % de `B`, minimum 15 € | CGI, art. 879 et 881 K |
| Débours et émoluments de formalités | 800 € forfaitaires | estimation (≈ 0,4 % d'un bien à 200 000 € selon les simulateurs publics) |

Toutes ces valeurs sont modifiables dans les hypothèses (taux, tranches, forfaits). Le total est
marqué `estimated` dans les deux modes (taux forfaitaire, ou forfaits), donc affiché « ≈ ». Sur
l'exemple § 8 : 16 031 € en mode barème (8,0 % du prix) contre 15 000 € en mode taux. Le
primo-accédant doit ramener `d` à 4,5 % : l'application ne connaît pas la situation du foyer.

## 3. Phase 2 : exploitation locative

```
encaisse  = L × (12 − v)
netExpl   = encaisse − TF − 12 × C − F
rdtBrut   = 12 × L / cout
rdtNet    = netExpl / cout
effort    = netExpl / 12 − mens            négatif = somme à sortir chaque mois
loyerM2   = L / S
coutMax   = 220 × L                        repère : coût au-delà duquel le brut passe sous ≈ 5,45 %
```

### Verdict

| Critère | Échec | « De peu » |
| --- | --- | --- |
| Rendement brut | `rdtBrut < s_b − 0,7 pt` | `s_b − 0,7 pt ≤ rdtBrut < s_b` |
| Effort | `−effort > E + 80 €` | `E < −effort ≤ E + 80 €` |
| DPE | E, F ou G | inconnu |

`Hors cible` dès un échec, `À creuser` dès un « de peu », sinon `Cible`. Les marges (0,7 point,
80 €) deviennent des paramètres des hypothèses.

Score de tri : `2000 (cible) | 1000 (à creuser) | 0` + `rdtBrut × 1000`.

### Contrôles de louabilité

Repris de l'artefact, chacun rend `ok`, `warn`, `bad` ou `unknown` :

1. Calendrier d'interdiction de location selon le DPE (G : 2025, F : 2028, E : 2034) comparé à
   l'année de mise en location. Table de référence datée, pas une constante.
2. Encadrement : plafond connu et loyer visé sous le plafond ; plafond à saisir ; pas
   d'encadrement.
3. Loyer retenu contre loyer de marché constaté : écart > 8 % = risque de vacance.
4. Règlement de copropriété autorise la location visée.
5. Critères de décence.
6. Permis de louer dans le secteur.
7. Demande locative (forte, moyenne, faible).
8. Effort une fois loué sous le maximum.

Verdict : `Incompatible` dès un `bad` ; `Sous conditions` dès un `warn` ou à partir de trois
`unknown` ; sinon `Compatible`.

Ajouts du lot 4 (données ouvertes, voir [open-data.md](../open-data.md) et ADR 0011) :

- **plafond automatique** : le loyer de référence majoré de l'arrêté en vigueur (zone, pièces,
  époque, meublé ou vide, `lookupRentReference`) devient `refM2` de la phase 2 avec la
  provenance `open_data` tant que le membre n'en saisit pas un autre ; il nourrit le contrôle 2
  et `plafond = refM2 × S`. Il ne compte plus après la fin d'application de son arrêté
  (`referenceRentInForce`) ; une adresse sans numéro, une limite de zone ou une époque ambiguë
  le laissent « à vérifier » sans l'appliquer ;
- **validité du DPE** (`dpeValidity`, hors `rentalChecks` pour ne pas changer le nombre
  d'inconnues, donc les verdicts) : un DPE d'avant le 1er juillet 2021 n'est plus valable depuis
  le 1er janvier 2025 (le 1er janvier 2023 s'il date d'avant 2018), dix ans sinon ; audit
  énergétique signalé pour F et G (depuis le 1er avril 2023) et E (depuis le 1er janvier 2025)
  hors copropriété.

Reste prévu : complément de loyer éventuel signalé.

## 4. Phase 1 : coût d'occupation (lot E3)

Pendant la période où le bien est habité :

```
occupation     = mens + chargesCopro / 12 + TF / 12 + entretien / 12
fondsPerdus    = interets(annee 1) / 12 + assurance / 12 + chargesCopro / 12 + TF / 12 + entretien / 12
ecartLoyer     = occupation − loyerActuel          ce que coûte (ou rapporte) le passage de locataire à propriétaire
```

`interets(annee 1) ≈ emprunt × t` (approximation au premier ordre ; la version exacte somme les
intérêts des 12 premières mensualités du tableau d'amortissement). `loyerActuel` et `entretien`
sont de nouvelles hypothèses.

Capital restant dû après `m` mois (utile pour la revente et pour la bascule en phase 2) :

```
CRD(m) = emprunt × ((1 + r)^N − (1 + r)^m) / ((1 + r)^N − 1)
```

## 5. Prix cible (lot N1, N2)

Question : « à partir de quel prix ce bien entre-t-il dans la cible ? ». `netExpl` ne dépend pas
du prix (la taxe foncière estimée dépend du loyer, pas du prix), et `cout` est affine en `P`.
Chaque critère donne donc un prix maximal en forme fermée. On note `c⁻¹(x) = (x − T − M) / (1 + n)`
le prix correspondant à un coût total `x` (avec honoraires acquéreur : `(x − T − M + n × H) / (1 + n)`).

| Critère | Coût total maximal | Prix maximal |
| --- | --- | --- |
| Rendement brut ≥ `s_b` | `12 × L / s_b` | `P_b = c⁻¹(12 × L / s_b)` |
| Rendement net ≥ `s_n` | `netExpl / s_n` | `P_n = c⁻¹(netExpl / s_n)` |
| Effort ≥ −`E` | `A + (netExpl / 12 + E) / k` | `P_e = c⁻¹(A + (netExpl / 12 + E) / k)` |
| Repère 220 × loyer | `220 × L` | `P_220 = c⁻¹(220 × L)` |
| Marché (lot 4, N4) | | `P_m = S × prixM2Median(DVF)`, à partir de cinq ventes comparables |

Le critère effort n'a de sens que si `cout > A` (sinon la mensualité est nulle et l'effort vaut
`netExpl / 12`, indépendant du prix).

Critère « marché » (`maxPriceForMarket`, `marketStats`) : ventes DVF d'appartements (ni VEFA ni
adjudication, une mutation d'un seul appartement sans autre local) des trois dernières années,
surface à ±25 %, dans 500 m élargis à 1 000 puis 2 000 m faute de cinq ventes ; `prixM2Median` est
la médiane (quantiles par interpolation linéaire), sans ajustement. Elle est lue dans
l'instantané de l'annonce, donc la même dans la liste, la fiche et le MCP ; le prix de marché est
une estimation (provenance `estimated`). Le critère est inactif par défaut.

```
prixCible   = min des prix maximaux des critères actifs (défaut : brut et effort, comme le verdict)
critereLiant = le critère qui donne ce minimum
decote      = (P − prixCible) / P
```

Classement de la décote, seuils paramétrables : `≤ 0` dans la cible au prix affiché ;
`≤ 5 %` négociable ; `≤ 10 %` tendu ; au-delà hors de portée.

Chaque critère rend aussi sa propre décote `(P − P_critère) / P`, négative quand le prix affiché
est déjà sous le prix maximal du critère.

Propriétés testées (fast-check, dans les deux modes de frais de notaire) : `rdtBrut(P_b) = s_b`
(au centime de coût en mode taux, à 1 € près en mode barème), `effort(P_e) = −E`,
`rdtNet(P_n) = s_n`, `cout(P_220) = 220 L`, le prix cible est le minimum des critères actifs et
les satisfait tous, monotonie (prix plus haut, rendement plus bas, effort plus lourd).

**Mode barème.** `c⁻¹` n'a plus de forme fermée : les frais ne sont pas proportionnels
(tranches, minimum de la CSI, forfaits). `cout(P)` reste croissante en `P`, nulle part
décroissante : le prix est obtenu par bissection sur `[0, x − T − M]` arrêtée au demi-centime
(`priceForTotalCost`). Le coût a un saut au point où l'assiette devient positive (les forfaits
apparaissent) : si le coût visé tombe dans ce saut, le prix rendu est le plus grand qui ne le
dépasse pas, et le critère est satisfait avec de la marge.

### Négociation (lots N2, N5)

À partir du prix affiché `P`, des prix cibles et de l'historique (prix constatés, offres), le
brief de négociation (`negotiationBrief`, fonction pure, aucune IA) donne :

- la décote nécessaire par critère et sa classe (mêmes seuils que ci-dessus) ;
- le **prix d'offre suggéré** : `min(prixCible, P)` arrondi au millier inférieur ; la **marge**
  `prixCible − offre` est la place laissée à la négociation ;
- la durée en ligne (depuis la publication, sinon depuis l'ajout dans l'espace, signalé comme
  tel), le nombre de baisses et la baisse cumulée depuis le premier prix constaté, la dernière
  offre et sa réponse ;
- des arguments factuels, chiffrés : en ligne depuis au moins 30 jours, baisses passées, DPE E,
  F ou G (calendrier d'interdiction), travaux estimés, charges de copropriété au-delà de
  40 €/m²/an, offre précédente (refusée, contre-proposition sous ou au-dessus du prix cible, en
  attente, acceptée), et « déjà dans la cible » quand la décote est négative.

Le **rang** d'une annonce est sa position par décote nécessaire croissante parmi les annonces
actives de l'espace dont le prix cible est calculable (1 = la plus proche de sa cible). Les
offres enregistrées (montant, date, canal, réponse, contre-proposition) **proposent** un statut
(« offre faite », « offre acceptée », « offre refusée ») sans jamais le changer d'office.

## 6. Sensibilité (lot N3)

Tableau à deux entrées (`sensitivityGrid`) : deux axes au choix parmi le prix d'achat, le loyer,
le taux, l'apport et la durée, avec des pas par défaut :

- prix : `P × {0,85 ; 0,90 ; 0,95 ; 1,00}` et loyer : `L × {0,90 ; 1,00 ; 1,10}`
  (multiplicateurs) ;
- taux : `t ± 0,5 point`, apport : `A ± 20 000 €`, durée : `d ± 5 ans` (écarts, bornés : taux
  et apport ≥ 0, durée entière de 1 à 40 ans).

Chaque cellule rend le coût, la mensualité, `rdtBrut`, `rdtNet`, `effort` et `verdict` ; la
cellule des pas neutres (valeurs actuelles) est repérée. Les pas sont modifiables (neuf au plus
par axe). La grille à trois entrées de l'artefact (prix × taux × loyer, `sensitivity`) est
conservée. Le MCP expose la grille à deux entrées par `get_target_price` (`sensitivity`).

## 7. Fiscalité et horizon (lots E6, E7, plus tard)

Estimations signalées comme simplifiées :

- location vide : micro-foncier (abattement 30 %, revenus bruts ≤ 15 000 €) ou réel (intérêts,
  charges, taxe foncière, travaux déductibles ; déficit foncier imputable à hauteur de 10 700 €) ;
- location meublée : LMNP micro-BIC (abattement 50 %) ou réel avec amortissement ; depuis 2025
  les amortissements sont réintégrés dans le calcul de la plus-value (à vérifier au moment du
  lot) ;
- impôt = (base × TMI) + prélèvements sociaux 17,2 % ;
- cash-flow net d'impôt, TRI sur l'horizon de détention avec hypothèse de revalorisation et frais
  de revente, capital restant dû par `CRD(m)`.

## 8. Exemple chiffré (cas de test de référence)

Hypothèses de l'artefact : apport 40 000 €, taux 3,65 %, 25 ans, assurance 0,10 %, notaire
7,5 %, vacance 0,5 mois, frais fixes 1 050 €, seuil brut 5,5 %, effort max 150 €.

Annonce : prix 200 000 €, 45 m², loyer visé 750 €, mobilier 5 000 €, pas de travaux, taxe foncière
et charges non renseignées, commune non encadrée.

| Grandeur | Valeur (arrondie) |
| --- | --- |
| notaire | 15 000 € |
| cout | 220 000 € |
| emprunt | 180 000 € |
| k | 0,005170 |
| mens | ≈ 931 € (916 € de crédit + 15 € d'assurance) |
| TF (estimée) | 750 € |
| encaisse | 8 625 € |
| netExpl | 6 825 € |
| rdtBrut | 4,09 % |
| rdtNet | 3,10 % |
| effort | −362 €/mois |
| verdict | Hors cible (brut et effort en échec) |
| P_b (brut 5,5 %) | ≈ 147 600 € |
| P_e (effort 150 €) | ≈ 161 900 € |
| P_220 | ≈ 148 800 € |
| prixCible (brut, effort) | ≈ 147 600 €, critère liant : rendement brut |
| décote | ≈ 26 %, hors de portée |

En mode barème (mêmes hypothèses, `notaryMode: scale`, barème Gironde par défaut) : notaire
≈ 16 031 € (droits 12 637 €, émoluments 1 995 € HT et 399 € de TVA, CSI 200 €, débours 800 €),
coût 221 031 €, mensualité ≈ 936 €, brut 4,07 %, effort ≈ −367 €/mois ; P_b ≈ 146 550 €,
P_e ≈ 160 870 €, P_220 ≈ 147 820 € ; décote ≈ 26,7 %. Brief de négociation (mode taux) : offre
suggérée 147 000 €, marge ≈ 570 € sous le prix cible, aucun argument tant que l'annonce est
récente, sans baisse, DPE D et sans travaux.

Ces valeurs servent de premier jeu de tests du paquet `domain` ; les autres cas sont tirés des
annonces réelles exportées de l'artefact.
