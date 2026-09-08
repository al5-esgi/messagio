# Soutenance — présentation reveal.js

## Ouvrir

```bash
open docs/soutenance.html
```

Le fichier est **autonome** : CSS et JS de reveal.js y sont inlinés. Ni CDN, ni serveur, ni
réseau — il s'ouvre par double-clic, y compris sur une machine qui n'est pas la vôtre.

## Pendant la présentation

| Touche | Effet |
|---|---|
| `S` | **vue orateur** : notes, minutage, chrono, slide suivante |
| `F` | plein écran |
| `Échap` | vue d'ensemble des slides |
| `flèches` | naviguer |

La vue orateur ouvre une seconde fenêtre : à mettre sur votre écran, la principale sur le
vidéoprojecteur. **Chaque slide porte son créneau horaire** dans les notes.

## Minutage — 10 min, questions non comprises

| Bloc | Créneau |
|---|---|
| Constat + séances 1 à 3 | 0:00 → 2:05 |
| Socket.IO, rooms, présence | 2:05 → 4:15 |
| Convergence + scaling | 4:15 → 6:10 |
| WebRTC + chaos | 6:10 → 8:00 |
| Démonstration | 8:00 → 10:00 |

**11 slides : 8 min d'exposé, 2 min de démo.** Les notes de chaque slide portent son créneau ;
si vous êtes en avance ou en retard, la vue orateur vous le dira.

La dernière slide reste affichée pendant les questions : elle porte les trois ADR et les
limites connues, c'est-à-dire de quoi répondre à la moitié de ce qu'on vous demandera.

Deux slides sont volontairement plus lentes que les autres, parce qu'elles portent le fond :
**« Socket.IO n'est pas WebSocket »** et **« WebRTC : pair-à-pair, mais pas sans serveur »**.
Ne les expédiez pas.

## Avant de commencer, dans cet ordre

```bash
docker compose up --build -d
```

Puis, tout préparé **avant** d'entrer dans la salle :

1. deux fenêtres côte à côte : `localhost:3001/?membre=alice` et `localhost:3002/?membre=bob`
   (les badges *instance A* / *instance B* sont la preuve visuelle du scaling) ;
2. un onglet sur `localhost:3001/appel.html?membre=alice` et un second `?membre=bob` ;
3. un terminal prêt avec `bash chaos.sh coupure 5` déjà tapé, non exécuté ;
4. la caméra testée sur le port exact que vous montrerez — les permissions sont par origine,
   et `:3000`, `:3001`, `:19001` sont trois origines différentes.

> Si un point de la démo échoue : ne déboguez pas en direct. Dites ce qui aurait dû se passer,
> renvoyez au `docs/rapport-chaos.md` qui porte les mesures, et passez au point suivant.

## Modifier

Le fichier `docs/soutenance.html` est **généré**. Éditez les sources, puis reconstruisez :

```bash
node docs/soutenance/build.mjs
```

| Fichier | Rôle |
|---|---|
| `slides.html` | le contenu des 11 slides et les notes de l'orateur |
| `theme.css` | le thème clair, verrouillé pour la vidéoprojection |
| `gabarit.html` | la coquille et la configuration de reveal |
| `build.mjs` | inline les dépendances et enveloppe le contenu pour le centrage |
