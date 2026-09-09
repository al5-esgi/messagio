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

## Minutage — aligné sur la grille

La grille impose **14 min chrono : 8-9 min de présentation + démo, puis 5-6 min de Q&A notée**
(4 questions tirées au sort, 8 points). Le deck vise **8 min 30**.

| Bloc | Créneau | Ce que la grille attend |
|---|---|---|
| Sujet et architecture | 0:00 → 2:35 | « quel domaine, quels canaux/rooms, quel transport » |
| Point de départ | 2:35 → 3:25 | contexte |
| **Démonstration** | 3:25 → 6:25 | nominal 2 navigateurs · **le piège** · coupure/reprise |
| Choix techniques | 6:25 → 7:55 | ADR-1, ADR-2, ADR-3 : options écartées argumentées |
| Mesures et limites | 7:55 → 8:30 | prépare la Q&A |

## La démo est notée 7 points sur 12 — à répéter

| Scène | Critère | Points |
|---|---|---|
| 1 · nominal à 2 navigateurs, présence, refus sur `#dev` | rooms, présence, reconnexion | 3 |
| 2 · **le piège de concurrence, reproduit en direct** | convergence visible entre 2 clients | **3** |
| 3 · coupure et reprise | robustesse sous coupure réseau | 2 |
| démarrage `docker compose up` | mesuré à **10 s** | 2 |

> La scène 2 est celle qui rapporte le plus, et c'est la seule que la grille exige de voir
> **reproduite en direct** : « le cas limite est reproduit en direct et la stratégie fait
> converger les deux clients de façon visible ». Les numéros `#seq` affichés sur chaque
> message sont ce qui rend la convergence visible à l'écran — pointez-les.

## Avant de commencer, dans cet ordre

```bash
docker compose up --build -d
```

Mesuré : **10 secondes** jusqu'à ce que le proxy et les deux instances répondent.
La grille accorde 2 points pour un démarrage sous 2 minutes, et prévoit que chacun lance sa
pile **avant le premier passage** — faites-le.

Puis, tout préparé **avant** d'entrer dans la salle :

1. deux fenêtres côte à côte : `localhost:3001/?membre=alice` et `localhost:3002/?membre=bob`
   (les badges *instance A* / *instance B* sont la preuve visuelle du scaling) ;
2. un troisième onglet prêt sur `?membre=carol&salon=dev` pour la scène du refus ;
3. un terminal avec `npm run scenario` et `bash chaos.sh coupure 5` **déjà tapés**, non exécutés ;
4. la caméra testée sur le port exact que vous montrerez — les permissions sont par origine.

> **Règle de backup de la grille** : si l'environnement ne démarre pas en 2 min, vous présentez
> avec des captures horodatées et le critère « démo live » passe à 1 point maximum. D'où les
> captures dans `docs/captures/` — gardez-les ouvertes dans un onglet.

## Modifier

Le fichier `docs/soutenance.html` est **généré**. Éditez les sources, puis reconstruisez :

```bash
node docs/soutenance/build.mjs
```

| Fichier | Rôle |
|---|---|
| `slides.html` | le contenu des 7 slides et les notes de l'orateur |
| `theme.css` | le thème clair, verrouillé pour la vidéoprojection |
| `gabarit.html` | la coquille et la configuration de reveal |
| `build.mjs` | inline les dépendances et enveloppe le contenu pour le centrage |
