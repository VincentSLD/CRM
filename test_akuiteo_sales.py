"""
Test : accès au module Sales (devis, commandes, factures)
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/sales"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# Le format Clause est le même : {"field": {"operator": "LIKE", "value": "%"}}

for endpoint, name in [
    ('/quotations/search?limit=3', 'DEVIS (quotations)'),
    ('/orders/search?limit=3', 'COMMANDES (orders)'),
    ('/invoices/search?limit=3', 'FACTURES (invoices)'),
    ('/deliveries/search?limit=3', 'LIVRAISONS (deliveries)'),
]:
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"  POST {BASE}{endpoint}")

    # Essayer avec un critère large
    for body in [
        {"code": {"operator": "LIKE", "value": "%"}},
        {},
    ]:
        try:
            r = requests.post(f"{BASE}{endpoint}", auth=AUTH, headers=HEADERS, json=body, timeout=15)
            print(f"  Body: {json.dumps(body)} → Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    print(f"  {len(data)} résultat(s)")
                    if data:
                        print(f"  Champs: {list(data[0].keys())}")
                        print(f"  Premier: {json.dumps(data[0], indent=2, ensure_ascii=False)[:600]}")
                else:
                    print(f"  {json.dumps(data, ensure_ascii=False)[:400]}")
                break  # Si ça marche, pas besoin du 2e body
            elif r.status_code == 400:
                print(f"  {r.text[:200]}")
            else:
                print(f"  {r.text[:200]}")
        except Exception as e:
            print(f"  Erreur: {e}")

print(f"\n{'='*60}")
print("DONE")
