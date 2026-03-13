"""
Récupérer les noms des accountManagers via le détail client
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/crm"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# Prendre 1 client par accountManagerId unique
r = requests.post(f"{BASE}/customers/search?limit=1837",
    auth=AUTH, headers=HEADERS,
    json={"accountManagerId": {"operator": "IS_NOT_NULL", "value": ""}})

customers = r.json()
manager_ids = list(set(c.get('accountManagerId') for c in customers if c.get('accountManagerId')))
print(f"{len(manager_ids)} managers uniques. Récupération des noms...\n")

# Pour chaque manager, prendre 1 client et faire un GET détail
managers = {}
for mid in sorted(manager_ids):
    # Trouver un client avec ce managerId
    cust = next(c for c in customers if c.get('accountManagerId') == mid)
    cust_id = cust['id']

    r2 = requests.get(f"{BASE}/customers/{cust_id}", auth=AUTH, headers={"Accept": "application/json"})
    if r2.status_code == 200:
        detail = r2.json()
        mname = detail.get('accountManager')
        count = sum(1 for c in customers if c.get('accountManagerId') == mid)
        managers[mid] = {'name': mname, 'clients': count}
        print(f"  {mid} → {mname or '(sans nom)'} ({count} clients)")

print(f"\n=== RÉSUMÉ : {len(managers)} commerciaux ===")
for mid, info in sorted(managers.items(), key=lambda x: (x[1]['name'] or '')):
    print(f"  {mid} | {info['name'] or '???'} | {info['clients']} clients")
