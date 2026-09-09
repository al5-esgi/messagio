# Pipeline de sécurité - messagio

Trois jobs, deux fichiers de workflow. Chacun **publie son rapport** puis **décide** du blocage
dans un step distinct : produire la preuve et casser le build sont deux gestes séparés, de sorte
qu'un job rouge laisse toujours un rapport exploitable derrière lui.

| Job | Fichier | Outil | Périmètre | Seuil de blocage |
|---|---|---|---|---|
| `sast` | `.github/workflows/sast.yml` | Semgrep 1.145.0, `p/ci` + `.semgrep/` | `src/` uniquement | tout finding (`--error`), converti en décision par le step « Seuil de blocage » |
| `secret-detection` | `.github/workflows/sast.yml` | gitleaks 8.30.1, image officielle | **historique git complet** (`fetch-depth: 0`) | tout secret détecté |
| `deps-scan` | `.github/workflows/supply-chain.yml` | `npm audit` **et** `osv-scanner` | `package-lock.json` | `--audit-level=moderate` |

## Pourquoi ces choix

**Périmètre `src/`.** Scanner la racine reviendrait à scanner `node_modules` et `public/`, pour un
bruit considérable et aucun signal sur notre code.

**`p/ci` ne suffit pas.** Mesuré sur ce dépôt, le catalogue générique remonte **zéro** finding. Les
six findings actuels viennent tous de `.semgrep/temps-reel.yml`, dont trois règles génériques
temps réel et **une règle propre au projet**, `rt-route-salon-sans-controle-appartenance`, dérivée
de la ligne STRIDE #3 du threat model.

**Seuil `moderate` et non `high`.** Décision de contexte, justifiée en commentaire dans le
workflow : 15 dépendances directes pour 167 entrées de lock ici, contre 117 pour 1457 sur le fork
Juice Shop du bloc A. À cette échelle, le bruit d'un seuil `moderate` est quasi nul.

**gitleaks en `docker run` et non via l'action.** `gitleaks/gitleaks-action@v3` exige une licence
sur un compte d'**organisation**, ce qu'est `al5-esgi` : l'action s'arrête en 0 s sans rien
scanner. L'image officielle fait le même travail sans licence.

## Quoi faire quand un job casse

1. **Ne jamais commencer par désactiver la règle.** Ouvrir le fichier à la ligne signalée et
   trancher entre trois verdicts : vrai positif à corriger, vrai positif dont le risque est accepté
   et **justifié par écrit**, ou faux positif.
2. **Tracer toute exclusion dans le dépôt**, jamais dans une tête : `.gitleaksignore` pour les
   secrets, une entrée commentée et **datée** pour Semgrep. L'exclusion porte sur une empreinte
   précise, jamais sur la règle entière.
3. **Rattacher le finding au threat model.** S'il ne correspond à aucune ligne, c'est une
   information en soi : le threat model a un trou, il faut l'y ajouter.
4. **Consigner le verdict** dans `docs/security/rapport-audit.md` si le finding survit au triage.

## État actuel, assumé

Les jobs `sast` et `deps-scan` sont **rouges sur `main`**, et c'est voulu : les findings F-01 à
F-05 du rapport d'audit sont réels et non encore corrigés. Le plan de remédiation
(`docs/security/plan-remediation.md`) porte les actions datées. Un pipeline vert obtenu en
désactivant les règles serait un mensonge ; un pipeline rouge dont chaque alerte est documentée et
planifiée est un état de fait.
