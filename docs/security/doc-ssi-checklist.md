# Checklist - documentation SSI livrée avec le projet

> Cochée **contre le dépôt réel** le 2026-09-09, vérifiée avec
> `git ls-files docs/ .github/workflows/ .semgrep/`, et non de mémoire.
>
> Règle appliquée : un document manquant et **motivé** est une décision ; un document manquant et
> silencieux est une non-conformité.

Le dossier de sécurité d'un projet, tel qu'on le laisse à une équipe qui reprend le code :

- [x] **Contexte et biens essentiels** — section 1 de `docs/security/threat-model.md` : quatre
      biens essentiels (contenu des salons privés, identité des membres, intégrité de l'historique
      et du `seq`, disponibilité du canal), quatre événements redoutés avec leur gravité.
      *Pas de `contexte.md` séparé : la checklist admet explicitement l'une ou l'autre forme, et le
      regroupement évite deux sources de vérité pour les mêmes biens essentiels.*

- [x] **Threat model** — `docs/security/threat-model.md` : DFD Mermaid, **cinq** trust boundaries
      dont celle du canal ouvert avec ses trois questions répondues, tableau STRIDE de 13 lignes
      couvrant les 6 catégories, correspondance EBIOS pour les 5 lignes de priorité H.

- [x] **Pipeline de sécurité** — `docs/security/pipeline.md` : les trois jobs, leur outil, leur
      périmètre, leur seuil de blocage, **et la conduite à tenir quand un job casse**. Workflows :
      `.github/workflows/sast.yml` et `.github/workflows/supply-chain.yml`, règles dans
      `.semgrep/temps-reel.yml`.

- [x] **ADR sécurité** — `docs/adr/0005-criteres-priorisation.md` (critères de priorisation).
      *Réserve à connaître* : l'ADR de **correctif de conception** attendu par le programme a été
      produit en S5 sur le fork Juice Shop, pas sur ce dépôt. Aucune décision de conception
      corrective n'est donc tracée ici, parce qu'aucun correctif n'a encore été appliqué : les cinq
      findings sont ouverts. Un ADR sera produit avec le premier correctif structurant (F-01 ou
      F-03).
      *Note de numérotation* : `0001` à `0004` sont les ADR d'architecture temps réel du dépôt. Le
      TP demandait un `0002`, déjà pris ; le numéro libre suivant a été retenu plutôt qu'écraser un
      ADR existant.

- [x] **Rapport d'audit** — `docs/security/rapport-audit.md` : cinq findings issus de trois
      sources distinctes, chacun avec un CVSS 4.0 et son vecteur, un CWE, et une **preuve
      rejouable** versionnée dans `audit/` (deux scripts Node, un script shell). Classement
      priorisé divergeant de l'ordre CVSS sur deux rangs, avec la raison écrite.

- [x] **Plan de remédiation** — `docs/security/plan-remediation.md` : cinq lignes dérivées du
      classement d'audit, cinq lignes issues du registre des traitements, trois risques acceptés
      portant chacun un **nom** et une **date de revue**.

- [x] **Registre des traitements** — `docs/security/registre-traitements.md` : trois fiches
      (messages, présence et journalisation, émission des jetons), bases légales nommées,
      sous-traitants, et durées de conservation — y compris les deux qui sont **absentes**, écrites
      comme telles.

- [x] **Points de conformité ouverts** — section ci-dessous.

## Ce qui n'est pas coché, et pourquoi

Aucune case du gabarit n'est laissée vide, mais **trois réserves** doivent être lues avant de
considérer le dossier comme complet :

1. **Aucun finding n'est corrigé.** Le dossier documente cinq vulnérabilités, dont trois
   *Critical*, toutes ouvertes. Les jobs `sast` et `deps-scan` sont rouges sur `main`. Le dossier
   est complet ; le **système** ne l'est pas.
2. **Aucun ADR de correctif de conception sur ce dépôt** (voir la case ADR ci-dessus).
3. **Aucune politique de confidentialité.** Les personnes ne sont pas informées, et aucun
   mécanisme ne leur permet d'exercer leurs droits d'accès, de rectification et d'effacement.
   Ligne R-08 du plan de remédiation.

## Points de conformité ouverts

Issus des points d'attention du registre des traitements et du rapport d'audit.

| Domaine | Point ouvert | Ligne de plan |
|---|---|---|
| RGPD - durées de conservation | Deux traitements sur trois n'ont **aucune durée écrite** : les messages sont plafonnés en volume (200 par salon) et non en temps ; les journaux d'accès nginx, qui contiennent des adresses IP, n'ont ni rotation ni purge configurée | R-06, R-07 |
| RGPD - information des personnes | Aucune politique de confidentialité, aucun mécanisme d'exercice des droits (art. 13 et 15 à 17) | R-08 |
| RGPD - sous-traitance | Aucun sous-traitant à ce jour : la conformité est obtenue par l'absence d'externalisation, pas par une diligence. Le premier hébergement créera une relation de sous-traitance et l'obligation d'un contrat art. 28 | R-09 |
| RGPD - sécurité du traitement (art. 32) | Les messages des salons privés sont lisibles et modifiables **sans authentification** (F-01, F-02, F-03). C'est un manquement à l'obligation de sécurité, pas seulement un défaut technique | F-01 à F-03 |
| Traçabilité | Aucun journal d'audit des événements d'autorisation et d'émission. **Risque explicitement accepté**, avec nom et date de revue | plan, risques acceptés |
| NIS2 | **Hors périmètre** : projet académique, aucune des catégories d'entités essentielles ou importantes de l'annexe I ou II n'est applicable. À réexaminer uniquement en cas d'exploitation réelle dans un secteur régulé | sans objet |
| LPM art. 66 - canal de signalement | **Traité** : `SECURITY.md` à la racine, avec un contact et des délais de réponse annoncés | fait |
