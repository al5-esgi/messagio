# Rapport d'audit de sécurité applicatif - messagio

## Périmètre et méthode

- **Système audité** : messagio (chat multi-salons temps réel), <https://github.com/al5-esgi/messagio>, commit `75fda66`
- **Périmètre** : le serveur temps réel (`src/`), le handshake Socket.IO et les événements de canal,
  les routes REST de `src/rest.ts`, les workflows `.github/workflows/`, le `docker-compose.yml` et
  `nginx.conf`
- **Hors périmètre** : le front de démonstration (`public/`), l'hébergement et la terminaison TLS,
  le contenu des flux WebRTC (pair à pair, ne transite pas par le serveur), les dépendances non
  atteignables depuis le code du serveur
- **Méthode** : sorties des jobs de CI (`sast`, `secret-detection`, `deps-scan`) + revue de code
  guidée par checklist + threat model de S7, avec vérification manuelle de chaque candidat
- **Date** : 2026-09-09 - **Auditeur** : Alex

Toutes les preuves de ce rapport sont **rejouables** et versionnées dans `audit/`. Elles ont été
exécutées contre une instance locale lancée par `PORT=3010 npm start`.

## Synthèse

| Sévérité | Nombre |
|---|---|
| Critical | 3 |
| High | 1 |
| Medium | 1 |
| Low | 0 |

Origine des findings : 2 issus des outils (source A), 1 de la revue guidée (source B), 2 du threat
model (source C). **F-02 n'a été trouvé par aucun outil** et ne pouvait pas l'être : aucune règle
statique ne sait qu'une route d'émission de jeton *devrait* authentifier son appelant. Seule la
lecture du modèle métier le révèle.

## Findings

### F-01 - Secret de signature des jetons en dur dans le code source

- **Sévérité** : Critical - **CVSS 4.0 (base)** : 9.3
  `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`
- **CWE** : CWE-798 (Use of Hard-coded Credentials)
- **Source** : A (Semgrep, règle ciblée `rt-hardcoded-handshake-secret`) et B (grep 4)
- **Emplacement** : `src/realtime/security-helpers.ts:49` - **la déclaration**, pas les lieux
  d'usage. Semgrep pointe aussi `rest.ts:59` et `socketio-server.ts:127`, qui sont les
  consommateurs ; corriger la ligne 49 corrige les deux.
- **Description** : `export const SECRET = 'change-moi'` est le secret HMAC unique du système. Il
  sert **à la fois** à signer les jetons (`rest.ts:59`) et à les vérifier au handshake
  (`socketio-server.ts:127`). Il est versionné, donc connu de quiconque accède au dépôt, et il est
  présent dans l'historique git — le retirer du code ne le retire pas du passé.
- **Preuve reproductible** :

  ```bash
  node audit/preuve-f01-f02-jeton-forge.mjs http://localhost:3010
  ```

  ```text
  sub=mallory (non membre) -> dev : join refuse : salon prive : vous n'en etes pas membre
  sub=alice   (membre)     -> dev : join ACCEPTE, 2 messages lus, dernierSeq=2
  ```

  Lecture de cette sortie : le contrôle d'appartenance **fonctionne** (mallory est refusé), et il
  est **entièrement neutralisé** par la forge d'identité. Le script signe un jeton avec le littéral
  lu ligne 49, sans jamais toucher au serveur.
