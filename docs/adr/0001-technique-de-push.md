# ADR-1 : technique de push

## Statut
**Accepte** (etape 4). Propose a l'etape 2, confirme apres avoir pratique SSE (S2),
`ws` nu (S3) et Socket.IO (S4).

## Contexte
Le produit est un chat multi-salons auquel s'ajoutera, en fin de parcours, un appel audio/video
entre deux membres d'un meme salon. Il y a donc **deux flux de nature differente**, et c'est la
distinction qui structure toute la decision :

1. Le **flux principal — bidirectionnel**. Un membre poste un message, signale qu'il est en train
   d'ecrire, rejoint ou quitte un salon ; le serveur diffuse ces evenements aux autres membres du
   meme salon. Le signal de saisie (« X ecrit… ») est emis plusieurs fois par seconde et par
   membre : c'est lui qui fixe la contrainte, pas le message texte.
2. Le **flux A/V — pair a pair**, entre deux membres seulement, une fois l'appel etabli.

L'etat des lieux du stub (voir « Constat initial » dans `TRANSPOSITION.md`) donne les defauts a
corriger : diffusion de l'etat complet des trois salons a tous les clients toutes les 500 ms
(2917 octets mesures, meme sans changement), aucun cloisonnement par salon cote transport, aucun
evenement ephemere, et perte silencieuse des messages manques a la reconnexion.

## Options envisagees
- **Long-polling** — fonctionne partout, mais une requete par evenement et une latence liee au
  cycle de reouverture. Cout inutile aujourd'hui : les alternatives sont largement supportees.
- **Server-Sent Events (SSE)** — unidirectionnel serveur -> client, sur HTTP simple, avec
  reconnexion et `Last-Event-ID` **fournis par le navigateur**. Ne remonte rien vers le serveur.
- **WebSocket** — bidirectionnel, faible latence, mais tout est a construire au-dessus : rooms,
  accuses de reception, reprise apres coupure, montee en charge multi-instances.
- **WebRTC** — pair a pair, latence minimale, concu pour le media temps reel. Necessite un
  serveur de signaling, et n'offre aucune autorite centrale.

## Decision
**WebSocket via Socket.IO pour le flux principal**, **WebRTC pour le seul flux A/V**, et **SSE
conserve comme canal secondaire de notifications en lecture seule**.

SSE est ecarte comme transport principal pour une raison structurelle : il est unidirectionnel.
Remonter un « X ecrit… » imposerait un POST HTTP par frappe, soit exactement le cout que le
temps reel doit supprimer. L'etape 2 l'implemente malgre tout (`GET /api/stream`) parce qu'il
rend deja un service reel — un client passif, un dashboard, un onglet en arriere-plan qui veut
seulement etre notifie — et surtout parce que le mecanisme de rattrapage qu'il oblige a ecrire
(buffer borne + rejeu par identifiant + `resync-needed` quand le retard depasse le buffer) est
celui que l'on rejouera a l'identique sur Socket.IO a l'etape 6, avec le `seq` par salon.

Socket.IO plutot que `ws` nu pour trois besoins deja identifies, qu'il faudrait sinon reecrire :
les **rooms** `salon:<id>`, qui remplacent la diffusion « tout a tout le monde » constatee ; les
**accuses de reception**, qui permettent au client de savoir que son message est numerote cote
serveur ; et le passage a **plusieurs instances** (etape 7) via `@socket.io/redis-adapter`, qui
evite d'ecrire un bus de presence distribue. L'etape 3 passe tout de meme par `ws` nu, pour
brancher a la main le handshake JWT, la verification d'`Origin` et le rate-limit
(`src/realtime/security-helpers.ts`) et comprendre ce que Socket.IO encapsule ensuite.

## Pourquoi pas WebRTC pour le flux principal
Un `DataChannel` pair a pair imposerait un maillage entre tous les membres d'un salon — N(N-1)/2
connexions — et surtout **il n'y a plus d'autorite centrale** : personne pour attribuer le `seq`
par salon, verifier l'appartenance au salon, ni conserver l'historique pour un membre absent. Ces
trois garanties sont precisement ce que les etapes 4 a 6 construisent. WebRTC est donc reserve au
flux A/V, ou l'absence de relais serveur est justement l'objectif recherche (latence et cout).
*A confirmer a l'etape 8, une fois le signaling `offer`/`answer`/`ice` pratique.*

## Consequences

*Section revue a l'etape 4, apres pratique des trois techniques.*

**Le choix est confirme.** Rien de ce qui a ete implemente n'a remis en cause la decision, et
deux points l'ont renforcee. D'abord les **rooms** : `io.to("salon:dev").emit(...)` a supprime en
une ligne le defaut central du constat initial — les 2917 octets de tous les salons diffuses
toutes les 500 ms. Un client de `general` ne recoit plus rien de `dev`, verifie. Ensuite les
**acks** : porter la decision d'autorisation par l'ack du `join`, plutot que par un evenement
d'erreur separe, evite d'inventer un protocole de correlation requete/reponse. L'ack du
`message` renvoie le `seq` attribue par le serveur, ce qui prepare directement l'etape 6.

**Un ajustement.** L'etape 3 avait deja donne l'authentification au handshake ; l'etape 4 a
montre que cela ne suffit pas. Un membre authentifie et autorise sur `general` pouvait encore
ecrire dans `dev` en annoncant simplement `salonId: "dev"`. L'autorisation doit donc etre
verifiee **deux fois** : a l'entree dans la room, et a chaque ecriture (`socket.rooms.has(room)`).
C'est la lecon la moins intuitive de la seance, et elle ne tient pas au transport choisi.

**Ce que SSE apporte encore.** Le canal `GET /api/stream` de l'etape 2 est conserve : il sert un
client passif sans dependance ni bibliotheque. Son mecanisme de rattrapage (buffer borne, rejeu
par identifiant, `resync-needed`) est le modele de ce que l'etape 6 rejouera sur Socket.IO avec
le `seq` par salon. L'implementer n'aura donc pas ete un detour.

**Ce que ce choix ne permet toujours pas — et ce qu'il coute.** Socket.IO n'est pas un WebSocket
standard : un client tiers ne peut pas s'y connecter avec `new WebSocket(...)`, ce qui reste
accepte puisque le seul client prevu est le front du projet. Le protocole ajoute son propre
encodage et son heartbeat, donc un surcout par message que ne justifierait pas un flux
purement descendant. Enfin **une room ne survit pas a une reconnexion** : Socket.IO retablit la
connexion tout seul, mais le client doit re-emettre son `join` — verifie a l'etape 4, et c'est
exactement la que se logera la deduplication de l'etape 6.
