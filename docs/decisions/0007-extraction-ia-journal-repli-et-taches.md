# 0007. Extraction IA : coût dans le journal d'activité, repli de refus côté client, champs manquants en tâches `missing_field`, création jamais bloquée par un doublon

Statut : acceptée, 3 novembre 2026.

## Contexte

Le lot 2 ajoute l'extraction d'une annonce par Claude (`@anthropic-ai/sdk`, sortie structurée
par le schéma Zod de `contracts`), le géocodage serveur, la détection de doublons et les tâches
des champs manquants. Quatre points demandaient une décision que l'étude du besoin et les choix
techniques ne tranchent pas, ou tranchent autrement :

1. où journaliser le coût de chaque appel au modèle (NFR « coût IA de quelques centimes par
   annonce ») ;
2. `tech-stack.md` § 2.5 demande le « traitement du `stop_reason` `refusal` avec repli serveur
   activé » ; le paramètre serveur `fallbacks` du SDK vit sur l'espace de noms bêta
   (`client.beta.messages`), où la sortie structurée `parse()` retenue pour l'extraction n'est
   pas documentée ;
3. l'origine des tâches créées pour les champs manquants : l'énumération `TaskOrigin` et le
   modèle de données (§ 4, « origine : défaut, manuelle, champ manquant ») prévoient
   `missing_field` ; le brief du lot parle de tâches « d'origine `ai` » ;
4. l'étude (§ 3.7) décrit `create_listing` comme répondant « avec les doublons probables si la
   création est refusée pour cette raison », donc une création bloquée.

## Décision

1. **Coût dans `ActivityLog`** : une ligne par analyse (`action: ai.extraction`, canal `web` ou
   `mcp`, membre, `after` : modèle, jetons, cache, coût estimé, durée, taille du texte, nombre de
   captures). Pas de table dédiée ni de migration : deux membres et quelques analyses par jour ;
   une agrégation se fait en SQL sur `activity_logs`. Une table viendra si un tableau de bord
   des coûts devient un besoin.
2. **Repli de refus côté client** : sur `stop_reason: refusal`, l'API relit une fois avec
   `AI_MODEL_BULK` ; si le refus persiste, `422` avec la catégorie. Le `fallbacks` serveur sera
   envisagé quand il sera documenté avec `parse()` sur l'espace stable.
3. **Origine `missing_field`** : les tâches des champs manquants gardent l'origine prévue par le
   modèle de données ; l'interface les affiche « IA · champ manquant ». Pas de nouvelle valeur
   d'énumération, donc pas de migration.
4. **Création jamais bloquée** : `POST /listings` et `create_listing` signalent les doublons
   probables dans la réponse (`duplicates`) et créent quand même ; le choix explicite du membre
   (`ignoreDuplicates: true`) est journalisé. L'étude du besoin § 3.7 est corrigée en ce sens.
   Motif : un doublon probable est une alerte, pas une certitude (deux lots dans un même
   immeuble, une annonce republiée) ; refuser obligerait l'agent ou le membre à rejouer la
   création avec un drapeau, ce qui revient au même en deux appels.

## Conséquences

- Aucune migration Prisma dans le lot 2.
- `docs/ia.md` documente le fonctionnement, le coût estimé et les variables d'environnement.
- Si le repli serveur `fallbacks` devient disponible avec `parse()`, la relecture par
  `AI_MODEL_BULK` disparaît au profit de `fallbacks: "default"`.