- **Impact** : forge d'un jeton pour n'importe quel `sub`, donc lecture et écriture dans tous les
  salons privés au nom d'un membre légitime. Événement redouté **ER2** (usurpation d'identité,
  gravité 4) et, par enchaînement, **ER1** (lecture d'un salon privé, gravité 4).
  **Exploitabilité** : élevée - lire une ligne du dépôt et quinze lignes de `jsonwebtoken`.
- **Recommandation** : lire le secret dans l'environnement (`process.env.JWT_SECRET`) et **refuser
  le démarrage** si la variable est absente, plutôt que de retomber sur une valeur par défaut.
  Rotation immédiate du secret : sa publication dans l'historique le rend définitivement compromis.
  Séparer la clé de signature de la clé de vérification (paire asymétrique) si l'émission doit un
  jour être déportée.

### F-02 - Émission de jetons d'identité sans aucune authentification

- **Sévérité** : Critical - **CVSS 4.0 (base)** : 9.3
  `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`
- **CWE** : CWE-306 (Missing Authentication for Critical Function)
- **Source** : C (threat model S7, ligne STRIDE #1) - **aucun outil ne l'a trouvé**
- **Emplacement** : `src/rest.ts:56`
- **Description** : `GET /api/dev-token?pseudo=<x>` renvoie un JWT valide dont le `sub` est la
  valeur fournie par l'appelant. Aucune preuve d'identité n'est demandée, ici ni ailleurs : il
  n'existe aucun mécanisme d'authentification dans le projet. L'identité est **déclarée**, jamais
  **prouvée**. Toute la chaîne d'autorisation par salon repose pourtant sur ce `sub`.
- **Preuve reproductible** :

  ```bash
  curl -s "http://localhost:3010/api/dev-token?pseudo=alice"
  ```

  ```json
  {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsImlhdCI6...","sub":"alice"}
  ```

- **Impact** : identique à F-01, sans même avoir besoin de lire le dépôt. Événement redouté **ER2**
  (gravité 4), puis **ER1** par enchaînement. **Exploitabilité** : élevée - une requête HTTP
  anonyme, aucun outillage.
- **Pourquoi aucun outil ne pouvait le voir** : la route est syntaxiquement irréprochable. Elle
  valide son entrée, borne la longueur du pseudo et signe correctement. Le défaut est qu'elle
  *devrait* exiger une preuve d'identité — une propriété du modèle métier, invisible pour un
  analyseur de motifs. Le commentaire du code reconnaît d'ailleurs le problème et le qualifie de
  route de développement ; elle est néanmoins servie en production par le même processus.
- **Recommandation** : supprimer la route du chemin de production (garde d'environnement explicite,
  refus au démarrage hors développement), et faire émettre le jeton par une authentification réelle
  — mot de passe vérifié ou fournisseur OAuth — dont le `sub` est celui du compte authentifié.

### F-03 - Les routes REST accèdent aux salons privés sans autorisation

- **Sévérité** : Critical - **CVSS 4.0 (base)** : 9.3
  `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`
- **CWE** : CWE-862 (Missing Authorization)
- **Source** : A (Semgrep, règle personnelle `rt-route-salon-sans-controle-appartenance`) et C
- **Emplacement** : `src/rest.ts:27` (lecture) et `src/rest.ts:34` (écriture)
- **Description** : le canal temps réel contrôle l'appartenance au salon via `peutRejoindre()`
  (`socketio-server.ts:150`). Les routes REST manipulent **les mêmes salons** sans aucun contrôle :
  ni jeton, ni vérification d'appartenance. Sur `POST`, l'auteur du message est lu dans le corps de
  la requête (`body.auteur`), donc choisi par l'appelant. Le même bien est protégé d'un côté et
  ouvert de l'autre : l'autorisation a été traitée comme une propriété du **transport** au lieu
  d'une propriété de la **ressource**.
- **Preuve reproductible** :

  ```bash
  bash audit/preuve-f03-rest-sans-autorisation.sh http://localhost:3010
  ```

  ```text
  --- 1. le salon 'dev' est bien declare prive
  [{'id': 'dev', 'nom': 'Dev', 'dernierSeq': 2, 'prive': True}]
  --- 2. lecture du salon prive SANS jeton
  [{"seq":1,"salonId":"dev","auteur":"alice","texte":"La CI est verte",...}]
  [HTTP 200]
  --- 3. ecriture dans le salon prive SANS jeton, en usurpant alice
  {"seq":3,"salonId":"dev","auteur":"alice","texte":"preuve audit S8 - injecte sans authentification"}
  [HTTP 201]
  ```

- **Impact** : lecture intégrale des conversations d'un salon privé et injection de messages
  attribués à un tiers, sans aucun compte. Événements redoutés **ER1** (gravité 4) et **ER3**
  (historique non fiable, gravité 3). **Exploitabilité** : élevée - deux commandes `curl`, aucun
  prérequis.
- **Recommandation** : porter l'autorisation sur la ressource et non sur le canal. Un garde unique,
  appliqué par les deux couches, qui prend l'identité authentifiée et l'identifiant de salon et
  appelle `peutRejoindre()`. L'auteur d'un message doit provenir du jeton vérifié, jamais du corps
  de la requête.

### F-04 - Le rate-limiting est par socket, pas par identité

- **Sévérité** : Medium - **CVSS 4.0 (base)** : 6.9
  `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N`
- **CWE** : CWE-770 (Allocation of Resources Without Limits or Throttling)
- **Source** : C (threat model S7, ligne STRIDE #7) - le `grep` trouve bien `RateLimiter`, mais le
  mot n'est pas le contrôle
- **Emplacement** : `src/realtime/socketio-server.ts:158` - le limiteur est instancié **par
  connexion**, dans le handler `connection`
- **Description** : `new RateLimiter(15)` est créé pour chaque socket. Le quota annoncé de
  15 messages par seconde est donc un quota **par connexion**, pas par identité : une même identité
  ouvre autant de sockets qu'elle veut et multiplie son quota d'autant. Deux bornes s'y ajoutent :
  le compteur est remis à zéro toutes les secondes (fenêtre fixe, une rafale double est possible à
  cheval sur deux fenêtres), et il est local à l'instance, donc encore multiplié par le nombre
  d'instances derrière le proxy `ip_hash`.
- **Preuve reproductible** :

  ```bash
  node audit/preuve-f04-ratelimit-par-socket.mjs 10 http://localhost:3010
  ```

  ```text
  10 sockets ouvertes avec LE MEME jeton (sub=alice)
  messages ACCEPTES en 1 seconde : 150  (refuses : 10)
  quota annonce par socket : 15/s  ->  quota effectif pour cette identite : 150
  ```

  Le facteur est exactement le nombre de sockets. Rien ne borne ce nombre.
- **Impact** : saturation du canal et de la diffusion inter-instances par une seule identité, au
  détriment des autres membres. Événement redouté **ER4** (saturation du service, gravité 2).
  **Exploitabilité** : élevée - un jeton, que F-02 délivre gratuitement, et vingt lignes de
  `socket.io-client`.
- **Recommandation** : compteur agrégé **par identité** et partagé entre instances (compteur Redis
  avec fenêtre glissante, puisque Redis est déjà dans l'architecture), plus un plafond explicite du
  nombre de sockets simultanées par identité.

### F-05 - Dépendance `@fastify/static` affectée par un contournement d'autorisation

- **Sévérité** : High - **CVSS 4.0 (base)** : 8.7
  `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N`
- **CWE** : CWE-22 (Path Traversal) et CWE-1104 (Use of Unmaintained Third Party Components)
- **Source** : A (job `deps-scan`, `npm audit`)
- **Emplacement** : `package.json` - dépendance directe `@fastify/static`, montée dans
  `src/server.ts:24`
- **Description** : la version installée est affectée par un *path traversal*, un *route guard
  bypass* et un *authorization bypass*. Le module est réellement monté et sert `public/`, la
  vulnérabilité est donc atteignable. Correctif disponible en `@fastify/static@10.1.3`, montée
  **majeure**.
- **Preuve reproductible** :

  ```bash
  npm audit --audit-level=moderate
  ```

  ```text
  @fastify/static  high
  vulnerable to path traversal / route guard bypass / Authorization Bypass
  fixAvailable: { name: '@fastify/static', version: '10.1.3', isSemVerMajor: true }
  ```

- **Impact** : lecture potentielle de fichiers hors du répertoire `public/`. Aucun événement
  redouté n'est directement atteint, le serveur ne stockant ni secret ni donnée personnelle sur
  disque — mais le secret de F-01 est dans le code source, donc dans l'image.
  **Exploitabilité** : moyenne - la vulnérabilité est publique, mais l'exploitation demande de
  construire une charge adaptée à la version exacte et à la configuration de montage.
- **Recommandation** : monter `@fastify/static@10.1.3`, en traitant la montée comme une majeure
  (test de non-régression sur le service des fichiers statiques). Ne jamais s'appuyer sur un garde
  de route de `@fastify/static` pour une décision de sécurité.

## Ce que l'audit a vérifié sans conclure à un finding

Trois points de la checklist ont été instruits et **écartés**, ce qui fait partie du résultat :

- **Redis n'est pas exposé.** Le service `redis` du `docker-compose.yml` n'a aucune section
  `ports:`, il n'est joignable que sur le réseau interne de la composition.
- **Le contrôle d'origine existe et est configurable.** `cors: { origin: ORIGINES_AUTORISEES }`
  (`socketio-server.ts:120`), alimenté par variable d'environnement. Sa limite — inopérant pour un
  client non-navigateur — est une propriété du mécanisme CORS lui-même, pas un défaut du code ;
  elle est documentée comme borne dans le threat model plutôt que comme finding.
- **L'émission vérifie l'appartenance à la room.** `socket.rooms.has(room)` avant publication
  (`socketio-server.ts:360`) : un client autorisé sur `general` ne peut pas écrire dans `dev` par
  le canal. Ce contrôle est correct.

Deux points d'infrastructure restent ouverts et sont portés au plan de remédiation sans être
qualifiés faute de mesure : l'exposition directe des instances (`3001`, `3002`) qui court-circuite
le proxy, et celle de l'API d'administration de toxiproxy (`8474`), qui permet d'injecter latence
et coupures. Les deux relèvent d'une composition de développement ; ils deviendraient des findings
à part entière dans une composition de production.

## Classement priorisé

Axes notés de 1 à 3, risque égal au produit. Critères définis dans
`docs/adr/0005-criteres-priorisation.md`.

| Rang | Finding | Impact | Exploitabilité | Exposition | Risque | CVSS | Justification du rang |
|---|---|---|---|---|---|---|---|
| 1 | F-01 secret en dur | 3 | 3 | 3 | **27** | 9.3 | Trois findings sont à 27 : CVSS ne les départage pas non plus, tous à 9.3. F-01 passe premier parce qu'il est le seul qui **ne se corrige pas par un correctif de code** : le secret est dans l'historique git, il faut une rotation. Il est aussi l'habilitant des autres. |
| 2 | F-03 REST sans autorisation | 3 | 3 | 3 | **27** | 9.3 | Second parce qu'il est **exploitable sans rien connaître du système** : deux `curl` sur une URL devinable, sans jeton ni lecture du dépôt. F-02 exige au moins de découvrir la route d'émission. |
| 3 | F-02 jeton sans authentification | 3 | 3 | 3 | **27** | 9.3 | Même risque, placé troisième parce que sa correction est la plus simple des trois (retirer la route) alors que F-01 impose une rotation et F-03 une refonte du garde d'autorisation. |
| 4 | F-04 rate-limiting par socket | 2 | 3 | 3 | **18** | 6.9 | **Divergence assumée avec l'ordre CVSS.** Classé au-dessus de F-05 alors que son CVSS est inférieur de 1,8 point. |
| 5 | F-05 `@fastify/static` | 2 | 2 | 3 | **12** | 8.7 | **Divergence assumée.** CVSS le place quatrième, notre classement le met dernier. |

**L'écart avec l'ordre CVSS, et pourquoi il est assumé.** L'ordre CVSS décroissant serait
F-01/F-02/F-03 (9.3), puis **F-05** (8.7), puis **F-04** (6.9). Notre classement inverse les deux
derniers, pour une raison mesurée : F-04 est exploitable **immédiatement, avec l'outillage que nous
avons déjà écrit** et un jeton que F-02 délivre gratuitement — la preuve tient en une commande et
donne 150 messages par seconde. F-05 suppose de construire une charge de traversée adaptée à la
version exacte et à la configuration de montage, travail que nous n'avons pas fait et dont nous ne
savons pas s'il aboutit ici. CVSS note la gravité d'une faiblesse **dans l'absolu** ; notre
classement note ce qui est **réellement atteignable sur ce déploiement, aujourd'hui**.

Second écart, plus discret : CVSS attribue 9.3 aux trois premiers et ne permet donc **aucun**
ordonnancement entre eux. Un plan de remédiation a pourtant besoin d'un ordre. Ce sont les critères
de coût et de réversibilité, hors CVSS, qui tranchent.

## Amorce de plan de remédiation

| Finding | Action | Effort | Priorité | Responsable |
|---|---|---|---|---|
| F-01 | Lire le secret dans `process.env.JWT_SECRET`, refuser le démarrage s'il est absent, **et faire tourner le secret** (l'ancien est publié) | S pour le code, M avec la rotation et le redéploiement | 1 | Alex |
| F-03 | Extraire un garde unique `peutAcceder(identite, salonId)` appelé par le canal **et** par les routes REST ; l'auteur d'un message vient du jeton vérifié | M | 2 | Alex |
| F-02 | Retirer `/api/dev-token` du chemin de production derrière une garde d'environnement, brancher une authentification réelle | S pour la garde, L pour l'authentification | 3 | Alex |
| F-04 | Compteur par identité dans Redis (fenêtre glissante) + plafond de sockets simultanées par identité | M | 4 | Alex |
| F-05 | Monter `@fastify/static@10.1.3`, test de non-régression sur le service statique | S | 5 | Alex |

Le plan complet, avec échéances et dates de revue, est produit en S9.
