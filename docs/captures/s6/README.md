# Captures - etape 6 (convergence : seq + deduplication)

## 1. Divergence puis convergence en isolation (J1)

```bash
npm run scenario                      # code 1 : DOUBLONS
npm run scenario -- --avec-strategie  # code 0 : CONVERGE (dedup par seq)
```

Sortie du premier :

```
affichage du stub : On se voit a 14h ? | Oui parfait | On se voit a 14h ? | Oui parfait
DOUBLONS  <- le stub ne deduplique pas par seq
```

Pour capturer les codes de sortie (le `| grep` les masque) :

```bash
npm run --silent scenario > /dev/null 2>&1; echo "sans strategie -> $?"
npm run --silent scenario -- --avec-strategie > /dev/null 2>&1; echo "avec strategie -> $?"
```

## 2. Resynchronisation apres coupure, dans le navigateur (J3, capture demandee)

Deux onglets : <http://localhost:3000/?membre=alice&salon=general> et
<http://localhost:3000/?membre=bob&salon=general>.

1. Dans l'onglet d'alice, ouvrir **DevTools > Console** (le journal de resync s'y affiche).
2. Passer alice en **Network > Offline**.
3. Depuis bob, poster 3 ou 4 messages.
4. Repasser alice en ligne.

Observe dans le bandeau :
`reconnecte (tentative 1) - resync de general depuis seq <n>`

Et dans la console, si le lot contenait des messages deja vus :
`resync : 4 recus, 4 nouveaux, 0 doublon(s) ignore(s)`

Les messages postes pendant la coupure apparaissent, **une seule fois**, dans l'ordre.

## 3. Le renvoi n'est plus dangereux (le cas de l'etape 4)

Console d'un onglet connecte :

```js
const c = clients.get("general");
const avant = c.affiches.length;
const res = await socket.timeout(5000).emitWithAck("join", "salon:general", { depuisSeq: 0 });
const ajoutes = c.recevoirLot(res.messages);
console.log({ renvoyes: res.messages.length, ajoutes, avant, apres: c.affiches.length });
```

Resultat obtenu : `{ renvoyes: 30, ajoutes: 0, avant: 30, apres: 30 }`.

Le serveur renvoie 30 messages deja vus, **aucun** n'est ajoute. A l'etape 4 ce meme renvoi
produisait 30 doublons.

## Verifications automatisees

`npm run test:convergence` :

| Cas | Resultat |
|---|---|
| renvoi complet apres reconnexion | aucun doublon |
| chevauchement (redemande trop ancienne) | 4 messages, ordre stable |
| messages recus dans le desordre | affichage retrie par `seq` |
| message recu en direct **puis** dans le lot de resync | n'apparait qu'une fois |
| trou (`seq` 1 puis 5) | rien n'est fabrique |
| equivalence TS / navigateur | identique sur toutes les suites |

Test de bout en bout avec une vraie coupure (`alice.io.engine.close()`) :

```
alice connectee, 30 messages, lastSeq = 37
resync depuis seq 37 : 4 recus, 4 nouveaux, 0 doublon(s) ignore(s)
4 messages rates rattrapes ? OUI
le serveur renvoie 30 messages deja vus -> 0 ajoute(s)
ordre strictement croissant ? OUI    aucun seq en double ? OUI
```

## Note sur la duplication de code

`src/realtime/convergence.exemple.ts` est fourni et **n'est pas modifie**. Le navigateur ne
pouvant pas importer du TypeScript, `public/salon-client.js` en est la transcription.
`npm run test:convergence` rejoue les memes suites sur les deux implementations et compare :
si l'une derive, le test echoue.
