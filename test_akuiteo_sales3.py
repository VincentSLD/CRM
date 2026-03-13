"""
Test : trouver le bon format pour chercher devis/commandes/factures par client
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/sales"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# On sait que customerId LIKE % fonctionne. Testons avec un vrai ID client
# ID client connu: 500000034 (SA ARNAUDEAU, 4 contacts)
TEST_IDS = ['500000034', '500013020', '500000035']

for endpoint, name in [
    ('/quotations/search?limit=5', 'DEVIS'),
    ('/orders/search?limit=5', 'COMMANDES'),
    ('/invoices/search?limit=5', 'FACTURES'),
]:
    print(f"\n{'='*60}")
    print(f"{name}")

    # Test 1: LIKE % (tous)
    body = {"customerId": {"operator": "LIKE", "value": "%"}}
    r = requests.post(f"{BASE}{endpoint}", auth=AUTH, headers=HEADERS, json=body)
    print(f"  customerId LIKE % → {r.status_code} ({len(r.json()) if r.status_code==200 else 0} résultats)")
    if r.status_code == 200:
        data = r.json()
        if data:
            item = data[0]
            print(f"  Champs: {list(item.keys())}")
            # Chercher les champs montant/date
            for key in ['totalExclTax', 'amountExclTax', 'amount', 'totalAmount',
                        'date', 'creationDate', 'issueDate', 'documentDate',
                        'state', 'status', 'name', 'label', 'number',
                        'customerId', 'customerName', 'customer', 'thirdPartyName']:
                if key in item:
                    print(f"    {key}: {item[key]}")

    # Test 2: IS avec un vrai ID
    for cid in TEST_IDS:
        body = {"customerId": {"operator": "IS", "value": cid}}
        r = requests.post(f"{BASE}{endpoint}", auth=AUTH, headers=HEADERS, json=body)
        if r.status_code == 200 and r.json():
            print(f"  customerId IS {cid} → {len(r.json())} résultat(s)")
            break
        elif r.status_code != 200:
            print(f"  customerId IS {cid} → {r.status_code}: {r.text[:150]}")
            break

print(f"\n{'='*60}")
print("DONE")
