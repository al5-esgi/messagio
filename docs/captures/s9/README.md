# Captures - etape 9 (WebRTC + chaos reseau)

## 1. Canal P2P ouvert entre 2 navigateurs

Deux fenetres :

- <http://localhost:3001/appel.html?membre=alice&salon=general>
- <http://localhost:3001/appel.html?membre=bob&salon=general>

Cliquer **Rejoindre** dans les deux. Attendu : `P2P connecte` et
`canal de donnees OUVERT - les messages ne passent plus par le serveur`.
Puis **Envoyer en P2P** : le message apparait chez le pair.

Depuis le chat, le bouton **appel P2P** de l'en-tete ouvre cette page en conservant
identite et salon.

## 2. Candidat ICE (capture demandee)

Le journal de la page affiche chaque candidat local. Deux types releves :

```
ICE local (typ host)  : candidate:247826213 1 udp 2113937151 94369411-....local 63472 typ host ...
ICE local (typ srflx) : candidate:1800558628 1 udp 1677729535 46.193.68.142 53775 typ srflx raddr 0.0.0.0 ...
```

- `typ host` : adresse locale de la machine (ici une adresse `.local` anonymisee par le
  navigateur, protection contre le pistage par IP locale).
- `typ srflx` : adresse publique vue par le serveur STUN — c'est elle qui permet de traverser
  un NAT.

## 3. Autorisation du signaling

Un appel n'est possible que dans un salon autorise : la meme regle que la room de discussion.

```js
// console d'un onglet connecte en tant que carol
await socket.timeout(5000).emitWithAck("appel:rejoindre", "dev");
// -> { ok: false, raison: "salon prive : vous n'en etes pas membre" }
```

Sans ce controle, la room d'appel serait une porte derobee vers un salon prive.

Verifications obtenues :

| Cas | Resultat |
|---|---|
| carol -> appel dans `#dev` (prive, non membre) | `salon prive : vous n'en etes pas membre` |
| alice -> appel dans `#dev` (membre) | `{ ok: true, pairPresent: false }` |
| bob -> rejoint apres alice | `{ ok: true, pairPresent: true }` |
| 3e participant sur `#general` | `appel deja complet (2 participants)` |

Le `pairPresent` de l'ack designe qui emet l'offre : le **premier** arrive la produit, quand
le serveur lui signale `appel:pair-pret`. Le second se contente de repondre. Sans cette regle,
les deux offriraient en meme temps et la negociation echouerait
(`m-lines order doesn't match`) — c'est le bug rencontre au premier essai.

## 4. Chaos reseau

Voir `docs/rapport-chaos.md` pour le dispositif, les mesures et l'interpretation.

```bash
docker compose up --build -d
# pointer le navigateur sur http://localhost:19001 (et non :3000)
bash chaos.sh latence
bash chaos.sh coupure 5
bash chaos.sh reset
```

Captures a prendre : le bandeau pendant la reconnexion, la ligne `resync :` en console, et le
fil apres reprise (messages manques presents, une seule fois).

## Si la camera ne demarre pas

Le bouton journalise un diagnostic : `[NomDeLErreur]`, l'etat de la permission, et le nombre de
cameras vues. Les trois causes courantes :

| Journal | Cause | Correctif |
|---|---|---|
| `[NotAllowedError]` alors que `permission camera : granted` | **le MICRO est refuse**, pas la camera | `getUserMedia({ video, audio })` est tout ou rien : une seule permission manquante fait echouer l'appel entier. Camera et micro sont **deux permissions distinctes**, cote site comme cote macOS. Autoriser aussi le microphone. |
| `[NotAllowedError]` + `denied` + libelles vides | le navigateur n'a jamais eu l'autorisation pour cette origine | reglages du site pour `localhost:<port>` : passer Camera **et** Microphone sur *Autoriser*. L'origine inclut le port. Verifier aussi macOS > Reglages Systeme > Confidentialite et securite > Camera **et** Microphone : l'autorisation est **par application**, Chrome autorise n'implique pas Arc autorise, et il faut quitter l'application (Cmd+Q) pour que le changement prenne. |
| `[NotReadableError]` | camera detectee mais deja prise par une autre application | fermer l'autre navigateur / Zoom / Photo Booth qui la retient, puis reessayer |
| `API media indisponible : contexte non securise` | page ouverte via une IP de reseau local | `navigator.mediaDevices` n'existe qu'en HTTPS ou sur `http://localhost`. Ouvrir la page sur `localhost`. |

> A noter pour le chaos : `http://localhost:19001` (toxiproxy) reste un contexte securise, donc
> la camera y fonctionne. Une IP de reseau local, non.

## Note sur la visio

La page porte un bouton **Activer camera + micro** qui ajoute les pistes et declenche une
renegociation (`onnegotiationneeded` -> nouvelle offre). Le chemin de signaling est le meme que
pour le canal de donnees. **Ce chemin media n'a pas pu etre verifie ici faute de camera sur la
machine de developpement** : le canal de donnees, lui, est verifie de bout en bout.
