"""
Test : récupérer les contacts d'un client Akuiteo
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/crm"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json"}

# D'abord, chercher quelques clients pour trouver un avec des contacts
print("Recherche de clients...")
r = requests.post(f"{BASE}/customers/search?limit=10",
    auth=AUTH, headers={**HEADERS, "Content-Type": "application/json"},
    json={"code": {"operator": "LIKE", "value": "%"}})

if r.status_code == 200:
    customers = r.json()
    print(f"{len(customers)} clients trouvés\n")

    for cust in customers[:10]:
        cid = cust['id']
        cname = cust.get('name', '?')
        print(f"--- Client {cid} : {cname} ---")

        # Récupérer les contacts
        rc = requests.get(f"{BASE}/customers/{cid}/contacts", auth=AUTH, headers=HEADERS)
        print(f"  GET /customers/{cid}/contacts → {rc.status_code}")
        if rc.status_code == 200:
            contacts = rc.json()
            if isinstance(contacts, list):
                print(f"  {len(contacts)} contact(s)")
                for contact in contacts[:3]:
                    print(f"  Contact: {json.dumps(contact, indent=4, ensure_ascii=False)[:800]}")
            else:
                print(f"  Response: {json.dumps(contacts, indent=2, ensure_ascii=False)[:500]}")
        else:
            print(f"  Response: {rc.text[:200]}")
        print()
else:
    print(f"Erreur recherche: {r.status_code} {r.text[:300]}")
