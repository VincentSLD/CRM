"""
Trouver les bons champs de critères pour quotations, orders, invoices
en utilisant le YAML Swagger et en testant les champs
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/sales"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# 1. Chercher les schémas dans le YAML
print("=== Extraction des schémas depuis le YAML ===\n")
r = requests.get("https://docs.akuiteo.fr/api/5.0/swagger-sales.yaml")
yaml_text = r.text

for schema in ['QuotationCriteria', 'SalesOrderCriteria', 'InvoiceCriteria', 'DeliveryCriteria']:
    idx = yaml_text.find(f'    {schema}:')
    if idx >= 0:
        # Extraire ~2000 chars après le nom du schéma
        snippet = yaml_text[idx:idx+2000]
        # Couper au prochain schéma de même niveau
        lines = snippet.split('\n')
        result = []
        for i, line in enumerate(lines):
            if i > 0 and line.startswith('    ') and not line.startswith('      ') and ':' in line:
                break
            result.append(line)
        print(f"--- {schema} ---")
        print('\n'.join(result[:60]))
        print()

# 2. Tester les champs courants
print("\n=== Test des champs de recherche ===\n")
common_fields = [
    'reference', 'customerCode', 'customerId', 'customerName',
    'date', 'status', 'amount', 'label', 'number',
    'thirdPartyCode', 'thirdPartyId', 'thirdPartyName',
    'projectCode', 'projectId',
]

for endpoint, name in [
    ('/quotations/search?limit=3', 'DEVIS'),
    ('/orders/search?limit=3', 'COMMANDES'),
    ('/invoices/search?limit=3', 'FACTURES'),
]:
    print(f"\n--- {name} ---")
    for field in common_fields:
        body = {field: {"operator": "LIKE", "value": "%"}}
        try:
            r = requests.post(f"{BASE}{endpoint}", auth=AUTH, headers=HEADERS, json=body, timeout=10)
            if r.status_code == 200:
                data = r.json()
                count = len(data) if isinstance(data, list) else '?'
                print(f"  {field} LIKE % → 200 ({count} résultats)")
                if isinstance(data, list) and data:
                    print(f"    Champs: {list(data[0].keys())[:15]}")
                    print(f"    Premier: {json.dumps(data[0], ensure_ascii=False)[:300]}")
                break  # On a trouvé un champ qui marche
            elif r.status_code == 400:
                msg = r.json().get('message', '')[:80]
                if 'deserializing' in msg:
                    # Ce champ existe mais n'est pas un Clause
                    print(f"  {field} → existe mais pas un Clause ({msg[:60]})")
                # sinon c'est juste "pas de clause" = champ ignoré
        except:
            pass

print("\n\nDONE")
