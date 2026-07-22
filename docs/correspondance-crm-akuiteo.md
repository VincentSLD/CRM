# Correspondance des données CRM ↔ Akuiteo — Clients / Prospects

## Client / Prospect — Champs principaux

| Champ CRM (Supabase) | Champ Akuiteo | Direction | Notes |
|---|---|---|---|
| `name` | `name` | ↔ | Fallback vers raison_sociale |
| `code` | `code` | ↔ | Max 10 caractères |
| `raison_sociale` | `legalName` | ↔ | |
| `raison_sociale2` | `legalName2` | ↔ | |
| `siren` | `SIREN` | ↔ | |
| `siret` | `SIRET` | ↔ | |
| `ape` | `APE` | ↔ | |
| `forme_juridique` | `legalForm` | ↔ | |
| `reference_externe` | `externalReference` | ↔ | |
| `langue` | `languageCode` | ↔ | |
| `chiffre_affaires` | `revenue` | ↔ | |
| `capital` | `equity` | ↔ | |
| `effectif` | `headcount` | ↔ | |
| `notes` | `notes` | ↔ | |
| `account_manager_id` | `accountManagerId` | ↔ | |
| `account_manager_name` | *(résolu via API employees)* | ← | Pull only |
| `salesman_id` | `salesmanId` | → | Push only |
| `commerciaux_associes` | *(résolu via option SALESMEN)* | ← | Pull only |

## Adresse

| Champ CRM | Champ Akuiteo | Direction | Notes |
|---|---|---|---|
| `adresse_ligne1` | `address.line1` | ↔ | |
| `adresse_ligne2` | `address.line2` | ↔ | |
| `adresse_ligne3` | `address.line3` | ↔ | |
| `code_postal` | `address.postalCode` | ↔ | |
| `city` | `address.city` | ↔ | |
| `pays` | `address.country` | ↔ | Auto 'FR' si vide |
| `phone` | `address.phone` | ↔ | |
| `telephone2` | `address.phone2` | ↔ | |
| `mobile` | `address.mobilePhone` | ↔ | |
| `fax` | `address.fax` | ↔ | |
| `email` | `address.email` | ↔ | |
| `site_web` | `address.webSite` | ↔ | |
| `departement` | `address.geographicalDepartmentName` | ← | Pull only |
| `region` | `address.regionName` | ← | Pull only |

## Classification / Marketing

| Champ CRM | Champ Akuiteo | Direction | Notes |
|---|---|---|---|
| `mk_categorie_id` / `mk_categorie` | `categoryId` | ↔ | Nom résolu via API |
| `mk_sous_categorie_id` / `mk_sous_categorie` | `subCategoryId` | ↔ | |
| `mk_categorie_pro_id` / `mk_categorie_pro` | `professionalCategoryId` | ↔ | |
| `mk_secteur_id` / `mk_secteur` | `sectorId` | ↔ | |
| `mk_type_id` / `mk_type` | `thirdPartyLinkTypeId` | ↔ | |
| `mode_tarification` | `firstPricingMethodId` | ↔ | |
| `mode_tarification_2` | `secondPricingMethodId` | ← | Pull only |
| `mk_groupe` | `level1grouping` | ↔ | |
| `mk_origine` | `level2grouping` | ↔ | |

## Champs Pull only (Akuiteo → CRM)

| Champ CRM | Champ Akuiteo | Notes |
|---|---|---|
| `tva_intracommunautaire` | `vatIdentificationNumber` | |
| `mots_cles` | `keywords` | |
| `code_societe` | `companyCode` | |
| `statut_akuiteo` | `status` | |
| `custom_data` | *(via /read CUSTOM_DATA)* | |
| `condition_paiement` | `conditionOfPayment` | |
| `mode_paiement` | `methodOfPayment` | |
| `mode_tarification_name` | *(résolu via API pricing-methods)* | Nom + code |
| `mode_tarification_2_name` | *(résolu via API pricing-methods)* | Nom + code |

## Contacts

| Champ CRM | Champ Akuiteo | Direction | Notes |
|---|---|---|---|
| `nom` | `name` | → | |
| `prenom` | `firstName` | → | |
| `titre` | `title` | → | |
| `email` | `email` | → | |
| `telephone` | `sitesRelatedInformation[].phone` | → | |
| `mobile` | `sitesRelatedInformation[].mobilePhone` | → | |
| `email2` ou `email` | `sitesRelatedInformation[].email` | → | |
| `fonction` | `sitesRelatedInformation[].position` | → | |
| `service` | `sitesRelatedInformation[].service` | → | |
| `commentaire` | `sitesRelatedInformation[].notes` | → | |

## Sites (Établissements secondaires)

| Champ CRM | Champ Akuiteo | Direction | Notes |
|---|---|---|---|
| *(construit: ville + siret)* | `name` | → | Max 50 car. |
| `siret` | `SIRET` | → | |
| `adresse_ligne1` | `address.line1` | → | Max 38 car. |
| `code_postal` | `address.postalCode` | → | Max 10 car. |
| `city` | `address.city` | → | Max 38 car. |
| *(hardcodé)* | `address.country` | → | Toujours 'FR' |
| `date_fermeture` (si `etat_insee='C'`) | `validUntil` | → | Date ISO |

## Champs Akuiteo en lecture seule (supprimés avant update)

- `changeTracking` — Suivi des modifications (système)
- `indicators` — Indicateurs calculés
- `closure` — Informations de clôture
- `open` — Statut ouvert/fermé (calculé)
- `lastTracking` — Dernier suivi
- `formConfig` — Configuration formulaire
- `bankingInformations` — Infos bancaires (API séparée)
- `exclusionCodes` — Codes d'exclusion
- `accountingPeriod` — Période comptable
- `sites` — Géré via endpoint `/sites`

## Endpoints API Akuiteo

| Opération | Méthode | Endpoint |
|---|---|---|
| Lire un client | GET | `/crm/customers/{id}` |
| Créer un client | PUT | `/crm/customers` |
| Mettre à jour un client | POST | `/crm/customers/{id}` |
| Lire données custom | POST | `/crm/customers/{id}/read` |
| Lister les sites | GET | `/crm/customers/{id}/sites` |
| Créer un site | PUT | `/crm/customers/{id}/sites` |
| Mettre à jour un site | POST | `/crm/customers/{id}/sites/{siteId}` |
| Lister les contacts | GET | `/crm/customers/{id}/contacts` |
| Créer un contact | PUT | `/crm/customers/{id}/contacts/` |
| Mettre à jour un contact | POST | `/crm/customers/{id}/contacts/{contactId}` |
| Détails contact | GET | `/crm/customers/{id}/contacts/{contactId}` |
| Employé (manager) | GET | `/workforce/employees/{employeeId}` |
| Catégories | POST | `/settings/categories/search` |
| Sous-catégories | POST | `/settings/sub-categories/search` |
| Catégories pro | POST | `/settings/professional-categories/search` |
| Secteurs | POST | `/settings/sectors/search` |
| Types tiers | POST | `/settings/third-party-link-types/search` |
| Modes tarification | POST | `/settings/pricing-methods/search` |

## Légende

- **↔** : Synchronisation bidirectionnelle (push et pull)
- **→** : Push only (CRM vers Akuiteo)
- **←** : Pull only (Akuiteo vers CRM)
