# ADR-2 : strategie de convergence

## Statut
**Accepte** (etape 6).

## Contexte

Le scenario de concurrence du sujet est dans `src/realtime/piege.scenario.ts`, et il ne suppose
aucune malveillance : il decrit une **reconnexion ordinaire**.

Alice a affiche deux messages (`seq` 1 et 2). Sa connexion tombe. A la reconnexion, le serveur
lui renvoie l'historique du salon. Sans strategie, elle affiche :

```
On se voit a 14h ? | Oui parfait | On se voit a 14h ? | Oui parfait
```

`npm run scenario` sort en **code 1** sur ce cas. Deux clients du meme salon voient alors des
fils differents : c'est une divergence, et elle est visible par l'utilisateur.

Ce probleme n'est pas theorique dans ce projet, il a ete constate a chaque etape :

- **etape 1** : le stub renvoyait un etat complet a chaque reconnexion, sans historique ;
- **etape 2** : le buffer SSE borne pouvait rejouer des evenements deja vus ;
- **etape 4** : l'ack prouve qu'un message a ete traite, mais si la connexion tombe **avant**
  que l'ack revienne, le client ne sait pas si son message est passe. Renvoyer produit un
  doublon ; ne pas renvoyer risque une perte. Sans deduplication, il n'y a pas de bonne
  reponse — c'est ce qui a motive le message « etat incertain » plutot qu'un renvoi
  automatique dans `public/index.html`.

## Options envisagees

| Option | Pourquoi elle ne convient pas ici |
|---|---|
| **OT** (operational transformation) | concue pour des editions concurrentes sur un **texte partage**, ou deux insertions au meme index doivent etre transformees l'une par rapport a l'autre. Un message de chat est **atomique et immuable** : personne n'edite le message d'un autre. On paierait la complexite d'OT sans jamais utiliser la transformation. |
| **CRDT de sequence** | resout le meme probleme qu'OT sans serveur central, au prix de positions denses et de metadonnees par caractere. Or nous **avons** un serveur central qui numerote deja. C'est la strategie du sujet 1 (editeur). |
| **Boucle autoritaire a tick fixe** | pertinente quand l'etat evolue en continu et doit etre echantillonne (sujet 4, jeu). Un chat est evenementiel : diffuser un etat 20 fois par seconde reproduirait exactement le defaut du stub constate a l'etape 1 (2917 octets deux fois par seconde sans changement). |
| **Throttle / smoothing** | traite un flux de valeurs continues dont on peut jeter les intermediaires (sujet 5, positions). **Jeter un message de chat est inacceptable.** |
| **Snapshot + delta numerote** | proche de la retenue, et adaptee aux sujets 2 et 5. Elle transporte un etat courant plutot qu'un journal ; un chat a besoin de l'**historique ordonne**, pas du dernier etat. |

## Decision

**Numero de sequence par salon + deduplication cliente** (`dedup-seq`), soit
`src/realtime/convergence.exemple.ts`, branche sans etre reecrit.

C'est la strategie qui correspond a la nature des donnees : un chat est un **journal ordonne
d'evenements immuables**, pas un etat mutable partage. Trois raisons concretes :

1. **La numerotation existe deja.** `Salon.dernierSeq` attribue un `seq` croissant par salon
   dans `poster()`. Il n'y a pas de nouvelle source de verite a introduire — l'autorite
   centrale, que WebRTC nous aurait fait perdre (voir ADR-1), est ici un atout.
2. **Le `seq` est un identifiant naturel d'idempotence.** Le client garde les `seq` vus ;
   recevoir deux fois le meme est sans effet. Cela rend le **renvoi sur**, ce qui transforme le
   probleme : on peut renvoyer largement plutot que de calculer exactement ce qui manque.
3. **Le cout est negligeable** : un entier par message, et un `Set` cote client.

### Branchement

- **Serveur** (`socketio-server.ts`) : `join` accepte `{ depuisSeq }`. Si le client l'annonce,
  l'ack renvoie `messagesDepuis(salon, depuisSeq)` au lieu des 30 derniers. L'ack porte aussi
  `dernierSeq`, pour que le client puisse detecter un trou.
- **Client** (`public/index.html`) : un `SalonClient` par salon. Tout message passe par
  `recevoir()`, **y compris en direct** — un message peut arriver en direct **et** dans le lot
  de resynchronisation qui suit une coupure.
- **Reconnexion** : `socket.io.on("reconnect")` re-emet le `join` avec `lastSeq`.

> On ne cherche pas a eviter le chevauchement cote serveur. C'est deliberé : la deduplication
> etant fiable, un renvoi trop large est sans consequence, alors qu'un renvoi trop etroit perd
> des messages. On choisit le risque benin.

## Consequences

**Ce que ca simplifie.** La reconnexion n'est plus un cas particulier : on rejoint, on annonce
son `lastSeq`, on ingere. Le meme chemin de code sert au premier chargement (`depuisSeq = 0`,
30 derniers messages) et a la reprise. Le renvoi devient une operation sure, ce qui ouvre la
porte a un reessai automatique cote client si on le souhaite plus tard.

**Cout memoire.** Un `Set<number>` par salon ouvert, cote client uniquement. Il croit avec le
nombre de messages vus dans la session ; sur une session tres longue il faudrait le borner
(ne garder que les `seq > lastSeq - N`), ce qui n'est pas fait aujourd'hui et serait un ajout
d'une ligne. Cote serveur, `MAX_HISTORIQUE = 200` messages par salon dans `domain.ts` : rien
n'a ete ajoute a l'etape 6.

**Cout bande passante.** Une reconnexion apres une longue absence renvoie tout depuis
`depuisSeq`, potentiellement l'historique entier du salon. C'est le prix du « renvoi large ».
Une borne serait a poser si les salons devenaient volumineux.

**Cas non couverts, assumes.**

- **Un trou n'est pas comble par la deduplication.** Si un client recoit les `seq` 1 et 5, la
  strategie affiche 1 et 5 sans inventer 2, 3, 4 — verifie par `npm run test:convergence`. Le
  trou se comble en redemandant depuis `lastSeq`, ce que fait la reconnexion. Le champ
  `dernierSeq` de l'ack permet de detecter la situation, mais le front ne declenche pas encore
  de re-demande automatique.
- **Le `seq` est en memoire.** Un redemarrage du serveur repart du seed, donc les `seq`
  recyclent d'anciens numeros. Meme limite que les ids SSE de l'etape 2 : un identifiant
  d'instance transmis au client la leverait.
- **Aucun ordre entre salons.** Le `seq` est croissant **par salon**, pas globalement. C'est
  suffisant ici, puisqu'un fil s'affiche salon par salon, mais interdirait un « fil unifie »
  tous salons confondus sans horodatage supplementaire.
- **Une instance unique.** Deux instances attribueraient des `seq` concurrents pour le meme
  salon. C'est le sujet de l'etape 7.

## Verification

| Commande | Ce qu'elle montre |
|---|---|
| `npm run scenario` | divergence : doublons, code de sortie **1** |
| `npm run scenario -- --avec-strategie` | convergence : 2 messages, code **0** |
| `npm run test:convergence` | renvoi complet, chevauchement, desordre, course direct/resync, trou — et l'equivalence entre `convergence.exemple.ts` et sa transcription navigateur |
