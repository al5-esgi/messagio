# Registre des traitements de données personnelles - messagio

> Inspiré du modèle CNIL simplifié. Établi le 2026-09-09 sur le commit `43061a8`.

## Responsable de traitement

- **Organisme** : Alex, projet académique `messagio` (Master ESGI AL5)
- **Contact** : voir `SECURITY.md` à la racine du dépôt
- **DPO désigné** : non applicable à ce stade. Aucun des trois critères de désignation
  obligatoire de l'article 37 du RGPD n'est rempli : ni autorité publique, ni suivi
  systématique à grande échelle, ni traitement à grande échelle de données sensibles.
  **À réexaminer si le service est exploité au-delà du cadre académique.**

## Préalable : le service traite bien des données personnelles

Le point mérite d'être écrit, parce qu'il est souvent écarté à tort sur un projet d'école. Les
pseudonymes (`alice`, `bob`) sont des **données personnelles** au sens de l'article 4.1 du RGPD :
un pseudonyme stable rattaché à des messages, à des horaires de connexion et à une adresse IP rend
la personne **identifiable indirectement**. La pseudonymisation réduit le risque, elle ne fait pas
sortir la donnée du champ du règlement.

## Traitements

### T-01 - Échange de messages dans les salons de discussion

| Rubrique | Contenu |
|---|---|
| Finalité(s) | permettre à des personnes identifiées par un pseudonyme d'échanger des messages, en direct et en différé, dans des salons publics ou privés |
| Base légale | **exécution du contrat** (art. 6.1.b) : la conservation et la diffusion des messages sont l'objet même du service. Le consentement serait inapproprié, il supposerait un refus possible sans perte du service |
| Catégories de personnes concernées | membres inscrits au seed (`alice`, `bob`, …) et toute personne obtenant un jeton |
| Catégories de données | pseudonyme de l'auteur (`Message.auteur`), contenu libre du message (`Message.texte`), horodatage (`Message.at`), numéro de séquence, identifiant de salon. Le contenu est **libre** : il peut contenir tout ce qu'une personne choisit d'y écrire |
| Données sensibles | aucune collectée intentionnellement. **Risque résiduel** : un champ de texte libre peut recevoir des données de santé, d'opinion ou d'appartenance syndicale (art. 9). Le service ne les sollicite pas et ne peut pas les empêcher |
| Destinataires | les membres du salon concerné. Pour un salon privé, la liste `Salon.membres` |
| Sous-traitants | **aucun à ce jour** : le service s'exécute en local ou dans une composition Docker sur la machine de l'auteur. Redis (`redis:7-alpine`) est un composant auto-hébergé de la composition, pas un tiers. **Dès qu'un hébergeur sera choisi, un contrat art. 28 sera requis** |
| Transferts hors UE | non |
| Durée de conservation | **aucune durée définie.** La conservation est plafonnée en **volume** et non en temps : `MAX_HISTORIQUE = 200` messages par salon (`src/domain.ts:25`), au-delà le plus ancien est supprimé (`domain.ts:45`). Le stockage étant en mémoire (`Map`, `src/store.ts:13`), tout disparaît au redémarrage. **Un plafond de volume n'est pas une durée de conservation** : un salon peu actif garde ses messages indéfiniment tant que le processus vit. Ligne de plan de remédiation |
| Mesures de sécurité | autorisation par salon sur le canal temps réel (`peutRejoindre`), jeton vérifié au handshake. **Insuffisantes en l'état** : F-01, F-02 et F-03 du rapport d'audit établissent que ces messages sont lisibles et modifiables sans authentification |

### T-02 - Présence et journalisation technique du canal temps réel

