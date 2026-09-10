# Soutenance sécurité — présentation reveal.js

Deck du **dossier de sécurité** (module Applications Security, S10). Distinct du deck temps réel
de `docs/soutenance/`, avec lequel il partage le thème.

## Ouvrir

```bash
open docs/soutenance-securite.html
```

Le fichier est **autonome** : CSS et JS de reveal.js y sont inlinés. Ni CDN, ni serveur, ni réseau.

## Afficher les notes de l'orateur

Chaque slide porte ses notes, avec **son créneau horaire** en tête (`[3:30 → 4:15]`).

| Touche | Effet |
|---|---|
| **`V`** | **affiche les notes de la slide courante** en surimpression, en bas de l'écran. Se met à jour en changeant de slide. **C'est l'option fiable** : aucune popup, fonctionne en double-clic sur le fichier local |
| `S` | **vue orateur** : seconde fenêtre avec les notes, la slide suivante, un chrono et le minutage. Idéal si vous avez **deux écrans** — mais elle ouvre une **popup**, que le navigateur peut bloquer, et qui est capricieuse depuis un fichier `file://` |
| `F` | plein écran |
| `Échap` | vue d'ensemble des slides |
| `flèches` / `espace` | naviguer |

> [!] Si `S` ne fait rien, c'est le bloqueur de popups. Autorisez les popups pour la page, ou
> servez le fichier en HTTP (`cd docs && python3 -m http.server 8000`), ou contentez-vous de `V`.
>
> Le jour J avec un vidéoprojecteur : `S`, la fenêtre orateur sur votre écran, la principale sur
> le projecteur. En répétition, ou sur un seul écran : `V`.

## Minutage — 12 slides, aligné sur la grille

La grille impose **15 min : 9 à 10 min de présentation avec démo live, puis 5 min de Q&A notée**
(4 questions tirées au sort, 8 points). Le deck vise **9 min 15**.

| Bloc | Créneau | Ce que la grille attend |
|---|---|---|
| Le risque | 0:15 → 2:45 | « biens essentiels, événements redoutés, puis les 2-3 lignes STRIDE H sur les trust boundaries du canal » |
| Le pipeline | 2:45 → 3:30 | 3 familles de scan, chacune avec un seuil explicite |
| **Démo** | 3:30 → 6:15 | nominal vert · **régression → build rouge** · lecture d'un finding |
| Les décisions | 6:15 → 8:15 | le finding le plus haut, ce qui est corrigé, ce qui ne l'est pas, l'ADR |
| Registre et doc SSI | 8:15 → 8:50 | critère 4 de la grille |
| Reste à faire | 8:50 → 9:15 | prépare la Q&A |

## La démo vaut 4 points sur 12 — à répéter

La grille attend le pipeline **en fonctionnement nominal (vert), puis le cas d'échec**. Sur ce
dépôt, `sast` et `deps-scan` sont rouges en permanence : les findings F-01 à F-05 sont réels et non
corrigés. **Le job vert est `secret-detection`** — c'est lui, et lui seul, qu'il faut montrer en
scène 1, puis casser en scène 2.

### Scène 1 — nominal (vert)

Onglet Actions, dernier run sur `main`. Ouvrir `secret-detection` : `no leaks found`, et le step
« Seuil de blocage » est **skipped**. Montrer `.gitleaksignore` : une exclusion, commentée et
datée.

### Scène 2 — la régression (rouge)

```bash
git switch -c demo-regression
cp docs/soutenance-securite/regression.patch.ts src/deploiement.ts
git add src/deploiement.ts && git commit -m "chore: config de deploiement"
git push -u origin demo-regression
```

Mesuré : **2 détections** `generic-api-key`, sur les lignes 8 et 9. Le step `gitleaks scan` reste
**vert** (il a fait son travail), et c'est « Seuil de blocage » qui passe en **rouge**. C'est ce
step qu'il faut pointer du doigt — la grille le demande explicitement.

> **Pourquoi une charge générique et non une vraie clé de fournisseur.** Une chaîne en `ghp_` ou
> `sk_live_` est bloquée par la **push protection** de GitHub *avant* que les Actions ne
> démarrent : le push est refusé, aucun job ne tourne, et la démonstration n'a pas lieu. Vérifié
> en préparant ce deck. La charge utilise donc des chaînes à haute entropie affectées à des
> variables dont le nom contient un mot-clé de secret, ce que gitleaks détecte et que la push
> protection laisse passer.
>
> Les fausses clés AWS de la documentation (`AKIAIOSFODNN7EXAMPLE`) sont, elles, en liste blanche
> chez gitleaks et **ne déclenchent rien** : c'est un piège à connaître.

C'est en soi un bon sujet de Q&A : **deux garde-fous à deux endroits différents** — la push
protection empêche le secret d'arriver sur le dépôt, gitleaks le détecte s'il y arrive quand même
par un motif que la première ne connaît pas.

### Nettoyage, à faire tout de suite après

```bash
git switch main && git branch -D demo-regression
git push origin --delete demo-regression
```

### Scène 3 — lire un finding

Onglet **Security > Code scanning**, catégorie `semgrep`, finding
`rt-route-salon-sans-controle-appartenance` sur `src/rest.ts:27`. Puis, dans un terminal déjà
prêt :

```bash
PORT=3010 npm start                                    # dans un autre terminal, lancé avant
bash audit/preuve-f03-rest-sans-autorisation.sh http://localhost:3010
```

> Ce script **écrit réellement** un message dans le salon `dev` du seed. Sans conséquence en
> local, mais à ne pas lancer contre une instance dont les données comptent.

## À préparer avant d'entrer dans la salle

1. L'application lancée sur `localhost:3010`, dépôt et onglet **Actions** ouverts.
2. Un terminal avec la commande de la scène 2 **tapée mais non exécutée**.
3. Un second terminal avec le script de preuve F-03, tapé, non exécuté.
4. L'onglet **Security > Code scanning** déjà ouvert sur le bon finding.

> **Règle de backup de la grille** : si l'environnement ne démarre pas en 2 min, présentation en
> mode backup avec des captures horodatées d'un run rouge et d'un run vert, et le critère
> « Pipeline et démo » plafonne à 3 points sur 4. Gardez `docs/captures/` sous la main.

## Modifier

`docs/soutenance-securite.html` est **généré**. Éditer les sources puis reconstruire :

```bash
node docs/soutenance-securite/build.mjs
```

| Fichier | Rôle |
|---|---|
| `slides.html` | les 12 slides et les notes de l'orateur |
| `theme-securite.css` | complément au thème partagé (`../soutenance/theme.css`) |
| `gabarit.html` | la coquille et la configuration de reveal |
| `build.mjs` | inline les dépendances et enveloppe le contenu |
| `regression.patch.ts` | la charge de la scène 2, **à ne jamais fusionner** |
