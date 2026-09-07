# Captures - etape 5 (presence, signal ephemere, snapshot)

Prealable : `npm start`. Le front accepte `?membre=<pseudo>` et `?salon=<id>`.

## 1. Snapshot a la connexion tardive (capture demandee, 2 navigateurs)

- Navigateur A : <http://localhost:3000/?membre=alice&salon=general>
- Navigateur B, ouvert **ensuite** : <http://localhost:3000/?membre=bob&salon=general>

Observe : B affiche `alice` dans la barre de presence **immediatement**, sans qu'alice ait rien
fait. L'etat courant arrive dans l'ack du `join`, il n'est pas reconstruit a partir des
evenements suivants.

Variante plus parlante : dans A, commencer a taper (sans envoyer), puis ouvrir B. B affiche
`alice ecrit...` des l'ouverture — le snapshot porte aussi la derniere valeur connue du signal
ephemere.

## 2. Delai de grace (5 s)

Dans B, recharger la page (F5) et regarder A.

Observe : **aucun** message `bob est parti`. Le rechargement produit un `disconnect` suivi d'un
`join` en moins d'une seconde, donc le depart programme est annule.

Fermer B et attendre : au bout de **5 s**, A affiche `bob est parti`.

## 3. Signal ephemere `typing`

Taper dans A sans envoyer : B affiche `alice ecrit...` sous le fil. Arreter de taper : la
mention disparait au bout de 4 s, sans qu'aucun evenement ne soit emis pour l'annuler.

Verification de non-persistance : `GET /api/salons/general/messages?since=<n>` ne contient
aucune trace des `typing`. Le signal est diffuse, jamais enregistre.

## Verifications automatisees

`npm run test:presence` — verification deterministe de `src/realtime/presence.ts` :

| Cas | Resultat |
|---|---|
| arrivee puis depart | aucun fantome dans la liste |
| 2 onglets d'une meme personne | une seule entree, une seule annonce d'arrivee |
| fermeture d'un onglet sur deux | aucun depart programme |
| fermeture du dernier onglet | `presence-left` emis |
| retour avant la fin de la grace | aucun depart annonce |
| snapshot pendant une saisie | `saisit: true` |
| snapshot apres expiration | `saisit: false` |

## Ecart assume avec le kit de reference

Le kit indexe les membres par `socketId` : une personne ouvrant deux onglets apparait deux fois
dans la liste des presents, et fermer un seul onglet declenche un depart alors qu'elle est
toujours la. Un chat affiche des personnes, pas des connexions. `src/realtime/presence.ts`
suit donc les sockets pour le comptage, mais **deduplique par pseudo** a la lecture et
n'annonce arrivee ou depart que sur le premier et le dernier onglet.
