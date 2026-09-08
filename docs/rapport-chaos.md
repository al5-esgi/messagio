# Rapport de chaos - etape 9

## Dispositif

`toxiproxy` s'intercale devant la pile, et **seul le client victime le traverse** :

```
navigateur victime -> :19001 (toxiproxy) -> proxy:3000 (nginx) -> app-a / app-b -> redis
emetteur           -> :3001 (instance A, en direct)
```

L'emetteur tape en direct sur une instance : il peut donc poster **pendant** que la victime
est coupee, ce qui est exactement le scenario a mesurer.

```bash
docker compose up --build -d
bash chaos.sh latence     # +200 ms
bash chaos.sh coupure 5   # coupure de 5 s
bash chaos.sh reset       # retire tout
```

Latence verifiee : `GET /api/salons` repond en **216 ms** via `:19001` contre **4 ms** en
direct sur `:3000`.

## Mesures (coupure de 5 s, 4 messages postes pendant l'absence)

| Etape | Duree |
|---|---|
| detection de la coupure par le client | **0 ms** (le transport tombe immediatement) |
| retour reseau -> reconnexion Socket.IO | **3301 ms** |
| reconnexion -> etat correct affiche | **9 ms** |
| **total : retour reseau -> resynchronise** | **3310 ms** |

```
rattrapage : 4 recus, 4 nouveaux, 0 doublon ignore
ordre strictement croissant : OUI | doublons : AUCUN
seq 37 -> 41
```

## Interpretation (ce qui casse, ce qui se retablit)

**Ce qui casse pendant la coupure.** Le transport tombe instantanement et l'interface se fige :
aucun message entrant, l'envoi echoue en `etat incertain` au bout du timeout d'ack de 5 s, et
la liste des presents reste sur sa derniere valeur connue — elle ment donc pendant toute la
coupure. Les 4 messages emis pendant l'absence ne sont evidemment pas recus.

**Ce qui se retablit seul, et en combien de temps.** Tout, sans intervention. La reconnexion
Socket.IO prend l'essentiel du delai (**3,3 s** pour une coupure de 5 s), parce que le backoff
exponentiel a deja espace plusieurs tentatives quand le reseau revient : le client ne teste pas
en continu. Une fois reconnecte, la resynchronisation est **quasi instantanee (9 ms)** : le
re-`join` porte `depuisSeq: 37`, le serveur renvoie les 4 messages manquants, et la
deduplication garantit qu'aucun n'apparait deux fois. Cote presence, la victime n'a jamais ete
annoncee comme partie : le delai de grace de 5 s a absorbe la coupure de justesse.

**La lecon de la mesure.** Le cout n'est pas dans la resynchronisation (9 ms) mais dans la
**detection du retour reseau** (3301 ms), soit 99,7 % du delai total. Optimiser le rattrapage
serait donc inutile ; ce qui compte, c'est le reglage du backoff. Baisser `reconnectionDelayMax`
raccourcirait la reprise au prix de tentatives plus frequentes — un arbitrage a poser en
fonction du reseau vise, pas un defaut de conception.

**Limite connue, non corrigee.** Si la coupure depasse le delai de grace, la victime est
annoncee partie chez les autres puis revient comme une nouvelle arrivee. C'est cosmetique, mais
visible. Et si le serveur redemarre pendant la coupure, les `seq` repartent du seed : le client
revient avec `depuisSeq: 37`, ne recoit rien, et croit son etat a jour alors qu'il ne l'est pas.
C'est la limite identifiee des l'etape 2 (ids SSE) et repetee dans l'ADR-2 : il manque un
identifiant d'instance qui, en changeant, declencherait un resynchronisation complete.

## Captures a joindre

1. `chaos.sh` en cours d'execution a cote du navigateur : bandeau `reconnexion... 1` puis
   `reconnecte (essai N) - resync depuis seq 37`.
2. Console du navigateur : `resync : N recus, M nouveaux, X doublon(s) ignore(s)`.
3. Le fil apres reprise : les 4 messages manques presents, une seule fois, `seq` continus.
