# Modèle de calcul

Formules reprises de l'artefact actuel, puis étendues (coût d'occupation, prix cible,
sensibilité, puis au lot 5 fiscalité estimée, projection jusqu'à la revente, TRI, scénarios,
loyer de marché et checklist réglementaire). Tout ce qui est décrit ici vit dans le paquet `packages/domain`, en fonctions pures
et testées, utilisé à l'identique par l'interface, l'API et le MCP.

## 1. Notations

| Symbole | Sens | Origine |
| --- | --- | --- |
| `P` | prix affiché (FAI) | annonce |
| `H` | honoraires d'agence à charge acquéreur (0 si à charge vendeur ou inclus net vendeur) | annonce |
| `n` | taux de frais de notaire (fraction, 7,5 % aujourd'hui) ou barème | hypothèses |
| `T` | total des travaux (somme des postes si la section est active, sinon 0) | annonce |
| `M` | mobilier | annonce |
| `A` | apport | hypothèses (de l'espace ; plus de surcharge par annonce depuis le lot 19) |
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
| `L_a` | loyer actuel du foyer (`currentRent`), mensuel | hypothèses (lot 5) |
| `e` | entretien annuel en phase 1 (`maintenanceAnnual`) | hypothèses |
| `D_0`, `D_L` | date d'acquisition (`purchaseDate`, défaut : jour du calcul), date de mise en location (`rentalStartDate`, défaut : 1er janvier de l'année de mise en location) | hypothèses |
| `h` | horizon de détention en années (`horizonYears`, défaut 15) | hypothèses |
| `g`, `i` | revalorisation annuelle du bien (`appreciationRate`, défaut 0) ; indexation annuelle des loyers, charges, taxe foncière et loyer actuel (`rentIndexationRate`, défaut 1,57 %, IRL du 3e trimestre 2026) | hypothèses |
| `f_r` | frais de revente en fraction du prix de vente (`resaleCostsRate`, défaut 5 %, estimation) | hypothèses |
| `τ` | tranche marginale d'imposition du foyer (`marginalTaxRate`, défaut : non renseignée) | hypothèses |
| `b` | type de location de la phase 2 (`leaseType` : vide, meublé, colocation ; défaut vide), pour toutes les annonces de l'espace | hypothèses (lot 19) |

Depuis le lot 19 (ADR 0029), toutes les annonces se calculent avec les hypothèses de l'espace :
une annonce n'a plus d'hypothèses propres (`assumptionsOverride`, colonne gardée sans être lue),
ni d'année ni de type de location de la phase 2 (`rental_plans.year`, `lease_type`, gardées sans
être lues). Seul un scénario (§ 9) remplace des hypothèses, pour le calcul seulement.

Toute valeur estimée est marquée `estimated` dans la provenance et affichée « ≈ ».

## 2. Coût et financement

Deux bases de calcul (lot 9) : une valeur **sur le prix** se compare au prix affiché `P` (prix
cible, décote, offre suggérée, prix maximal par critère, prix au m²) ; une valeur **tout compris**
porte sur le coût tout compris `cout` = prix affiché + notaire + travaux + mobilier (rendements,
effort, emprunt, mensualité, coût maximal par critère). L'interface marque chaque valeur de l'une
ou l'autre pastille ; « coût total » s'appelle désormais « coût tout compris ».

```
notaire   = n × (P − H)                      base = net vendeur quand les honoraires sont à charge acquéreur
cout      = P + notaire + T + M              coût tout compris
emprunt   = max(0, cout − A)
r         = t / 12 ;  N = 12 × d
k         = r / (1 − (1 + r)^−N) + a / 12    facteur mensuel crédit + assurance (si r = 0 : 1/N + a/12)
mens      = emprunt × k
pm2       = P / S
```

