# Captures - etape 3 (serveur ws securise)

Trois captures a produire (TP3, J3). Les commandes ci-dessous reproduisent chaque cas ;
le comportement observe est note en dessous.

Prealable : `npm start` (le serveur annonce `couche temps reel : ws securise`).

## 1. Handshake accepte (code 101)

Navigateur : DevTools > Network > WS **avant** de charger <http://localhost:3000>, puis
selectionner la connexion et onglet *Headers*. A montrer : `Sec-WebSocket-Key` envoye,
`Sec-WebSocket-Accept` renvoye, statut **101 Switching Protocols**.

Le front recupere d'abord un jeton via `GET /api/dev-token`, puis ouvre la WebSocket en
presentant le JWT en sous-protocole (`["jwt", token]`).

## 2. Connexion sans token refusee (code 401)

```bash
wscat -c ws://localhost:3000
```

Observe : `HTTP/1.1 401 Unauthorized`. `verifyClient` rejette avant l'upgrade, donc aucune
WebSocket n'est ouverte.

Variante *mauvaise origine* (403), qui distingue identite et provenance :

```bash
wscat -c "ws://localhost:3000?token=<JWT>" -o http://evil.example.com
```

Observe : `HTTP/1.1 403 Forbidden`.

> Le navigateur ne permet pas a JavaScript de lire ce code : `onclose` ne rapporte que
> `1006`. La capture du 401 doit donc venir de DevTools > Network > WS, ou de `wscat`.

## 3. Test d'abus : depassement du seuil (fermeture 1008)

**Seuil choisi : 15 messages/s par connexion** (`MAX_MESSAGES_PAR_SECONDE` dans
`src/realtime/ws-server.ts`). Justification : un humain poste rarement plus d'un message par
seconde, mais on garde de la marge pour les signaux `typing` de l'etape 5, qui seront emis
plusieurs fois par seconde. Un flux de cotations tolererait bien davantage.

Depuis la console d'un onglet connecte :

```js
for (let i = 0; i < 40; i++) ws.send(JSON.stringify({ kind: "message", salonId: "dev", auteur: "x", texte: "flood " + i }));
```

Observe : la connexion se ferme avec **code 1008, raison `rate limit exceeded`**. Le bandeau
de statut du front affiche `ferme : rate limit exceeded (code 1008)`.

## Bonus : usurpation d'identite impossible

Un client authentifie comme `mallory` qui poste avec `"auteur": "usurpateur"` voit ses
messages enregistres sous **`mallory`** : l'auteur vient du JWT verifie au handshake, plus
de la charge utile cliente (`appliquerMessage` dans `src/store.ts`).
