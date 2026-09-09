# ADR 0005 - Critères de priorisation des findings de sécurité

- **Statut** : accepté
- **Date** : 2026-09-09
- **Décideur** : Alex
- **Note de numérotation** : le TP demande un `0002`, déjà pris par
  `0002-strategie-de-convergence.md` (module temps réel). Cet ADR prend le numéro suivant libre
  dans la série du dépôt, `0005`, plutôt que d'écraser un ADR existant.

## Contexte

L'audit de S8 a produit **cinq findings** sur `messagio` : trois *Critical*, un *High*, un
*Medium*. Le temps de remédiation disponible avant la soutenance est de l'ordre d'une demi-journée,
soit deux findings traités correctement, trois au mieux. **Sans cette rareté, la question ne se
poserait pas** : on corrigerait tout. C'est parce qu'on ne peut pas tout faire qu'il faut une règle
de décision écrite d'avance, plutôt qu'un arbitrage improvisé finding par finding.

Ces critères servent à traiter en premier les findings qui touchent les événements redoutés **ER1**
(lecture d'un salon privé par un tiers, gravité 4) et **ER2** (usurpation de l'identité d'un membre,
gravité 4) de `docs/security/threat-model.md`.

Cet ADR ne tranche **aucun correctif**. Il tranche une **règle de décision réutilisable**, qui
servira aussi aux findings suivants.

## Décision

Chaque finding reçoit trois notes de 1 à 3. Le risque est leur **produit**, entre 1 et 27. Le
produit, et non la somme : un finding qui vaut 1 sur un axe doit s'effondrer au classement, parce
qu'un risque dont l'un des trois facteurs est nul n'est pas un risque.

### Impact - « qu'est-ce que l'attaquant obtient ? »

| Note | Définition, appliquée à messagio |
|---|---|
| 1 | Gêne : dégradation de confort, aucun bien essentiel touché. |
| 2 | Dégradation d'un bien essentiel sans réalisation d'un événement redouté : service ralenti, historique partiellement altéré. |
| 3 | Un événement redouté de gravité 3 ou 4 est **atteint** : contenu d'un salon privé lu ou écrit, identité d'un membre usurpée. |

### Exploitabilité - « que faut-il pour y arriver ? »

| Note | Définition, appliquée à messagio |
|---|---|
| 1 | Conditions rares, ou outillage à écrire et dont l'aboutissement est incertain. |
| 2 | Jeton valide et script simple, ou vulnérabilité publique dont la charge reste à adapter à notre version. |
| 3 | Anonyme et immédiat : `curl`, ou un script que **nous avons déjà écrit** et qui figure dans `audit/`. |

Le niveau 3 est délibérément ancré sur l'existence d'une preuve rejouable dans le dépôt. Ce n'est
pas une opinion sur la difficulté : soit la commande est là et fonctionne, soit elle ne l'est pas.

### Exposition - « depuis où est-ce atteignable ? »

| Note | Définition, appliquée à messagio |
|---|---|
| 1 | Code non atteignable depuis le chemin d'exécution, ou accessible seulement en local. |
| 2 | Derrière une authentification réelle. |
| 3 | Joignable depuis le réseau sans compte, à travers le proxy `nginx` du port 3000. |

**Une précision qui compte chez nous** : `messagio` n'ayant **aucune authentification réelle**
(F-02), le niveau 2 est aujourd'hui vide. Tout ce qui est joignable est joignable sans compte. Ce
niveau existe pour rester utilisable après correction de F-02, moment où il commencera enfin à
discriminer.

## Options écartées

### Trier par CVSS 4.0 décroissant

C'est l'option par défaut, et elle est rejetée pour deux raisons tirées de **notre propre tableau**.

**Elle inverse un rang.** L'ordre CVSS placerait F-05 (`@fastify/static`, 8.7) devant F-04
(rate-limiting par socket, 6.9). Or F-04 est exploitable immédiatement avec un script déjà écrit,
et donne 150 messages par seconde là où 15 sont annoncés ; F-05 suppose de construire une charge de
traversée adaptée à notre version et à notre configuration de montage, travail non fait et de
succès incertain. CVSS mesure la gravité **intrinsèque** d'une faiblesse, indépendamment de tout
déploiement — c'est sa raison d'être et c'est ce qui le rend comparable entre organisations. C'est
aussi ce qui le rend inapte à ordonner un plan de remédiation **sur un système donné**.

**Elle ne départage pas les trois premiers.** F-01, F-02 et F-03 obtiennent tous 9.3 avec le même
vecteur. CVSS ne dit rien de l'ordre dans lequel les traiter, alors que c'est précisément la
question. Ce sont le coût du correctif et sa réversibilité — F-01 exige une rotation de secret, pas
seulement un commit — qui tranchent, et ces dimensions n'existent pas dans CVSS.

CVSS reste **conservé et publié** pour chaque finding, avec son vecteur : il rend la sévérité
comparable et discutable avec un tiers. Il est une **entrée** de la décision, pas la décision.

### Trier par effort croissant, « les gains rapides d'abord »

Rejetée : elle produit un plan qui avance vite et laisse le risque le plus élevé pour la fin. Chez
nous, elle placerait F-05 (montée de version, effort S) devant F-01, qui est le finding habilitant
de tous les autres. L'effort est un critère de **planification**, il intervient après le classement
par risque, jamais à sa place.

## Conséquences

**Ce que ces critères vont systématiquement déprioriser**, et que nous acceptons :

1. **Les vulnérabilités de dépendances**, qui plafonneront presque toujours à 2 en exploitabilité
   faute de charge vérifiée sur notre version. Risque accepté : une preuve de concept publiée du
   jour au lendemain fait basculer un finding de 12 à 18 sans que rien n'ait changé chez nous.
   *Contre-mesure : le classement est révisé à chaque publication d'exploit connu, et non seulement
   à chaque audit.* Assumé par Alex le 2026-09-09.
2. **Les défauts de traçabilité** — l'absence de journal d'audit, ligne #9 du threat model. Ils
   notent 1 en impact tant qu'aucun incident n'a eu lieu, donc ne remontent jamais. Risque accepté :
   le jour où un incident survient, nous serons incapables de reconstituer qui a fait quoi, et
   c'est exactement le moment où nous en aurons besoin. *Contre-mesure : la traçabilité est traitée
   hors classement de risque, comme un prérequis de l'exploitation.* Assumé le 2026-09-09.
3. **Tout ce qui n'est pas atteignable aujourd'hui mais le deviendra** — code désactivé, route de
   développement, fonctionnalité en préparation. La note d'exposition photographie l'état présent.
   *Contre-mesure : réévaluation du classement à chaque changement de configuration de déploiement,
   et non uniquement à chaque changement de code.* Assumé le 2026-09-09.

**Date de revue de cet ADR** : à la prochaine campagne d'audit, ou dès qu'un finding sera classé
d'une manière que l'équipe juge contre-intuitive — auquel cas ce sont les définitions de niveaux
qu'il faudra corriger, pas la note du finding.
