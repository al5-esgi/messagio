# Transposition temps reel - chat multi-salons + visio

Ce projet part d'un **stub temps reel naif** (`src/realtime/naive-stub.ts`). A chaque etape,
vous en remplacez une tranche par la technique vue sur le kit de reference.

| Étape | Defaut du stub a corriger | Ce que vous branchez | Cible dans ce projet |
|---|---|---|---|
| 1 | (constat) | rien : vous listez par ecrit ce qui ne va pas | 2 onglets, salons differents : les messages se melangent ; pas de "X ecrit" ; perte a la reconnexion |
| 2 | diffusion "push tout a tout le monde" | canal **SSE** + buffer borne + `Last-Event-ID` | notifications de salon (nouveau message, arrivee d'un membre) |
| 3 | `WebSocketServer` nu, aucune securite | serveur **`ws`** + handshake JWT + `Origin` + rate-limit | le point d'entree du chat |
| 4 | pas de room : tous les salons melanges | **Socket.IO** + room `salon:<id>` + ack sur `message` + autorisation par salon | une room par salon |
| 5 | pas de presence, pas d'indicateur de saisie | presence par salon + `typing` (signal ephemere) + snapshot a la connexion | liste des presents, "X ecrit..." |
| 6 | reaffichage sans deduplication | **numero de sequence par salon + deduplication** a la reconnexion | `src/realtime/piege.scenario.ts` : pas de doublon apres renvoi |
| 7 | instance unique | `@socket.io/redis-adapter` + **presence distribuee** (le sujet s'y prete mieux que le fan-out simple) | presence correcte a travers 2 instances |
| 8 | pas de signaling | **WebRTC natif** : signaling `offer`/`answer`/`ice` relaye + visio P2P entre 2 membres + chaos reseau | c'est le coeur du sujet |

Les ADR correspondants : `docs/adr/0001` (etape 2, acceptee etape 4), `docs/adr/0002` (etape 6), `docs/adr/0003`
(etape 7, acceptee etape 8). S'y ajoute `docs/adr/0004` (flux audio/video), **non prescrit par le
template** : les decisions prises sur la visio — P2P plutot que SFU, STUN sans TURN, deux
participants — n'etaient documentees nulle part.

## Avancement

| Etape | Statut | Ou |
|---|---|---|
| 1 - constat | fait | « Constat initial » ci-dessous |
| 2 - SSE + buffer borne + `Last-Event-ID` | fait | `src/realtime/sse-notifications.ts`, `GET /api/stream` |
| 3 - serveur `ws` + JWT + Origin + rate-limit | fait | `src/realtime/ws-server.ts` |
| 4 - Socket.IO + rooms `salon:<id>` + ack | fait | `src/realtime/socketio-server.ts` |
| 5 - presence + `typing` + snapshot | fait | `src/realtime/presence.ts` |
| 6 - deduplication a la reconnexion | fait | `convergence.exemple.ts` branche, `public/salon-client.js` |
| 7 - adaptateur Redis + presence distribuee | fait | `src/realtime/scaling.ts`, `docker-compose.yml` |
| 8 - signaling WebRTC + visio | fait | relais dans `socketio-server.ts`, `public/appel.html` |

Tranches du stub desormais remplacees : la diffusion « push tout a tout le monde » (rooms,
etape 4), l'absence de securite au handshake (etape 3), l'absence de presence et de signal
ephemere (etape 5), et le « rechargement total » a la connexion (snapshot dans l'ack du `join`).
`naive-stub.ts` et `ws-server.ts` restent dans le depot comme points de comparaison ; seul
`socketio-server.ts` est demarre.

Le renvoi apres coupure ne produit plus de doublon : le `seq` par salon sert de cle
d'idempotence, le client deduplique (`npm run scenario`, `npm run test:convergence`).

La presence est distribuee : elle est calculee par `fetchSockets()`, que l'adapter Redis
interroge sur toutes les instances. Deux clients repartis par le proxy se voient, s'ecrivent
et voient leurs signaux de saisie (`docs/captures/s7/`).

Le signaling WebRTC est relaye par le serveur (`appel:offer` / `appel:answer` / `appel:ice`),
avec la meme regle d'autorisation que les salons. Le `RTCDataChannel` est verifie entre deux
navigateurs : une fois ouvert, les messages ne transitent plus par le serveur.

Toutes les tranches du stub sont remplacees. Le comportement sous chaos reseau est mesure
dans `docs/rapport-chaos.md`.

## Code fourni pour vous aider

- `src/realtime/security-helpers.ts` : verification JWT + `Origin` + `RateLimiter` (etape 3), a brancher.
- `src/realtime/convergence.exemple.ts` : la strategie de convergence deja adaptee a ce projet
  (etape 6). Vous la branchez, vous ne la reecrivez pas.
- `src/realtime/piege.scenario.ts` : le cas de concurrence.
  `npm run scenario` echoue (stub) ; `npm run scenario -- --avec-strategie` reussit (strategie branchee).

## Constat initial

Avec deux onglets ouverts sur deux salons differents, le serveur envoie a chacun l'etat complet
des trois salons : une sonde WebSocket mesure une trame de 2917 octets toutes les 500 ms
(7 trames en 3 s) alors qu'aucun message n'a ete poste entre-temps, parce que `startNaiveStub`
rediffuse `fullState()` sur un `setInterval` a tous les clients, sans room ni notion de
changement. Le filtrage par salon est donc purement cosmetique et fait cote client
(`state[sel]` dans `public/index.html`) : la bande passante et la confidentialite des salons
auxquels je n'appartiens pas ne sont pas assurees, et le cout croit en O(salons x clients).
Il n'existe aucun evenement ephemere : ni presence, ni « X ecrit… », puisque le seul type de
message serveur est `state` et que rien ne trace les sockets par salon. A la reconnexion, le
client ne recoit qu'un snapshot tronque aux 30 derniers messages : apres avoir rate 35 messages
dans `dev`, il reprend au `seq` 8 et les `seq` 1 a 7 sont perdus sans que rien ne le signale —
le `?since=<seq>` existe pourtant deja cote REST, mais la couche temps reel l'ignore. Enfin
`applyInput` applique l'entree cliente telle quelle : pas de JWT, pas de verification d'`Origin`,
pas de rate-limit, donc n'importe quel onglet peut ecrire dans n'importe quel salon sous
n'importe quelle identite.
