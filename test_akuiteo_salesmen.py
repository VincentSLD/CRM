"""
Test : voir les commerciaux rattachés aux clients Akuiteo
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/crm"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# Chercher des clients qui ont un commercial
print("Recherche de clients avec commercial...")
r = requests.post(f"{BASE}/customers/search?limit=50",
    auth=AUTH, headers=HEADERS,
    json={"code": {"operator": "LIKE", "value": "%"}})

if r.status_code == 200:
    customers = r.json()
    found = 0
    for cust in customers:
        salesman = cust.get('salesman')
        salesmanId = cust.get('salesmanId')
        salesmen = cust.get('salesmen')
        accountManager = cust.get('accountManager')
        accountManagerId = cust.get('accountManagerId')

        if salesman or salesmen or accountManager:
            found += 1
            print(f"\n--- Client: {cust.get('name')} (id:{cust.get('id')}) ---")
            print(f"  salesman: {salesman}")
            print(f"  salesmanId: {salesmanId}")
            print(f"  salesmen: {json.dumps(salesmen, indent=4, ensure_ascii=False) if salesmen else 'null'}")
            print(f"  accountManager: {accountManager}")
            print(f"  accountManagerId: {accountManagerId}")

            if found >= 10:
                break

    if found == 0:
        print("Aucun client avec commercial dans les 50 premiers.")
        print("\nEssayons avec plus de clients (200)...")
        r2 = requests.post(f"{BASE}/customers/search?limit=200",
            auth=AUTH, headers=HEADERS,
            json={"code": {"operator": "LIKE", "value": "C%"}})
        if r2.status_code == 200:
            customers2 = r2.json()
            for cust in customers2:
                if cust.get('salesman') or cust.get('salesmen') or cust.get('accountManager'):
                    found += 1
                    print(f"\n--- Client: {cust.get('name')} (id:{cust.get('id')}) ---")
                    print(f"  salesman: {cust.get('salesman')}")
                    print(f"  salesmanId: {cust.get('salesmanId')}")
                    print(f"  salesmen: {json.dumps(cust.get('salesmen'), indent=4, ensure_ascii=False)}")
                    print(f"  accountManager: {cust.get('accountManager')}")
                    print(f"  accountManagerId: {cust.get('accountManagerId')}")
                    if found >= 10:
                        break

    # Tester aussi la recherche par salesmanId
    print("\n\n=== Test recherche par salesmanId ===")
    for field in ['salesmanId', 'accountManagerId', 'salesman', 'accountManager']:
        body = {field: {"operator": "IS_NOT_NULL", "value": ""}}
        r3 = requests.post(f"{BASE}/customers/search?limit=5",
            auth=AUTH, headers=HEADERS, json=body)
        print(f"\n  {field} IS_NOT_NULL → {r3.status_code}")
        if r3.status_code == 200:
            data = r3.json()
            print(f"  {len(data)} résultat(s)")
            for c in data[:3]:
                print(f"    - {c.get('name')}: {field}={c.get(field)}, salesmanId={c.get('salesmanId')}")
        else:
            print(f"  {r3.text[:200]}")

else:
    print(f"Erreur: {r.status_code}")

print("\n\nDONE")
