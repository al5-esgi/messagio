# Releve de charge - etape 7

## Dispositif

`docker compose up --build` : Redis + 2 instances (`app-a`, `app-b`) + proxy nginx `ip_hash`.
Le trafic passe par le proxy sur `:3000` ; chaque instance est aussi exposee directement
(`:3001`, `:3002`) pour relever `/metrics` par instance — a travers le proxy sticky on
retomberait toujours sur la meme.

500 connexions Socket.IO ouvertes en rafale a travers le proxy, puis fermees d'un coup.

## Mesures

```
avant :  A = 3   B = 0

etablissement : 500/500 connectees en 3084 ms
  mediane 93 ms | p95 1073 ms | max 3062 ms

jauge ws_active_connections :  A = 361   B = 142   (total 503)
repartition : 71,8 % / 28,2 %

apres deconnexion massive (2519 ms) :  A = 3   B = 0
```

## Interpretation

**La charge se repartit, mais mal : 72 % / 28 % au lieu de 50/50.** La cause est `ip_hash`
dans `nginx.conf` : le choix de l'instance depend de l'adresse IP source, pas de la charge
reelle. Les 500 clients viennent d'un meme poste, donc d'un tres petit nombre d'adresses, et
le hash ne peut pas les etaler. En production le meme effet se produit derriere un NAT
d'entreprise : tous les postes d'un site partagent une IP publique et atterrissent sur la meme
instance. Le sticky est une contrainte acceptee (il evite d'avoir a partager l'etat de session
d'Engine.IO), pas une strategie d'equilibrage.

**Le temps d'etablissement n'est pas lineaire.** La mediane reste basse (93 ms) mais le p95
monte a 1073 ms et le maximum a 3062 ms, soit un facteur 33 entre la mediane et la queue.
Les premieres connexions passent vite, les dernieres attendent : la rafale sature l'acceptation
plus vite que le traitement. Une montee progressive donnerait une courbe bien plus plate — ce
qui compte ici est la forme, pas la valeur absolue, mesuree sur un poste de developpement avec
les deux instances et Redis sur la meme machine.

**La deconnexion massive est propre et rapide.** Les jauges reviennent a leur valeur initiale
(A = 3, B = 0) en environ 2,5 s, sans fuite : chaque `disconnect` decremente
`ws_active_connections` et libere son `RateLimiter`. Le total de 503 pendant la charge
correspond bien aux 500 clients de test plus les 3 connexions deja ouvertes.

> Les `presence-left` correspondants ne sont emis qu'au bout du delai de grace de 5 s, et
> seulement apres re-verification de la presence sur toutes les instances : une deconnexion
> massive ne genere donc pas 500 annonces de depart immediates.

## Commandes

```bash
docker compose up --build -d
curl -s localhost:3001/metrics | grep ws_active_connections
curl -s localhost:3002/metrics | grep ws_active_connections
curl -s localhost:3001/instance   # {"instance":"A"}
```
