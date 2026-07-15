# Demande à l'intégrateur / admin Akuiteo — génération du compte auxiliaire (Code SITE / SCLI…) en temps réel

## Contexte
Notre CRM crée des tiers (clients/prospects) dans Akuiteo via l'API REST v5.0 :
- Création du tiers : `PUT /crm/customers`
- Lecture des établissements : `GET /crm/customers/{id}/sites`

Nous avons besoin de récupérer, **dès la création**, le **code du site / compte auxiliaire** de l'établissement principal — champ `siteCode` (= `code`) du site, au format **`SCLI……`**. C'est la référence qui apparaît sur les devis, commandes et factures.

## Problème constaté
À la création du tiers via l'API, le site principal est bien créé mais son **`siteCode` reste `null`**. Le code `SCLI…` n'apparaît que **plus tard** — visiblement lors d'un **traitement par lot** (génération des comptes auxiliaires), sans doute nocturne.

Preuves (instance de test, relevé du 15/07/2026), sur des tiers créés par le CRM (code `CLI-…`) :
- **Frontière nette par ordre de création** : tous les tiers d'`id ≤ 500018641` ont leur `SCLI…`, tous ceux d'`id ≥ 500018643` ont `siteCode = null`. → typique d'un lot planifié, pas d'une génération à la création.
- Exemple concret : tiers **PASCALE MINIER**, `id = 500018691`, code `CLI-6658` ; site principal `id = 500020991` → `siteCode = null` (toujours `null` plusieurs heures après la création).
- Le format du code tiers n'y change rien (les `CLI-…` finissent aussi par recevoir leur `SCLI…`).

## Ce qu'on demande
Pouvoir disposer du compte auxiliaire (`SCLI…`) **immédiatement** après la création du tiers par l'API. Deux pistes possibles de votre côté :

1. **Activer la génération en temps réel du compte auxiliaire** à la création d'un tiers / d'un site (paramètre comptable Akuiteo), pour que le `SCLI…` soit attribué immédiatement.
2. À défaut, **planifier la tâche « génération des comptes auxiliaires » beaucoup plus fréquemment** (ex. toutes les 5 à 15 minutes au lieu d'une fois par nuit).

## Questions techniques
1. Comment/quand est déclenchée l'attribution du numéro de compte auxiliaire `SCLI…` d'un tiers/site ?
2. Cette génération peut-elle être configurée **en temps réel** (à la création) ? Si oui, comment l'activer ?
3. Quelle est la **fréquence actuelle** de la tâche planifiée qui les génère ? Peut-on l'augmenter ?
4. Existe-t-il un **moyen de la déclencher à la demande** (API, tâche manuelle) pour un tiers donné juste après sa création ?

Merci d'avance — nous pouvons fournir tout complément (identifiants de tiers de test, traces d'appels API).
