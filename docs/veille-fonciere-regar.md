# Cadrage — Veille foncière REGAR (études de sol G1, zones argile)

> Document de cadrage **technique + réglementaire**, préalable à tout développement.
> Objectif métier : aider l'activité **REGAR (GPH-R)** — études de sol G1 pour les
> propriétaires qui vendent un **terrain constructible** en zone d'aléa **moyen/fort**
> au retrait-gonflement des argiles (RGA) — à identifier des cibles et à prospecter.
>
> ⚠️ Les endpoints précis ci-dessous sont à **revérifier sur les swagger officiels au
> moment de l'implémentation** (les API publiques évoluent). Les URL de base et le
> principe sont confirmés (juin 2026).

---

## 1. Le levier réglementaire (= le marché de REGAR)

Depuis la **loi ELAN (art. 68)** et son décret d'application, en vigueur **au 1ᵉʳ octobre 2020** :
- le **vendeur** d'un **terrain non bâti constructible** situé en zone d'exposition
  **moyenne ou forte** au RGA doit fournir une **étude géotechnique préalable G1-PGC**
  (Principes Généraux de Construction, norme **NF P94-500**) ;
- l'obligation s'impose **aussi bien aux particuliers qu'aux professionnels** ;
- **validité 30 ans** si le sol n'est pas remanié ;
- le zonage de référence est celui publié par **Géorisques (BRGM)** ;
- à défaut, le vendeur s'expose à un manquement au devoir d'information / vice du consentement.

**Conséquence pour la veille** : la cible se définit par l'intersection de deux critères →
*(terrain constructible)* **ET** *(commune/parcelle en aléa argile moyen ou fort)*.

---

## 2. Sources de données

| Donnée visée | Source / API | Accès | Intérêt REGAR |
|---|---|---|---|
| **Aléa retrait-gonflement argiles** (faible/moyen/fort) | **Géorisques (BRGM)** | Ouvert, sans auth | Filtre n°1 : où l'obligation G1 s'applique |
| **Zonage d'urbanisme** (U / AU / A / N) | **API Carto – module GPU** (IGN) | Ouvert | Confirme le caractère *constructible* |
| **Parcelles cadastrales** (géométrie) | **API Carto – Cadastre** (IGN) | Ouvert | Géolocalisation / contour des terrains |
| **Ventes passées de terrains à bâtir** | **DVF** (Etalab/DGFiP) | Ouvert | Dimensionner le marché par commune (pas de prospection directe) |
| **Lotissements / permis d'aménager** | **Sitadel** (déjà intégré au CRM) | Ouvert | Signal : terrains en cours de division/vente |
| **Identité + coordonnées des propriétaires** | Fichiers fonciers (MAJIC) / cadastre DGFiP | **Restreint** | ⚠️ **Non réutilisable pour prospection** (voir §4) |

### 2.1 Géorisques — aléa RGA
- Base : `https://georisques.gouv.fr/api/v1/` — limite ~**1000 req/min/IP**, **sans authentification**.
- Endpoint RGA (à confirmer via `https://www.georisques.gouv.fr/doc-api`) :
  `GET /api/v1/rga?latlon=<lon>,<lat>` → renvoie `codeExposition` / `exposition`
  (ex. « Exposition moyenne »).
- Autres endpoints utiles : risques par adresse / `code_insee` (rayon, pagination).
- Doc : https://www.georisques.gouv.fr/doc-api · https://www.georisques.gouv.fr/api

### 2.2 API Carto GPU (IGN) — zonage PLU
- Base : `https://apicarto.ign.fr/api/gpu/`
- `GET /zone-urba?geom=<GeoJSON point/polygone>` → zones (`libelle`/`typezone` : U, AU, A, N…).
- Prescriptions/servitudes : `/prescription-surf|lin|pct`, `/info-surf|lin|pct`.
- Doc : https://www.data.gouv.fr/dataservices/api-carto-module-geoportail-de-lurbanisme-gpu

### 2.3 API Carto Cadastre (IGN)
- `GET https://apicarto.ign.fr/api/cadastre/parcelle?code_insee=...&section=...` (GeoJSON).

### 2.4 DVF — valeurs foncières (ventes passées)
- Portail : https://api.gouv.fr/les-api/api-donnees-foncieres
- Flux **ouverts** (DVF) : mutations par identifiant, géomutations (GeoJSON), indicateurs de
  prix/consommation foncière par maille territoriale ; filtrables par **commune** et par
  **nature de mutation** (dont *vente de terrain à bâtir*). Données des **5 dernières années**.
- Fichiers plats géolocalisés : https://files.data.gouv.fr/geo-dvf/ (jeu « DVF géolocalisées »).
- ⚠️ Les flux **DV3F / Fichiers fonciers** (parcelles, locaux **et propriétaires**) sont
  **réservés aux bénéficiaires publics** sous convention — voir §4.

