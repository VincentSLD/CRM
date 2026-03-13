"""
Chercher les noms des employés via d'autres modules API Akuiteo
"""
import requests
import json

BASE_ROOT = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# Tester différents modules API
modules = ['core', 'rh', 'hr', 'admin', 'common', 'ref', 'referential', 'project', 'time']
endpoints = ['employees', 'collaborators', 'users', 'resources', 'persons', 'salesmen', 'staff']

print("=== Recherche des endpoints employés ===\n")
for mod in modules:
    for ep in endpoints:
        url = f"{BASE_ROOT}/{mod}/{ep}"
        try:
            r = requests.get(url, auth=AUTH, headers=HEADERS, timeout=5)
            if r.status_code != 404:
                print(f"  {mod}/{ep} → {r.status_code} ({len(r.content)} bytes)")
                if r.status_code == 200:
                    try:
                        data = r.json()
                        if isinstance(data, list) and len(data) > 0:
                            print(f"    {len(data)} items. Premier: {json.dumps(data[0], ensure_ascii=False)[:300]}")
                        elif isinstance(data, dict):
                            print(f"    {json.dumps(data, ensure_ascii=False)[:300]}")
                    except:
                        print(f"    {r.text[:200]}")
        except:
            pass

# Aussi essayer POST search pour les collaborateurs
print("\n=== Recherche via POST search ===\n")
for mod in modules:
    for ep in ['employees', 'collaborators', 'resources']:
        url = f"{BASE_ROOT}/{mod}/{ep}/search"
        try:
            r = requests.post(url, auth=AUTH, headers=HEADERS,
                json={"code": {"operator": "LIKE", "value": "%"}}, timeout=5)
            if r.status_code != 404:
                print(f"  POST {mod}/{ep}/search → {r.status_code}")
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, list):
                        print(f"    {len(data)} items")
                        for item in data[:3]:
                            print(f"    {json.dumps(item, ensure_ascii=False)[:300]}")
        except:
            pass

# Essayer de récupérer un employé par son ID directement
print("\n=== GET employé par ID ===\n")
test_ids = ['500000075', '500000062', '500000115']  # Les plus gros portefeuilles
for eid in test_ids:
    for mod in ['core', 'rh', 'hr', 'crm']:
        for ep in ['employees', 'collaborators', 'resources', 'contacts']:
            url = f"{BASE_ROOT}/{mod}/{ep}/{eid}"
            try:
                r = requests.get(url, auth=AUTH, headers=HEADERS, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    name = data.get('name', data.get('firstName', data.get('lastName', '?')))
                    print(f"  {mod}/{ep}/{eid} → 200 : {json.dumps(data, ensure_ascii=False)[:400]}")
            except:
                pass

print("\n\nDONE")
