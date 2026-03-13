"""
Test : lister les responsables commerciaux (accountManager) uniques
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/crm"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# Récupérer des clients avec accountManagerId pour lister les managers uniques
print("Récupération des clients avec accountManager...")
r = requests.post(f"{BASE}/customers/search?limit=500",
    auth=AUTH, headers=HEADERS,
    json={"accountManagerId": {"operator": "IS_NOT_NULL", "value": ""}})

if r.status_code == 200:
    customers = r.json()
    print(f"{len(customers)} clients avec accountManager\n")

    # Collecter les managers uniques
    managers = {}
    for c in customers:
        mid = c.get('accountManagerId')
        mname = c.get('accountManager')
        if mid and mid not in managers:
            managers[mid] = mname

    print(f"=== {len(managers)} responsables commerciaux uniques ===")
    for mid, mname in sorted(managers.items(), key=lambda x: x[1] or ''):
        # Compter les clients par manager
        count = sum(1 for c in customers if c.get('accountManagerId') == mid)
        print(f"  ID: {mid} | Nom: {mname} | Clients: {count}")

# Tester aussi s'il y a un endpoint employees ou salesmen
print("\n\n=== Test endpoints employés ===")
for path in ['/employees', '/salesmen', '/users', '/collaborators', '/resources']:
    try:
        r = requests.get(f"{BASE}{path}", auth=AUTH, headers=HEADERS)
        print(f"  GET {path} → {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                print(f"    {len(data)} résultat(s)")
                for item in data[:3]:
                    print(f"    {json.dumps(item, ensure_ascii=False)[:200]}")
    except Exception as e:
        print(f"  GET {path} → Error: {e}")

print("\n\nDONE")