La mensualité se lit en deux parts (`monthlyPaymentSplit`) : assurance = `emprunt × a / 12`,
crédit = `mens − assurance` (exemple § 8 : 916 € de crédit + 15 € d'assurance).

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
80 €) deviennent des paramètres des hypothèses. Un seuil atteint à l'arrondi près compte comme
atteint (lot 9, `VERDICT_TOLERANCE` : 10⁻⁹ pour le rendement, un millionième d'euro pour
l'effort) : au prix cible, le critère liant est exactement à son seuil et ne doit pas passer
« de peu » par l'erreur des flottants.

Lecture de la fiche (lot 9, `profitabilityChecks`) : rendement brut et effort sont toujours
retenus (ils font le verdict) et reprennent ses échecs et « de peu » ; le rendement net n'est
retenu que si `s_n` est fixé et que le critère compte pour le prix cible, il est alors atteint ou
en échec ; sinon « non retenu ».

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

L'année de mise en location retenue est celle de la date de mise en location des hypothèses
(`rentalStartDate`, lot 5), sinon `rentalYear`, pour toutes les annonces de l'espace (lot 19 :
plus d'année par annonce) ; seul un scénario la change. Le type de location (`leaseType` des
hypothèses, vide par défaut) choisit le loyer de référence meublé ou vide de l'encadrement, les
comparables de loyer retenus et le régime fiscal par défaut ; quand l'année ou le type de l'espace
change, le plafond posé d'office de chaque annonce est recalculé.

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

## 4. Phase 1 : coût d'occupation (lot 5, besoin E3)

Pendant que le foyer habite le bien (de `D_0` à `D_L`) ; `occupancyReport` :

```
credit      = emprunt × r / (1 − (1 + r)^−N)        mensualité hors assurance
assurance   = emprunt × a / 12
charges     = chargesCopro / 12                     toutes : le propriétaire occupant paie aussi la part récupérable
TF          = taxe foncière / 12                     estimée à un mois de loyer si absente (≈), comme en phase 2
entretien   = e / 12                                 0 si non renseigné (signalé)
occupation  = credit + assurance + charges + TF + entretien
capital     = capital remboursé en moyenne par mois sur la phase 1 (sur les 12 premiers mois si elle est nulle),
              lu dans le tableau d'amortissement exact
coutReel    = occupation − capital                   la part qui ne construit aucun patrimoine
ecartLoyer  = occupation − L_a ;  ecartReel = coutReel − L_a      (null si L_a n'est pas renseigné)
```

Cumuls de la phase 1 (`n_1` mois révolus de `D_0` à `D_L`) : payé, capital remboursé, intérêts,
assurance, charges + taxe + entretien, loyers évités `Σ L_a × (1 + i)^année`, et le coût net par
rapport à rester locataire = payé − capital remboursé − loyers évités. Les montants des mois
suivants suivent l'indexation `i` à chaque anniversaire de l'acquisition. La **bascule en phase 2**
est `D_L`, avec le capital restant dû à cette date :

```
CRD(m) = emprunt × ((1 + r)^N − (1 + r)^m) / ((1 + r)^N − 1)
```

