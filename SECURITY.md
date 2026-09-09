# Politique de signalement de vulnérabilité

## Signaler une faille

Si vous découvrez une vulnérabilité dans `messagio`, ouvrez une **security advisory** privée
depuis l'onglet *Security* du dépôt, ou contactez l'auteur via son profil GitHub
(<https://github.com/al5-esgi>).

**N'ouvrez pas d'issue publique** pour une vulnérabilité non corrigée.

## Engagement de délai

- **Accusé de réception** : sous 5 jours ouvrés.
- **Première analyse et qualification** : sous 15 jours ouvrés.
- **Information sur le correctif ou sur le refus de corriger**, avec sa raison : sous 30 jours.

## Périmètre

Le code de ce dépôt : le serveur temps réel (`src/`), les routes REST, la composition Docker.
Sont hors périmètre l'hébergement, les dépendances tierces (à signaler à leurs auteurs) et le
front de démonstration.

## Avertissement

`messagio` est un **projet académique** et n'est pas destiné à un usage en production. Des
vulnérabilités connues sont documentées, non corrigées à ce jour, dans
`docs/security/rapport-audit.md`, avec leur plan de remédiation.
