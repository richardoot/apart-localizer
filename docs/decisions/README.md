# Décisions d'architecture

Un fichier par décision, numéroté, court : contexte, options, décision, conséquences. Une décision
remplacée n'est pas effacée ; son statut passe à « remplacée par NNNN ».

| N°                                                          | Décision                                                                                                       | Statut                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [0001](0001-nestjs-plutot-que-hono.md)                      | NestJS plutôt que Hono pour l'API                                                                              | Acceptée, 3 novembre 2026 |
| [0002](0002-prisma-et-postgis.md)                           | Prisma 7 conservé, PostGIS activé pour la géo                                                                  | Acceptée, 3 novembre 2026 |
| [0003](0003-tests-e2e-sur-postgis-reel.md)                  | Tests e2e sur un Postgres PostGIS réel, image multi-architecture                                               | Acceptée, 3 novembre 2026 |
| [0004](0004-membres-pre-crees-et-rattachement-par-email.md) | Membres pré-créés, rattachement par e-mail, espace automatique                                                 | Acceptée, 3 novembre 2026 |
| [0005](0005-portees-mcp-lues-dans-le-jeton.md)              | Portées MCP lues dans le jeton ; jeton sans portée = toutes                                                    | Acceptée, 3 novembre 2026 |
| [0006](0006-verdict-tri-et-pagination-apres-evaluation.md)  | Verdict, tri et pagination en mémoire après l'évaluation                                                       | Acceptée, 3 novembre 2026 |
| [0007](0007-extraction-ia-journal-repli-et-taches.md)       | Extraction IA : coût dans le journal, repli côté client, tâches `missing_field`, doublons non bloquants        | Acceptée, 3 novembre 2026 |
| [0008](0008-frais-de-notaire-par-bareme.md)                 | Frais de notaire par barème : défauts Gironde datés, forfaits estimés, mode taux par défaut, bissection        | Acceptée, 3 novembre 2026 |
| [0009](0009-offres-negociation-et-hypotheses-partielles.md) | Offres : un outil `record_offer`, statut proposé jamais forcé, `set_assumptions` partiel avec impact           | Acceptée, 3 novembre 2026 |
| [0010](0010-criteres-alertes-et-isochrones.md)              | Critères : un prédicat PostGIS, filtres par `domain`, table des entrées, compteurs à la lecture, vélo approché | Acceptée, 3 novembre 2026 |
| [0011](0011-donnees-ouvertes-encadrement-dvf-dpe-tbm.md)    | Données ouvertes : arrêté contrôlé, zonage PostGIS, instantané sur l'annonce, règles DVF, DPE, TBM             | Acceptée, 3 novembre 2026 |