| Rubrique | Contenu |
|---|---|
| Finalité(s) | afficher qui est présent dans un salon et qui est en train d'écrire ; diagnostiquer les incidents de connexion ; observer la charge du service |
| Base légale | **intérêt légitime** (art. 6.1.f) : continuité et sécurité du service pour la journalisation ; **exécution du contrat** pour l'affichage de présence, qui est une fonctionnalité attendue d'un chat |
| Catégories de personnes concernées | toute personne ouvrant une connexion, y compris sans compte — la route d'émission de jeton n'authentifie personne |
| Catégories de données | pseudonyme (`DonneesPresence.membre`), horodatage de saisie (`saisitJusqua`), identifiant de socket, identifiant d'instance (`INSTANCE`), compteurs agrégés exposés par `/metrics`. **Adresse IP** : traitée par le proxy `nginx` du `docker-compose.yml`, qui journalise chaque requête, et utilisée par la directive `ip_hash` pour l'affinité de session |
| Données sensibles | aucune. Attention toutefois : « qui est en ligne, depuis quand et avec qui » est une **donnée de comportement**, plus intrusive que son apparence technique |
| Destinataires | les membres du salon pour la présence ; l'auteur du projet pour les journaux et `/metrics` |
| Sous-traitants | aucun. Aucun collecteur d'erreurs externe : les greps sur `sentry`, `axios`, `fetch(` ne remontent **aucune** occurrence dans `src/` |
| Transferts hors UE | non |
| Durée de conservation | **présence** : volatile, détruite à la déconnexion, avec un délai de grâce (`DepartsDifferes`). **Journaux nginx** : aucune durée définie, aucune purge configurée, rotation par défaut de l'image. **Ligne de plan de remédiation** |
| Mesures de sécurité | présence non persistée sur disque. **Faiblesse identifiée** : `/metrics` et `/instance` sont servis sans authentification (finding de revue, S8), et les instances sont exposées en direct sur les ports 3001 et 3002, ce qui court-circuite le proxy |

### T-03 - Émission des jetons d'accès

| Rubrique | Contenu |
|---|---|
| Finalité(s) | délivrer un jeton permettant d'ouvrir le canal temps réel |
| Base légale | exécution du contrat (art. 6.1.b) |
| Catégories de personnes concernées | toute personne appelant `GET /api/dev-token` |
| Catégories de données | pseudonyme fourni par l'appelant (`sub`), horodatages d'émission et d'expiration |
| Données sensibles | aucune |
| Destinataires | l'appelant lui-même |
| Sous-traitants | aucun |
| Transferts hors UE | non |
| Durée de conservation | le jeton vit 4 h (`expiresIn: "4h"`, `src/rest.ts:59`) et n'est **stocké nulle part** côté serveur. Conséquence directe : **aucune révocation n'est possible** avant expiration |
| Mesures de sécurité | **aucune digne de ce nom.** Le jeton est délivré sans authentification à quiconque le demande, avec l'identité demandée (F-02), et signé avec un secret publié dans le dépôt (F-01). Ce traitement est le point faible de tout l'édifice |

## Points d'attention identifiés

**Minimisation.** Le service est sobre : il ne collecte ni adresse e-mail, ni mot de passe, ni
profil. Une seule donnée est collectée sans être exploitée — l'`INSTANCE` renvoyée par
`GET /instance`, utile au diagnostic mais servie publiquement sans raison. Rien à retirer du côté
des personnes, quelque chose à cesser d'exposer.

**Durées.** **Deux traitements sur trois n'ont aucune durée de conservation écrite** : T-01 (plafond
de volume, pas de durée) et les journaux de T-02 (aucune purge configurée). C'est le manquement le
plus net du registre, et il alimente deux lignes du plan de remédiation.

**Sous-traitance.** Aucun sous-traitant aujourd'hui, donc aucune clause art. 28 manquante — la
conformité est ici obtenue par l'absence d'externalisation, pas par une diligence. **Le premier
déploiement chez un hébergeur créera une relation de sous-traitance** et l'obligation contractuelle
correspondante. À traiter avant, pas après.

**Information des personnes.** **Il n'existe aucune politique de confidentialité**, même minimale.
Les personnes ne sont informées ni des données collectées, ni de la durée de conservation, ni de
leurs droits d'accès, de rectification et d'effacement — droits qu'aucun mécanisme du service ne
permet d'ailleurs d'exercer aujourd'hui. C'est un manquement aux articles 13 et 15 à 17, et il
alimente une ligne du plan de remédiation.

Ces quatre points alimentent le plan de remédiation au même titre que les findings techniques du
rapport d'audit.
