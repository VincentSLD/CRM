# Scripts de synchronisation Akuiteo → CRM

## Scripts disponibles

| Script | Description | Durée estimée |
|--------|-------------|---------------|
| `sync-clients.js` | Sociétés/clients depuis Akuiteo | ~1-2 min |
| `sync-contacts.js` | Contacts de chaque client | ~3-5 min |
| `sync-documents.js` | Devis, commandes, factures | ~2-3 min |
| `sync-marches.js` | Construction marchés & affaires | ~3-5 min |
| `sync-collaborateurs.js` | Collaborateurs/employés | ~30 sec |
| `sync-all.js` | Exécute tout dans l'ordre | ~10-15 min |

## Utilisation

```bash
# Un script individuel
node sync/sync-clients.js

# Tout synchroniser
node sync/sync-all.js
```

## Variables d'environnement (optionnelles)

Les valeurs par défaut sont configurées dans `config.js`. Pour surcharger :

```
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=eyJ...
AKUITEO_URL=https://novamingenierie-test.myakuiteo.com/akuiteo/rest
AKUITEO_USER=API1
AKUITEO_PASS=API1
```

## Tâches planifiées Windows

Ouvrir le Planificateur de tâches Windows et créer une tâche :

- **Programme** : `node`
- **Arguments** : `C:\PROJETS\05_CRM\sync\sync-all.js`
- **Démarrer dans** : `C:\PROJETS\05_CRM`
- **Déclencheur** : selon vos besoins (ex: tous les jours à 6h)

Ou via la ligne de commande :
```cmd
schtasks /create /tn "CRM Sync Akuiteo" /tr "node C:\PROJETS\05_CRM\sync\sync-all.js" /sc daily /st 06:00
```

## Ordre d'exécution recommandé

1. **Clients** en premier (les autres dépendent des clients)
2. **Contacts** (dépend des clients)
3. **Documents** (devis/commandes/factures, dépend des clients)
4. **Marchés** (dépend des documents)
5. **Collaborateurs** (indépendant)