L'ancienne approximation `fondsPerdus ≈ intérêts de l'année 1 + …` (fonction `occupationCost`)
reste disponible ; le rapport du lot 5 lui préfère la moyenne exacte sur la phase 1.

## 5. Prix cible (lot N1, N2)

Question : « à partir de quel prix ce bien entre-t-il dans la cible ? ». `netExpl` ne dépend pas
du prix (la taxe foncière estimée dépend du loyer, pas du prix), et `cout` est affine en `P`.
Chaque critère donne donc un prix maximal en forme fermée. On note `c⁻¹(x) = (x − T − M) / (1 + n)`
le prix correspondant à un coût tout compris `x` (avec honoraires acquéreur : `(x − T − M + n × H) / (1 + n)`).

| Critère | Coût tout compris maximal | Prix affiché maximal |
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
est déjà sous le prix maximal du critère, et (lot 9) le coût tout compris qu'entraîne son prix
maximal, `maxTotalCost = cout(P_critère)` : la colonne « coût tout compris maximal » du tableau
ci-dessus, recalculée au prix trouvé (donc exacte aussi en mode barème et pour le critère
« marché »).

**Au prix cible** (lot 9, `atTarget`, `outcomeAtPrice`) : l'annonce est évaluée par `compute` avec
`P = prixCible`, tout le reste inchangé ; on en lit le coût tout compris, l'emprunt, la
mensualité, les rendements, l'effort et le verdict (encart « Et au prix cible ? » de la fiche).
Propriétés testées : `atTarget.cout = maxTotalCost` du critère liant ; au prix cible, brut et
effort calculables ne sont ni en échec ni « de peu » ; avec un DPE de A à D et les deux critères
calculables, le verdict est « Cible ».

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

**Republication (lot 15, ADR 0025).** Quand l'annonce est rattachée à une publication antérieure
du même bien (`republishedFromId`, de proche en proche), la durée en ligne part de la
publication d'origine (sa date de publication, sinon son ajout), et l'historique des prix est
celui de la chaîne : le premier prix d'une republication a pour ancien prix le dernier prix de la
publication précédente, si bien que republier moins cher compte comme une baisse. Le brief
porte alors `republication` (nombre de publications antérieures, origine, première publication)
et l'argument « Annonce republiée : le bien n'a pas trouvé preneur à sa première publication ».
Exemple : publiée à 152 000 €, baissée à 149 000 €, retirée, republiée à 145 000 € puis baissée
à 139 000 € : trois baisses, −13 000 € (8,6 %) depuis 152 000 €.

Le **rang** d'une annonce est sa position par décote nécessaire croissante parmi les annonces
actives de l'espace dont le prix cible est calculable (1 = la plus proche de sa cible). Les
offres enregistrées (montant, date, canal, réponse, contre-proposition) **proposent** un statut
(« offre faite », « offre acceptée », « offre refusée ») sans jamais le changer d'office.

## 6. Sensibilité (lot N3)

Tableau à deux entrées (`sensitivityGrid`) : deux axes au choix parmi le prix affiché, le loyer,
le taux, l'apport et la durée, avec des pas par défaut :

- prix : `P × {0,85 ; 0,90 ; 0,95 ; 1,00}` et loyer : `L × {0,90 ; 1,00 ; 1,10}`
  (multiplicateurs) ;
- taux : `t ± 0,5 point`, apport : `A ± 20 000 €`, durée : `d ± 5 ans` (écarts, bornés : taux
  et apport ≥ 0, durée entière de 1 à 40 ans).

Chaque cellule rend le coût, la mensualité, `rdtBrut`, `rdtNet`, `effort` et `verdict` ; la
cellule des pas neutres (valeurs actuelles) est repérée. Lot 9 : sur l'axe du prix affiché,
chaque pas porte le coût tout compris qu'il entraîne (le même pour toute la ligne, `totalCost`) ;
avec `includeTargetPrice`, le pas `prixCible / P` est inséré avant le premier pas plus grand (ou
un pas existant à moins de 0,50 € du prix cible est repéré), marqué `isTarget`. Les rendements et
l'effort de chaque case sont calculés sur le coût tout compris. Les pas sont modifiables (neuf au plus
par axe). La grille à trois entrées de l'artefact (prix × taux × loyer, `sensitivity`) est
conservée. Le MCP expose la grille à deux entrées par `get_target_price` (`sensitivity`).

## 7. Fiscalité, projection, revente et TRI (lot 5, besoins E6, E7)

Une **estimation simplifiée, pas un conseil fiscal** : un seul bien, pas d'autres revenus
fonciers ni BIC dans le foyer, année de détention assimilée à l'année civile, pas de CSG
déductible, pas de pénalité de remboursement anticipé. Aucun taux n'est écrit dans les formules :
ils viennent de `Assumptions.taxParameters` (défauts datés `DEFAULT_TAX_PARAMETERS` dans
`contracts`, modifiables, versionnés avec les hypothèses ; ADR 0012).

### 7.1 Simulation mensuelle

`simulateMonths` part de `D_0`, mois par mois sur `12 × h` mois. Mois de phase 1 (avant `D_L`) :
loyer évité `L_a`, toutes les charges, taxe foncière, entretien, mensualité. Mois de phase 2 :
loyer encaissé `L × (1 + i)^k × (12 − v) / 12` (`k` = années de bail révolues, la vacance
étalée sur l'année), charges non récupérables, taxe foncière, frais fixes `F / 12`, mensualité.
Les coûts et `L_a` sont indexés par `(1 + i)^années depuis D_0`. Les mensualités, les intérêts,
le capital et le CRD viennent du tableau d'amortissement exact (`loanSchedule` ; à taux nul,
linéaire ; la dernière mensualité solde le capital).

La valeur du bien est `V_y = (P + T) × (1 + g)^y` : les travaux sont supposés valorisés à leur
coût (hypothèse à garder en tête).

### 7.2 Régimes fiscaux et impôt d'une année

`rentalTaxYear` : une année de location à la fois, avec ses reports. Le régime par défaut suit le
bail (le type de location des hypothèses de l'espace, lot 19) : vide → micro-foncier, meublé ou
colocation (supposée meublée) → micro-BIC ; un régime
demandé qui ne convient pas au bail est remplacé par son équivalent (signalé). Un régime micro
dont le plafond de recettes est dépassé passe au réel pour l'année (signalé).

```
micro-foncier   imposable = loyers × (1 − 30 %)                         si loyers ≤ 15 000 €
réel foncier    A = loyers − (intérêts + assurance emprunteur)
                autres = charges non récupérables + frais fixes + taxe foncière + 20 € de frais de gestion
                A ≥ 0 et A − autres ≥ 0  → net = A − autres
                A ≥ 0 et A − autres < 0  → déficit = autres − A : jusqu'à 10 700 € sur le revenu global, le reste reporté
                A < 0                    → −A reporté (intérêts) ; autres : jusqu'à 10 700 € sur le revenu global, le reste reporté
                imposable = net − déficits antérieurs (10 ans, les plus anciens d'abord)
micro-BIC       imposable = loyers − max(305 €, loyers × abattement)    abattement et plafond selon le meublé
LMNP réel       résultat = loyers − (charges + frais fixes + taxe foncière + intérêts + assurance)
                résultat < 0 → déficit BIC reporté 10 ans
                sinon : déficits antérieurs, puis amortissements dans la limite du résultat (CGI, art. 39 C) ;
                l'excédent est différé sans limite de durée
impôt           IR = (imposable − déficit imputé sur le revenu global) × τ      (négatif = économie)
                PS = imposable × taux des prélèvements sociaux (foncier ou BIC)
```

Sans `τ` (TMI non renseignée), l'impôt sur le revenu n'est pas estimé : `incomeTax` et le total
sont `null`, les prélèvements sociaux restent calculés, et tout ce qui est « après impôt » est
`null`.

**Amortissements LMNP** (pratique comptable usuelle, pas des valeurs légales) : le bâti entre à
sa valeur estimée à la mise en location `V(D_L)` (la valeur vénale à l'affectation, approchée par
la revalorisation), terrain déduit (15 %), par composants : gros œuvre 55 % sur 50 ans, façade et
toiture 15 % sur 25 ans, installations techniques 15 % sur 20 ans, agencements 15 % sur 12 ans ;
mobilier `M` sur 7 ans ; dotations au prorata des mois loués.

### 7.3 Paramètres fiscaux par défaut (relevés le 3 novembre 2026)

| Paramètre | Valeur | Source | Certitude |
| --- | --- | --- | --- |
| Micro-foncier | abattement 30 %, recettes ≤ 15 000 € | CGI art. 32 ; ANIL, fiche « Location vide » | sûr |
| Déficit foncier | 10 700 €/an sur le revenu global hors intérêts, report 10 ans ; 21 400 € pour des travaux de rénovation énergétique (E, F, G vers A à D) payés jusqu'au 31 décembre 2027, prolongation par la loi de finances pour 2026 (non appliqué : les travaux d'avant location ne sont pas déductibles) | CGI art. 156 ; weblex.fr | sûr / probable |
| Frais de gestion forfaitaires (réel) | 20 € par local | CGI art. 31 | sûr |
| Micro-BIC, meublé de longue durée et tourisme classé | abattement 50 %, recettes ≤ 83 600 € (revenus 2026 à 2028 ; 77 700 € pour 2025) | loi n° 2024-1039 du 19 novembre 2024 ; revalorisation triennale (arrêté du 27 janvier 2026) ; weblex.fr, entreprendre.service-public.gouv.fr A18813 (26 février 2026) | probable |
| Micro-BIC, tourisme non classé | abattement 30 %, recettes ≤ 15 000 € (non revalorisé) | loi n° 2024-1039 | sûr |
| Abattement minimal micro-BIC | 305 € | CGI art. 50-0 | sûr |
| Prélèvements sociaux, revenus fonciers | 17,2 % | CSS art. L. 136-8 | sûr |
| Prélèvements sociaux, BIC LMNP | **18,6 %** dès les revenus 2025 (CSG + 1,4 point) | LFSS pour 2026, loi n° 2025-1403 du 30 décembre 2025 ; synthèses de cabinets, doctrine BOFiP non publiée au relevé | probable, à confirmer |
| Prélèvements sociaux, plus-value immobilière | 17,2 % | service-public.gouv.fr F10864 | sûr |
| Plus-value : IR | 19 % | CGI art. 200 B ; F10864 | sûr |
| Abattements pour durée de détention | IR : 6 %/an de la 6e à la 21e année, 4 % la 22e ; PS : 1,65 %/an de la 6e à la 21e, 1,60 % la 22e, 9 %/an de la 23e à la 30e | F10864 (vérifiée le 15 avril 2026) | sûr |
| Forfaits | frais d'acquisition 7,5 % du prix d'achat, travaux 15 % au-delà de 5 ans de détention | F10864 | sûr |
| Surtaxe | 2 % à 6 % au-delà de 50 000 € de plus-value imposable, barème lissé | CGI art. 1609 nonies G | sûr |
| Exonération de la résidence principale | si le bien l'est au jour de la cession | CGI art. 150 U II 1° ; F10864 | sûr |
| Réintégration des amortissements LMNP | oui, cessions depuis le 15 février 2025, mobilier exclu, résidences de services exceptées | loi de finances pour 2025 (n° 2025-127) ; réponse ministérielle n° 10097 (JO AN, 24 mars 2026) | probable |

Non modélisé : le dispositif « Jeanbrun » de la loi de finances pour 2026 (amortissement en
location nue de logements neufs ou rénovés acquis du 21 février 2026 au 31 décembre 2028) exige
une location dans les douze mois suivant l'acquisition et interdit au propriétaire de se réserver
le logement, incompatible avec une phase 1 en résidence principale.

### 7.4 Revente et plus-value

À `D_0 + h` ans : prix `V_h`, frais `f_r × V_h`, capital restant dû `CRD(12 h)`.

```
prixRevient = (P − H) + max(frais réels, 7,5 % × (P − H)) + max(T, 15 % × (P − H) si détention > 5 ans)
              − amortissements LMNP du bâti déduits (si réintégration)
PV          = max(0, V_h − frais − prixRevient)
impôt       = PV × (1 − abattIR(h)) × 19 % + PV × (1 − abattPS(h)) × 17,2 % + surtaxe(PV × (1 − abattIR(h)))
```

`H` = honoraires à charge acquéreur (§ 1) ; frais réels = notaire + `H`. **Exonération** si le
bien est encore la résidence principale au jour de la vente (vente avant `D_L`). Une fois loué, il
ne l'est plus : la plus-value est imposable, sans exonération partielle pour les années habitées.
La doctrine admet une vente dans un délai normal (un an en principe, BOI-RFPI-PVI-10-40-10) après
le départ si le logement n'a pas été loué entre-temps : ce cas (vente au lieu de la location)
n'est pas modélisé. La surtaxe est calculée sur la plus-value totale, alors que son seuil
s'apprécie par vendeur selon les quotes-parts (signalé).

### 7.5 TRI, VAN, enrichissement

Les flux du foyer, une valeur par année de détention :

```
flux_0  = − min(A, cout)                                  la mise de départ
flux_y  = loyersEvités + loyers − mensualités − charges − taxe foncière − entretien − frais fixes − impôt_y
flux_h += V_h − frais − CRD(12 h) − impôt sur la plus-value
TRI     = le taux qui annule Σ flux_y / (1 + TRI)^y       Newton, bissection de secours sur [−99,99 %, 1 000 %]
VAN     = Σ flux_y / (1 + taux)^y                          taux = discountRate, sinon le taux du crédit
enrichissementNet = Σ flux_y
```

Avant impôt : sans impôt sur les loyers ni sur la plus-value. Le loyer actuel évité en phase 1
compte comme une recette : le TRI compare l'achat au fait de rester locataire (sans `L_a`, il
est sous-estimé, signalé). Pas de TRI quand les flux ne changent pas de signe. La projection
compare aussi les deux régimes possibles pour le bail et désigne celui qui enrichit le plus
après impôt (`bestRegime`, null sans TMI). La série du graphique (`wealthSeries`) cumule les
cash-flows et y ajoute `V_y − CRD` : la position latente, avant frais et impôt de revente.

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
| coût tout compris maximal | brut ≈ 163 636 €, effort ≈ 179 013 €, 220 × loyer = 165 000 € |
| au prix cible | coût ≈ 163 636 €, emprunt ≈ 123 636 €, mensualité ≈ 639 €, brut 5,5 %, effort ≈ −70 €/mois, Cible |

En mode barème (mêmes hypothèses, `notaryMode: scale`, barème Gironde par défaut) : notaire
≈ 16 031 € (droits 12 637 €, émoluments 1 995 € HT et 399 € de TVA, CSI 200 €, débours 800 €),
coût 221 031 €, mensualité ≈ 936 €, brut 4,07 %, effort ≈ −367 €/mois ; P_b ≈ 146 550 €,
P_e ≈ 160 870 €, P_220 ≈ 147 820 € ; décote ≈ 26,7 %. Brief de négociation (mode taux) : offre
suggérée 147 000 €, marge ≈ 570 € sous le prix cible, aucun argument tant que l'annonce est
récente, sans baisse, DPE D et sans travaux.

Ces valeurs servent de premier jeu de tests du paquet `domain` ; les autres cas sont tirés des
annonces réelles exportées de l'artefact.

**Exemple étendu (lot 5).** Le même bien avec 1 200 € de charges annuelles, un loyer actuel de
850 €, 600 € d'entretien par an, un achat le 1er janvier 2026, une mise en location le 1er janvier
2028, TMI 30 %, IRL 1,57 %, revalorisation nulle, frais de revente 5 %, horizon 15 ans, location
vide en micro-foncier :

| Grandeur | Valeur (arrondie) |
| --- | --- |
| coût d'occupation (phase 1) | ≈ 1 143 €/mois (916 € de crédit, 15 € d'assurance, 100 € de charges, 62,50 € de taxe estimée, 50 € d'entretien) |
| capital remboursé (moyenne sur 24 mois) | ≈ 381 €/mois ; coût réel ≈ 762 €/mois |
| écart au loyer actuel | + 293 €/mois (coût réel : − 88 €/mois) ; sur la phase 1, rester propriétaire coûte ≈ 2 236 € de moins que rester locataire |
| capital restant dû à la bascule | ≈ 170 848 € |
| 3e année (première louée) | loyers 8 625 €, imposable 6 038 €, impôt ≈ 2 850 €, cash-flow net d'impôt ≈ − 630 €/mois |
| revente en 2041 | 200 000 €, frais 10 000 €, capital restant dû ≈ 91 944 €, plus-value nulle (forfaits), produit net ≈ 98 056 € |
| TRI avant / après impôt | ≈ − 0,2 % / ≈ − 4,2 % (réel foncier : ≈ − 1,4 % après impôt) |
| enrichissement net après impôt | ≈ − 42 445 € en micro-foncier, ≈ − 13 879 € au réel |
| en meublé | micro-BIC ≈ − 3,1 % après impôt ; LMNP réel ≈ − 0,2 % (amortissements : aucun impôt sur les loyers) |

Scénario « prix négocié à 150 000 € » : verdict « Hors cible » → « À creuser », coût tout compris
166 250 €, effort ≈ − 109 €/mois, TRI après impôt ≈ − 1,5 %.

## 9. Scénarios « et si » (lot 5, besoin E4)

Un scénario est un jeu de surcharges (`ScenarioOverrides`) : champs de l'annonce (prix, loyer
visé, travaux, mobilier, taxe foncière, charges, bail) et hypothèses (`AssumptionsOverride` :
taux, apport, durée, vacance, date de mise en location, TMI, régime, horizon, revalorisation…).
`applyScenario` les applique ; une date ou une année de mise en location du scénario l'emporte
sur celle des hypothèses de l'espace, et le bail du scénario (`leaseType`, ou celui de ses
hypothèses) sur le type de location de l'espace (lot 19). `compareScenario` calcule la base et le scénario
(financement, verdicts, prix cible, phase 1, projection) et rend les écarts indicateur par
indicateur avec leur sens (`better` : vrai si le scénario est meilleur ; plus bas = mieux pour le
coût, la mensualité et le coût d'occupation, plus haut = mieux pour le reste). Un scénario
enregistré, complété par d'autres surcharges, les fusionne champ par champ
(`mergeScenarioOverrides`). Une évaluation n'enregistre rien.

## 10. Loyer de marché par comparables (lot 5, besoin L4)

`rentMarket` : seules les annonces comparables du même type (vide ou meublé ; une colocation est
traitée comme meublée) et complètes comptent.

```
loyerM2_j     = loyer_j / surface_j
médiane, quartiles (interpolation linéaire, comme DVF) des loyerM2 retenus ; loyer médian
loyerEstimé   = médiane(loyerM2) × S                    fiable à partir de 5 comparables (10 idéalement)
écart         = loyerVisé / loyerEstimé − 1             > 8 % : attention (risque de vacance), comme le contrôle 3
position      = part des comparables dont le loyer au m² est sous celui du loyer visé
écartPlafond  = plafond / loyerEstimé − 1               loyer visé > plafond : attention
```

Un comparable relevé il y a plus de 12 mois est signalé « ancien ». Le loyer estimé n'entre dans
les contrôles de louabilité que si le membre le retient comme loyer de marché de la phase 2.

### Loyer observé par l'observatoire local des loyers (lot 28, ADR 0038)

Hors de la commune de Bordeaux il n'y a ni encadrement ni loyer de référence. `lookupRentObservatory`
lit, pour les 28 communes, les loyers hors charges observés par l'Observatoire local des loyers de
l'agglomération de Bordeaux ([open-data.md](../open-data.md)) :

```
zone          = zone de la commune si elle est entière dans une zone, sinon zone de l'IRIS du repère
ligne         = appartements du même nombre de pièces (1, 2, 3, « 4 et plus »), sinon toutes tailles
loyerObservé  = médiane(loyerM2 de la ligne) × S          fourchette : 1er et 3e quartiles × S
écart         = loyerVisé / loyerObservé − 1
position      = sous le 1er quartile | entre les quartiles | au-dessus du 3e quartile   (loyerVisé / S)
```

Un **indicateur** : il n'entre ni dans `L`, ni dans les rendements, ni dans le prix cible, ni dans
la louabilité, et n'est jamais un plafond. Il n'est pas écrit sur l'annonce. Un loyer visé
au-dessus du 3e quartile est signalé. Adresse à la rue : « ≈ » ; repère au quartier ou au centre
de la commune : « à vérifier » ; repère en limite de deux zones : aucune valeur. Les loyers sont
ceux de tous les locataires en place à la date de l'enquête, pas des seules mises en location.

## 11. Checklist réglementaire datée (lot 5, besoins L5, D6)

`complianceReport` évalue une table de règles datées et sourcées (`DEFAULT_REGULATORY_RULES`
dans `contracts`, remplaçable par une ligne `reference_data` de sorte `regulatory_rules`, clé
`current`) à la date de mise en location `D_L` :

| Règle (relevée le 3 novembre 2026) | Évaluation |
| --- | --- |
| Décence énergétique : G non décent depuis le 1er janvier 2025, F à partir du 1er janvier 2028, E à partir du 1er janvier 2034 (loi Climat et résilience ; service-public F2042) | bloquant si l'interdiction est en vigueur à `D_L`, attention si elle viendra ensuite, à vérifier si le DPE est inconnu |
| Gel des loyers des logements F et G depuis le 24 août 2022 (service-public F1311) | attention |
| Validité du DPE (méthode d'avant juillet 2021 : plus valable ; dix ans sinon) | bloquant, attention si expiré à `D_L`, ok |
| Encadrement à Bordeaux (33063) du 15 juillet 2022 au 24 novembre 2026 ; prolongation de deux ans votée par le Sénat le 21 octobre 2026, non définitive au relevé | à vérifier si `D_L` est après la fin ; sinon attention au-dessus du plafond, ok sous le plafond ; ok hors Bordeaux |
| Permis de louer : une partie des secteurs Victoire, Saint-Michel et Belcier à Bordeaux, d'autres secteurs dans la métropole (carte de Bordeaux Métropole) | attention si la phase 2 dit « exigé », ok si « non », à vérifier sinon |
| Diagnostics du bail (service-public F33463) : DPE, plomb (construit avant 1949), amiante (permis avant le 1er juillet 1997, tenu à disposition), électricité et gaz (installations de plus de 15 ans), état des risques (moins de six mois), bruit (plan d'exposition au bruit d'un aérodrome) | attention pour le plomb, ok ou à vérifier pour les autres selon l'année de construction ; bruit à vérifier à Mérignac (plan non importé) |
| Décence : une pièce d'au moins 9 m² (ou 20 m³) ; critères de la fiche ; règlement de copropriété | bloquant, ok ou à vérifier |
| Meublé : mobilier minimal (décret n° 2015-981) | rappel (ok) |
| Risques Géorisques à l'adresse | attention pour un aléa « existant » à l'adresse (sauf « faible »), à vérifier pour un aléa « non connu » à l'adresse, ok sinon |

Verdict comme la louabilité : incompatible dès un bloquant, sous conditions dès une attention ou
à partir de trois points à vérifier, sinon compatible. Chaque point porte sa date et sa source
(table de référence, donnée ouverte ou fiche).

## 12. Nos avis : confrontation (lot 20, besoin K2, ADR 0030)

Chaque membre `m` note les critères affichés de l'espace : `s(m, c) ∈ {1, 2, 3, 4, 5}` (1
rédhibitoire, 2 bof, 3 correct, 4 bien, 5 excellent), ou rien (« — »). Sa note globale `g(m)`
(sur 5, 0 = aucune) est à part. `confrontOpinions` (`packages/domain/src/opinions.ts`) ne lit
que les avis visibles par le membre connecté (avis à l'aveugle : tant qu'il n'a rien noté, l'avis
des autres n'entre que par son nombre de critères).

| Quantité | Définition |
| --- | --- |
| Moyenne d'un membre (indicative) | moyenne de ses `s(m, c)` donnés ; jamais recopiée dans `g(m)` |
| Écart d'un critère | `max − min` des notes données, s'il y en a au moins deux |
| Accord | écart de 0 (« d'accord ») ou de 1 (« 1 point ») |
| Désaccord | écart de **2 points ou plus** (`OPINION_DISAGREEMENT_GAP`) ; avec plus de deux membres, l'écart est `max − min` |
| Note commune | moyenne, sur les critères notés par **tous** les membres actifs (tous avis visibles), des moyennes par critère ; « en attente » quand un avis manque ou est masqué ; aucune si aucun critère n'est noté par tous |
| Plus gros désaccord | le plus grand écart (tri de la liste) |

Exemple (maquette validée, deux membres, huit critères) : Richard 5, 4, 3, 4, 5, 3, 4, 4 ;
Chloé 4, 4, 2, 2, 5, 3, —, 2. Moyennes 4,0 et 3,1 ; sept critères notés par les deux, moyennes
par critère 4,5, 4, 2,5, 3, 5, 3, 3 ; note commune 25 / 7 ≈ **3,6** ; accords sur 5 critères ;
désaccords sur le calme (4 et 2) et « on s'y voit » (4 et 2). Arrondi au dixième à l'affichage
seulement. Le verdict « Cible / À creuser / Hors cible » ne dépend pas des avis ; aucun poids par
personne.
