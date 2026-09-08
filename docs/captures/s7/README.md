# Captures - etape 7 (scaling horizontal + observabilite)

## 1. La pile multi-instances demarre

```bash
docker compose up --build
docker compose ps
```

Attendu : `redis` (healthy), `app-a`, `app-b`, `proxy`. Les logs de chaque instance affichent
`[A] redis-adapter branche sur redis://redis:6379`.

## 2. Presence distribuee (capture demandee pour le sujet 3)

Le TP autorise a demontrer la **presence distribuee** plutot que le fan-out pour un sujet
peu bavard. Ici les deux sont verifies.

Deux navigateurs, chacun sur une instance differente :

- <http://localhost:3001/?membre=alice&salon=general> — instance **A**
- <http://localhost:3002/?membre=bob&salon=general> — instance **B**

Attendu : chacun voit l'autre dans la barre de presence, et les messages passent d'une
instance a l'autre. `curl localhost:3001/instance` / `:3002/instance` confirme sur quelle
instance on se trouve.

## 3. Metriques

```bash
curl -s localhost:3001/metrics | grep -E "ws_active_connections|ws_connects_total"
```

## Verifications automatisees

Clients diriges explicitement vers une instance (`:3001` = A, `:3002` = B) :

| Cas | Resultat |
|---|---|
| alice (A) poste, bob (B) ecoute | recu — fan-out via Redis pub/sub |
| carol arrive sur A | voit bob, connecte sur B |
| alice (A) tape | bob (B) recoit `typing` |
| dave arrive sur B pendant qu'alice ecrit | snapshot avec `saisit: true` |
| bob (B) se deconnecte | aucun depart a 2 s, `presence-left` a 6,5 s chez alice (A) |

Releve de charge et interpretation : `releve-de-charge.md`.

## Deux pieges rencontres, et corriges

**`socket.data` est serialise en JSON par `fetchSockets()`.** Le `RateLimiter` y avait ete
range a l'etape 4 ; il contient un `setInterval`, dont la structure est circulaire.
`JSON.stringify` levait, et **l'instance interrogee tombait**. Le limiteur est desormais garde
dans une Map locale, hors de `socket.data`. Symptome : `TypeError: Converting circular
structure to JSON` dans `redis-adapter`.

**`fetchSockets()` rejette si une instance ne repond pas.** Pendant un `docker compose up
--build`, une instance disparait le temps du redemarrage : l'autre l'interroge, expire, et le
rejet non capture tuait le processus — la panne se propageait donc a tout le cluster.
`socketsDeLaRoom()` capture et se rabat sur la vue locale : la liste des presents est
temporairement incomplete, ce qui vaut mieux qu'un serveur qui tombe.
