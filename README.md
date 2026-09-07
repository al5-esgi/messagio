# Chat multi-salons + visio

Des salons de discussion avec presence, indicateur de saisie, et (a terme) des appels
audio / video pair a pair entre deux membres d'un salon.

## Sujet

Sujet n° : 3 (Chat multi-salons + visio)

## Choix de push (ADR-1, amorce)

- Sens du flux principal : **bidirectionnel**. Les messages, l'indicateur de saisie et la
  presence partent du client vers le serveur *et* du serveur vers tous les membres du salon.
  Un second flux, pair a pair celui-la, portera l'audio/video (etape 8).
- Technique envisagee : **plusieurs, par couche**. SSE d'abord pour les notifications de salon
  (etape 2, flux descendant seul), puis `ws` nu pour comprendre le handshake et la securite
  (etape 3), puis **Socket.IO** comme transport definitif du chat (rooms `salon:<id>`, ack,
  reconnexion, adaptateur Redis), et enfin **WebRTC** pour la visio uniquement.
- Pourquoi : le chat est intrinsequement bidirectionnel et cloisonne par salon, ce que SSE seul
  ne couvre pas (il faudrait un POST de retour a chaque frappe, inacceptable pour un « X ecrit »
  emis plusieurs fois par seconde). Socket.IO apporte les trois choses qui manquent au stub et
  que je devrais sinon reecrire : les rooms, qui remplacent la diffusion « tout a tout le monde »
  constatee ci-dessus (2917 octets deux fois par seconde, tous salons confondus) ; les accuses de
  reception, qui permettent au client de savoir qu'un message est bien numerote cote serveur ;
  et une reconnexion avec reprise que je completerai par un `since=<seq>` par salon pour combler
  la perte des messages rates. Le cout est une dependance et un protocole non standard, accepte
  parce que le sujet demande aussi de passer a plusieurs instances (etape 7), ou
  `@socket.io/redis-adapter` evite d'ecrire moi-meme un bus de presence distribue.
- Pourquoi pas WebRTC pour le flux principal : un `DataChannel` pair a pair impose un maillage
  entre tous les membres d'un salon et n'a pas d'autorite centrale pour numeroter les messages
  ni les persister, donc je le reserve au flux A/V ou l'absence de serveur relais est justement
  l'objectif (a confirmer en seance 9).

## Demarrer

```bash
npm install
npm start          # http://localhost:3000
# ou : docker compose up --build
```

## API REST

| Methode | Route | Description |
|---|---|---|
| GET | `/api/salons` | liste des salons |
| GET | `/api/salons/:id/messages?since=<seq>` | messages d'un salon depuis un numero de sequence |
| POST | `/api/salons/:id/messages` | poste un message (`{ "auteur": "...", "texte": "..." }`) |
| GET | `/api/stream` | flux SSE des notifications de salon (voir ci-dessous) |

### Canal SSE (etape 2)

`GET /api/stream` emet en `text/event-stream` les notifications de salon : `message` et
`membre-rejoint`. Parametres optionnels : `?salon=<id>` pour filtrer, `?membre=<pseudo>` pour
signaler une arrivee.

```bash
curl -N http://localhost:3000/api/stream                       # flux live, tous salons
curl -N "http://localhost:3000/api/stream?salon=general"       # un seul salon
curl -N -H "Last-Event-ID: 5" http://localhost:3000/api/stream # rattrapage a partir du 6
```

Le buffer de rejeu est borne a 100 evenements (`MAX_BUFFER`). Au-dela, le client recoit un
evenement `resync-needed` et doit repartir d'un instantane REST.

Donnees de demonstration : `npm run seed` (3 salons, ~40 messages).

## Etat de la couche temps reel

Stub volontairement naif (`src/realtime/naive-stub.ts`) : un seul WebSocket global, tous les
salons melanges, pas de presence ni d'indicateur de saisie, pas de signaling WebRTC, messages
perdus a la reconnexion. `TRANSPOSITION.md` liste ce qui est a corriger. Le cas d'ordre et de
deduplication : `npm run scenario`.

## Structure

```
src/domain.ts              salons, membres, messages numerotes par salon (pur)
src/store.ts               etat en memoire
src/rest.ts                routes Fastify
src/server.ts              point d'entree
src/seed.ts                donnees de demonstration
src/realtime/naive-stub.ts       LE stub a remplacer
src/realtime/security-helpers.ts   verification JWT + Origin + RateLimiter (fourni)
src/realtime/convergence.exemple.ts  strategie de convergence adaptee (fourni, a brancher)
src/realtime/piege.scenario.ts   ordre + deduplication a la reconnexion
public/index.html          front de demonstration (2 onglets = 2 membres)
docs/adr/                  vos Architecture Decision Records
```
