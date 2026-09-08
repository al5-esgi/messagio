# ADR-3 : strategie de robustesse

## Statut
**Accepte** (etape 9), apres mesure sous chaos reseau. Amorce a l'etape 7.

## Contexte

Que se passe-t-il, dans ce projet, apres une coupure reseau de 5 secondes ?

Le chemin est aujourd'hui entierement instrumente, et chaque maillon a ete verifie :

1. Socket.IO detecte la coupure (heartbeat `pingInterval` 25 s / `pingTimeout` 20 s) et
   reconnecte tout seul, avec backoff.
2. **La room ne survit pas a la session** : le client doit re-emettre son `join`
   (`socket.io.on("reconnect")` dans `public/index.html`). Sans cela tout semble reconnecte
   mais plus rien n'arrive.
3. Le `join` transporte `depuisSeq` : le serveur renvoie tout ce qui a suivi, et le client
   deduplique par `seq` (ADR-2). Mesure : coupure d'alice, 4 messages postes par bob,
   `4 recus, 4 nouveaux, 0 doublon`.
4. Cote presence, la coupure ne declenche pas de depart : le **delai de grace** de 5 s
   l'absorbe, et un rechargement de page n'annonce jamais de « parti ».

Un second axe de robustesse a ete ajoute a l'etape 7 : deux instances derriere un proxy
sticky, avec fan-out et presence distribues via Redis.

## Options envisagees

- **Reconnexion + resynchronisation** (rejeu par `seq`, snapshot dans l'ack du `join`).
- **Fan-out multi-instances via Redis** comme element de robustesse principal.

## Decision

**La reconnexion + resynchronisation est l'element de robustesse principal.** Le fan-out
Redis est un mecanisme de **montee en charge**, pas de robustesse, et le confondre avec elle
serait une erreur d'analyse.

Trois raisons :

1. **Les deux ne traitent pas la meme panne.** La panne dominante d'une application temps reel
   est le reseau du client : wifi qui saute, tunnel, passage 4G, mise en veille. Elle survient
   plusieurs fois par session et par utilisateur. Une instance qui tombe est rare, et
   l'utilisateur la subit comme... une coupure reseau — c'est-a-dire que **la reconnexion la
   traite aussi**. L'inverse est faux : Redis ne repare rien pour un client hors ligne.
2. **Redis ajoute un point de defaillance.** C'est le seul composant partage. L'etape 7 l'a
   demontre involontairement : `fetchSockets()` rejette quand une instance ne repond pas, et
   le rejet non capture faisait tomber l'instance qui interrogeait — **la panne se propageait
   au cluster**. Un mecanisme de robustesse ne doit pas etre la premiere source de panne
   corrigee. D'ou le repli sur la vue locale dans `socketsDeLaRoom()`.
3. **La resynchronisation est verifiable et le reste hors Docker.** `npm run scenario`,
   `npm run test:convergence` et un test de bout en bout la couvrent, sans infrastructure. La
   robustesse d'un systeme qu'on ne sait pas tester en local n'en est pas une.

Le fan-out Redis reste **necessaire mais subordonne** : sans lui, deux clients repartis par le
proxy sur des instances differentes ne se voient pas du tout. Il rend le scaling *possible*,
il ne rend pas le systeme *resilient*.

## Consequences

**Ce que ca couvre.** Coupure courte (grace, aucun depart annonce), coupure longue (re-join +
`depuisSeq`), redemarrage d'une instance (le client reconnecte, potentiellement sur l'autre
instance, et resynchronise), et perte d'un ack (le renvoi est sans danger depuis l'ADR-2).

**Ce que ca coute.** Un `Set<number>` par salon cote client, un entier par message, et un aller
retour supplementaire a la reconnexion. Cote infrastructure, Redis et un proxy sticky.

**Ce que ca ne couvre pas, et qui reste ouvert pour l'etape 9.**

- **Le `seq` est en memoire.** Un redemarrage du serveur repart du seed : les `seq` recyclent
  d'anciens numeros, et un client qui revient avec `depuisSeq: 40` ne recevra rien alors qu'il
  a rate des messages. Un identifiant d'instance transmis au client, qui declenche un resync
  complet quand il change, leverait la limite — meme parade que pour les ids SSE de l'etape 2.
- **Un trou n'est pas detecte activement.** L'ack du `join` renvoie `dernierSeq`, mais le front
  ne compare pas encore avec son propre `lastSeq` pour declencher une re-demande.
- **`ip_hash` ne repartit pas la charge** : 72 % / 28 % mesures sur 500 connexions (voir
  `docs/captures/s7/releve-de-charge.md`). Acceptable ici, a revoir si le nombre d'instances
  augmente.
- **La presence est une vue, pas une verite.** En cas d'instance injoignable, la liste des
  presents est temporairement incomplete. C'est un choix : la presence est une information de
  confort, la disponibilite du chat ne doit pas en dependre.
- **Le chaos reseau a confirme la decision** (voir `docs/rapport-chaos.md`). Sous coupure de
  5 s avec 4 messages perdus, tout se retablit sans intervention en **3310 ms**. Le fait
  marquant est la repartition de ce delai : **3301 ms pour reconnecter, 9 ms pour
  resynchroniser**. Le rattrapage par `seq` ne coute donc rien ; le cout est entierement dans
  la detection du retour reseau, c'est-a-dire dans le backoff de Socket.IO. Cela renforce la
  decision : la robustesse tient au couple reconnexion + resync, et le seul reglage qui
  deplacerait l'aiguille est `reconnectionDelayMax`, pas la strategie de convergence.

- **Le canal P2P de l'etape 9 ne beneficie d'aucune de ces garanties**, et c'est assume. Un
  `RTCDataChannel` rompu ne se repare pas tout seul : il faut renegocier. C'est precisement
  l'argument de l'ADR-1 contre WebRTC pour le flux principal — pas d'autorite centrale, donc
  ni `seq`, ni historique, ni rattrapage. Le serveur previent immediatement le pair
  (`appel:pair-parti`, sans delai de grace) pour qu'il ne reste pas devant un canal mort.
