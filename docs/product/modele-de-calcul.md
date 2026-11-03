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

Extension (lot E5) : frais de notaire par barème (droits de mutation départementaux et
communaux, émoluments proportionnels dégressifs, débours forfaitaires) à la place du pourcentage.
Le pourcentage reste la valeur par défaut.

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

Ajouts prévus :

- validité du DPE : un DPE réalisé avant le 1er juillet 2021 n'est plus valable depuis le
  1er janvier 2025 ; alerte si la date est absente ou antérieure ;
- audit énergétique obligatoire à la vente (F et G depuis 2023, E depuis 2025) : tâche « demander
  l'audit » ;
- plafond meublé distinct du plafond vide ; complément de loyer éventuel signalé.

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
| Marché (lot N4) | | `P_m = S × prixM2Median(DVF, quartier) × ajustements` |

Le critère effort n'a de sens que si `cout > A` (sinon la mensualité est nulle et l'effort vaut
`netExpl / 12`, indépendant du prix).

```
prixCible   = min des prix maximaux des critères actifs (défaut : brut et effort, comme le verdict)
critereLiant = le critère qui donne ce minimum
decote      = (P − prixCible) / P
```

Classement de la décote, seuils paramétrables : `≤ 0` dans la cible au prix affiché ;
`≤ 5 %` négociable ; `≤ 10 %` tendu ; au-delà hors de portée.

Propriétés à tester : `rdtBrut(prixCible)` vaut `s_b` au centime près quand le brut est le critère
liant ; `effort(P_e) = −E` ; monotonie (prix plus haut, rendement plus bas, effort plus lourd).

## 6. Sensibilité (lot N3)

Tableau à deux entrées calculé par `evaluate` sur une grille :

- prix : `P × {0,85 ; 0,90 ; 0,95 ; 1,00}` ;
- taux : `t ± 0,5 point` ;
- loyer : `L × {0,90 ; 1,00 ; 1,10}`.

Chaque cellule rend `rdtBrut`, `effort`, `verdict`. Le MCP expose la même grille.

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

Ces valeurs servent de premier jeu de tests du paquet `domain` ; les autres cas sont tirés des
annonces réelles exportées de l'artefact.
