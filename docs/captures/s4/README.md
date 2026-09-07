# Captures - etape 4 (Socket.IO : rooms, acks, autorisation)

Prealable : `npm start` (le serveur annonce `couche temps reel : Socket.IO ...`).

Le front accepte deux parametres d'URL : `?membre=<pseudo>` pour choisir son identite et
`?salon=<id>` pour le salon initial. Le seed definit **`dev` comme salon prive**, reserve a
`alice` et `bob` (`src/seed.ts`).

## 1. Rejet d'une room non autorisee

Ouvrir <http://localhost:3000/?membre=carol>, puis cliquer sur **Dev (prive)**.

Observe : le bandeau affiche
`join dev REFUSE : salon prive : vous n'en etes pas membre`, et le fil affiche
`acces refuse`. La decision est portee par **l'ack du `join`**, pas par un evenement d'erreur
separe.

Comparaison : <http://localhost:3000/?membre=alice> rejoint `dev` sans probleme.

## 2. Cloisonnement des rooms (le defaut du constat initial, corrige)

Deux onglets : `?membre=alice&salon=dev` et `?membre=carol&salon=general`.
Alice ecrit dans `dev` -> **carol ne voit rien**. Onglet Network > WS : aucune trame ne part
vers l'onglet de carol.

C'est le premier defaut du `TRANSPOSITION.md` corrige : plus de « tout le monde voit tout ».

## 3. Reconnexion automatique

Onglet connecte, DevTools > Network > **Offline** 3 s, puis en ligne.

Observe : `reconnexion... 1` puis
`reconnecte (tentative 1) - on rejoint general`.

> Point important : Socket.IO retablit la **connexion**, mais **pas les rooms** — elles sont
> liees a la session. Le client doit re-emettre son `join`, ce que fait
> `socket.io.on("reconnect", ...)` dans `public/index.html`.

## 4. Ack sur l'evenement metier

Console d'un onglet connecte : chaque envoi journalise
`message confirme, seq = <n>`. Le `seq` est attribue par le serveur : c'est la preuve que le
message est enregistre et numerote, pas seulement transmis.

## Verifications automatisees

Resultats obtenus par un client `socket.io-client` :

| Cas | Resultat |
|---|---|
| alice -> `salon:dev` (membre) | autorise |
| carol -> `salon:dev` (non membre) | refuse : `salon prive : vous n'en etes pas membre` |
| carol -> `salon:zzz` | refuse : `salon inconnu` |
| carol -> `admin` | refuse : `room hors convention salon:<id>` |
| alice ecrit dans `dev`, carol est dans `general` | carol ne recoit rien |
| carol ecrit dans `dev` sans l'avoir rejoint | refuse : `rejoignez le salon avant d'y ecrire` |
| coupure du transport | reconnecte en 1 tentative, re-join OK, 30 messages resynchronises |

Le dernier cas d'ecriture merite l'attention : authentifier au handshake ne suffit pas, il
faut **aussi** verifier a chaque ecriture que l'emetteur a rejoint la room visee.
