# Plan de remédiation - messagio

Dérivé de `docs/security/rapport-audit.md`, commit audité `75fda66`, classement priorisé du
2026-09-09. Critères de priorisation : `docs/adr/0005-criteres-priorisation.md`.

**La priorité de ce plan est le rang du classement d'audit**, sans réordonnancement. Les lignes
R-06 à R-09 viennent du registre des traitements et non du rapport d'audit ; elles sont numérotées
à part et insérées selon leur propre urgence.

## Lignes issues du rapport d'audit

| Finding | Action | Effort | Priorité | Responsable | Échéance | Statut |
|---|---|---|---|---|---|---|
| F-01 secret de signature en dur | Lire le secret dans `process.env.JWT_SECRET` et **refuser le démarrage** s'il est absent, plutôt que retomber sur une valeur par défaut. **Faire tourner la clé** : l'actuelle est publiée dans l'historique git, la retirer du code ne la décompromet pas | S pour le code, M avec la rotation et le redéploiement | 1 | Alex | avant S10 | à faire |
| F-03 routes REST sans autorisation | Extraire un garde unique `peutAcceder(identite, salonId)`, appelé par le canal Socket.IO **et** par les routes REST. L'auteur d'un message provient du jeton vérifié, jamais de `body.auteur` | M | 2 | Alex | avant S10 | à faire |
| F-02 jetons émis sans authentification | Retirer `GET /api/dev-token` du chemin de production derrière une garde d'environnement explicite ; brancher une authentification réelle dont le `sub` est celui du compte authentifié | S pour la garde, L pour l'authentification | 3 | Alex | garde avant S10, authentification hors périmètre académique | à faire |
| F-04 rate-limiting par socket | Compteur agrégé **par identité**, partagé entre instances (fenêtre glissante Redis, déjà présent dans l'architecture) + plafond du nombre de sockets simultanées par identité | M | 4 | Alex | après S10 | à faire |
| F-05 `@fastify/static` | Monter `@fastify/static@10.1.3` (montée **majeure**), test de non-régression sur le service des fichiers statiques | S | 5 | Alex | après S10 | à faire |

## Lignes issues du registre des traitements

| Origine | Action | Effort | Priorité | Responsable | Échéance | Statut |
|---|---|---|---|---|---|---|
| R-06 - T-01, aucune durée de conservation | Définir une durée de conservation des messages **en temps** et non seulement en volume (`MAX_HISTORIQUE = 200` est un plafond, pas une durée), puis l'implémenter par une purge | M | 3 | Alex | avant S10 pour la décision, après pour l'implémentation | à faire |
| R-07 - T-02, journaux nginx sans purge | Configurer une rotation et une purge des journaux d'accès à **30 jours glissants** : ils contiennent des adresses IP, donc des données personnelles | S | 4 | Alex | après S10 | à faire |
| R-08 - information des personnes | Rédiger une politique de confidentialité minimale : données collectées, durées, droits d'accès, de rectification et d'effacement, et **comment les exercer** — aucun mécanisme ne le permet aujourd'hui | S pour la rédaction, M pour les mécanismes d'exercice des droits | 4 | Alex | après S10 | à faire |
| R-09 - sous-traitance | Vérifier l'existence d'un contrat art. 28 **avant** le premier déploiement chez un hébergeur. Aucun sous-traitant à ce jour : l'action est conditionnelle et doit être déclenchée par la décision d'hébergement, pas par une échéance de calendrier | S | conditionnelle | Alex | au choix de l'hébergeur | à faire |
| R-10 - `/instance` exposé sans nécessité | Cesser de servir publiquement `GET /instance`, ou l'authentifier au même titre que `/metrics` | S | 5 | Alex | après S10 | à faire |

## Risques acceptés

| Origine | Décision | Responsable | Date de revue |
|---|---|---|---|
| Absence de journal d'audit (ligne #9 du threat model) | **Accepté.** Aucun journal d'audit des événements d'autorisation et d'émission ne sera produit dans le cadre académique. Conséquence assumée : en cas de contestation sur un message, rien ne permet de reconstituer qui a fait quoi. C'est un manquement à la traçabilité, pas une absence de risque | Alex | à la première exploitation hors cadre académique |
| Exposition directe des instances (ports 3001, 3002) et de l'API toxiproxy (8474) | **Accepté** dans la composition de développement : ces ports servent à relever `/metrics` par instance et à injecter le chaos réseau, ce sont des outils de travail. **Deviendraient des findings à part entière** dans une composition de production, où ils devraient être supprimés | Alex | à la première composition de production |
| Contenu de message pouvant contenir des données sensibles (art. 9) | **Accepté.** Un champ de texte libre ne peut pas empêcher une personne d'y écrire une donnée de santé ou d'opinion. Le service ne les sollicite pas et ne les traite pas comme telles | Alex | revue annuelle |

## Ce que ce plan ne couvre pas

Les trois acceptations ci-dessus portent un nom et une date de revue : ce sont des décisions, pas
des abandons. Toute ligne « à faire » sans échéance tenue à la prochaine revue doit basculer
explicitement en « accepté », avec un nom et une date — ou être replanifiée. Un plan dont les
lignes vieillissent sans changer de statut ne décrit plus la réalité.