### 2.5 Sitadel (déjà dans le CRM)
- Permis d'aménager / déclarations préalables → repérer les **lotissements** (terrains
  qui vont être commercialisés). Réutiliser l'intégration existante (`search_permis`).

---

## 3. Architecture proposée pour le CRM (sans le verrou propriétaires)

Idée : une **veille de ciblage**, pas un fichier de propriétaires. Pour un département/commune :
1. **Niveau d'aléa argile** (Géorisques) → ne garder que *moyen/fort*.
2. **Signaux d'opportunité** : lotissements / permis d'aménager récents (Sitadel) + volume
   DVF de terrains à bâtir (marché actif).
3. **Cibles à démarcher = les intermédiaires B2B** (légal, voir §4) présents sur ces communes,
   via l'API entreprises déjà intégrée (`search_entreprises_naf`) :
   - Notaires `6910Z`, agences immobilières `6831Z`, géomètres-experts `7112B`,
     lotisseurs/aménageurs, constructeurs de maisons individuelles (CMI), + mairies.
4. Boutons « créer prospect / CR / tâche » à partir de ces cibles.

Déclinaisons possibles (ordre de complexité croissant) :
- **Outil NOVA** « cibles REGAR (commune X) » : agrège §1-3 et renvoie une liste exploitable.
- **Page « Veille foncière »** cartographique : couche aléa argile + signaux Sitadel/DVF.
- **Indicateur DVF terrains à bâtir** par commune.

---

## 4. Verrou juridique : coordonnées des propriétaires ⚠️

**Constituer automatiquement une liste « terrain à vendre + coordonnées du propriétaire »
n'est pas réalisable légalement.** Points confirmés :

- **Cadastre / Fichiers fonciers (DGFiP, MAJIC)** : l'identité des propriétaires **n'est pas
  open data**. La communication ponctuelle au tiers est limitée à **1 à 3 parcelles** ; les
  demandes « tout un secteur » émanant de prospecteurs **ne doivent pas être satisfaites**
  (doctrine CADA). L'accès aux Fichiers fonciers (Cerema) est réservé à des **acteurs publics
  sous convention**, pour leur ressort de compétence et un **usage interne** — **pas de
  démarchage commercial**.
- **RGPD / CNIL** : réutiliser des données personnelles publiquement accessibles à des fins de
  **prospection commerciale** suppose que la personne s'y attende raisonnablement → en pratique
  **consentement requis** pour la prospection de particuliers.
- **Annonces** (Leboncoin, SeLoger, PAP…) : pas d'identité du vendeur exposée et **scraping
  interdit par les CGU**.

**Voie conforme** : prospecter les **intermédiaires** (notaires, agences, géomètres,
lotisseurs, CMI, mairies) — données **B2B publiques** — qui orientent ensuite les vendeurs
vers l'obligation G1. Approche **inbound/partenariale** plutôt que démarchage de particuliers.

Réf. CNIL : réutilisation de données publiques à des fins de démarchage
(https://www.cnil.fr/fr/la-reutilisation-des-donnees-publiquement-accessibles-en-ligne-des-fins-de-demarchage-commercial).

---

## 5. Prochaines étapes (proposées)

1. **Valider l'approche B2B-intermédiaires** comme cœur de la veille (faute d'accès légal aux propriétaires).
2. Revérifier les **endpoints exacts** Géorisques RGA + API Carto GPU sur les swagger officiels.
3. Prototype : **outil NOVA « cibles REGAR »** (réutilise `search_permis` + `search_entreprises_naf`, ajoute l'appel Géorisques RGA).
4. Si concluant : page cartographique « Veille foncière » (couche aléa argile + signaux).

---

## Sources
- Géorisques — doc API : https://www.georisques.gouv.fr/doc-api
- Géorisques — RGA (base de données) : https://www.georisques.gouv.fr/donnees/bases-de-donnees/retrait-gonflement-des-argiles
- API données foncières (DVF / DV3F) : https://api.gouv.fr/les-api/api-donnees-foncieres
- DVF géolocalisées (fichiers) : https://files.data.gouv.fr/geo-dvf/
- API Carto module GPU : https://www.data.gouv.fr/dataservices/api-carto-module-geoportail-de-lurbanisme-gpu
- Obligation G1 / loi ELAN (synthèse notaires) : https://chambre-gironde.notaires.fr/2020/12/18/vente-de-terrain-a-batir-letude-geotechnique-prealable/
- CADA — fiscalité locale et cadastre : https://www.cada.fr/administration/fiscalite-locale-et-cadastre
- CNIL — réutilisation de données publiques pour démarchage : https://www.cnil.fr/fr/la-reutilisation-des-donnees-publiquement-accessibles-en-ligne-des-fins-de-demarchage-commercial
