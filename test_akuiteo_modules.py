"""
Chercher les autres modules API Akuiteo (commandes, devis, factures)
"""
import requests

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json"}

# Tester les modules connus d'Akuiteo
modules = [
    'crm', 'sales', 'purchasing', 'accounting', 'billing', 'invoicing',
    'project', 'projects', 'production', 'stock', 'inventory',
    'order', 'orders', 'quote', 'quotes', 'proposal', 'proposals',
    'invoice', 'invoices', 'delivery', 'timesheet', 'expense',
    'core', 'common', 'referential', 'ref', 'admin', 'hr', 'rh',
    'document', 'documents', 'reporting', 'analytics', 'api',
    'commercial', 'finance', 'treasury', 'management',
    'v1', 'v2', 'v3', 'v4', 'v5',
]

print("=== Recherche des modules API Akuiteo ===\n")
found = []
for mod in modules:
    try:
        # Essayer un GET simple
        r = requests.get(f"{BASE}/{mod}/", auth=AUTH, headers=HEADERS, timeout=5, allow_redirects=False)
        if r.status_code not in [404, 301, 302]:
            found.append(mod)
            print(f"  /{mod}/ → {r.status_code} ({len(r.content)} bytes)")
            if r.status_code == 200 and r.content:
                print(f"    {r.text[:200]}")
    except Exception as e:
        pass

# Aussi tester la doc Swagger pour d'autres modules
print("\n=== Documentation Swagger disponible ===\n")
for mod in ['crm', 'sales', 'purchasing', 'project', 'billing', 'core', 'hr', 'timesheet', 'expense', 'document', 'commercial', 'accounting']:
    try:
        r = requests.get(f"https://docs.akuiteo.fr/api/5.0/swagger-{mod}.yaml", timeout=5)
        if r.status_code == 200:
            # Compter les endpoints
            paths = r.text.count('  /')
            print(f"  swagger-{mod}.yaml → {r.status_code} ({paths} paths, {len(r.content)} bytes)")
    except:
        pass

print(f"\n=== Modules trouvés : {found} ===")
print("\nDONE")
