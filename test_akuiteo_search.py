"""
Test script to find the correct CustomerCriteria format for Akuiteo API
Run: python test_akuiteo_search.py
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/crm"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# --- Test 1: GET customers list (maybe it works without search?) ---
print("=" * 60)
print("TEST 1: GET /customers (list without search)")
try:
    r = requests.get(f"{BASE}/customers", auth=AUTH, headers=HEADERS)
    print(f"  Status: {r.status_code}")
    print(f"  Response: {r.text[:500]}")
except Exception as e:
    print(f"  Error: {e}")

# --- Test 2: GET customers with query params ---
print("\nTEST 2: GET /customers?limit=5")
try:
    r = requests.get(f"{BASE}/customers", auth=AUTH, headers=HEADERS, params={"limit": 5})
    print(f"  Status: {r.status_code}")
    print(f"  Response: {r.text[:500]}")
except Exception as e:
    print(f"  Error: {e}")

# --- Test 3: GET known customer to see structure ---
print("\nTEST 3: GET /customers/500013020 (known customer)")
try:
    r = requests.get(f"{BASE}/customers/500013020", auth=AUTH, headers=HEADERS)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"  Fields: {list(data.keys())}")
        print(f"  Full response: {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
except Exception as e:
    print(f"  Error: {e}")

# --- Test 4-N: POST /customers/search with various formats ---
search_tests = [
    # Format A: Simple field criteria
    {"code": "500013020"},
    {"code": "%"},
    {"name": "%"},

    # Format B: With clauses array
    {"clauses": [{"field": "code", "operator": "like", "value": "%"}]},
    {"clauses": [{"field": "code", "operator": "LIKE", "value": "%"}]},

    # Format C: With criteria array
    {"criteria": [{"field": "code", "operator": "like", "value": "%"}]},
    {"criteria": [{"field": "code", "value": "%"}]},

    # Format D: criterionList (Akuiteo style)
    {"criterionList": [{"field": "code", "operator": "like", "value": "%"}]},
    {"criterionList": [{"fieldName": "code", "operator": "like", "value": "%"}]},

    # Format E: searchCriterion
    {"searchCriterion": [{"field": "code", "operator": "like", "value": "%"}]},

    # Format F: restriction style
    {"restrictions": [{"field": "code", "operator": "like", "value": "%"}]},

    # Format G: filter style
    {"filters": [{"field": "code", "operator": "like", "value": "%"}]},
    {"filter": {"code": "%"}},

    # Format H: query style
    {"query": "%"},
    {"q": "%"},
    {"search": "%"},

    # Format I: Akuiteo specific - maybe "customerCode"?
    {"customerCode": "500013020"},
    {"customerCode": "%"},
    {"customerName": "%"},

    # Format J: with "where" clause
    {"where": "code like '%'"},
    {"where": [{"code": {"like": "%"}}]},

    # Format K: Nested object with type
    {"type": "CUSTOMER", "clauses": [{"field": "code", "operator": "like", "value": "%"}]},

    # Format L: Maybe the clause IS the criteria (single object, not array)
    {"field": "code", "operator": "like", "value": "%"},
    {"field": "code", "operator": "LIKE", "value": "%"},

    # Format M: Maybe it needs a specific root element
    {"customerCriteria": {"code": "%"}},
    {"searchCriteria": {"code": "%"}},

    # Format N: Using "expression" or "condition"
    {"expression": "code like '%'"},
    {"conditions": [{"field": "code", "operator": "like", "value": "%"}]},

    # Format O: Akuiteo French style
    {"criteres": [{"champ": "code", "operateur": "like", "valeur": "%"}]},

    # Format P: Maybe maxResults/page style
    {"maxResults": 5},
    {"limit": 5, "offset": 0},
    {"pageSize": 5, "pageNumber": 0},
    {"nbMaxResults": 5},

    # Format Q: Combo with pagination
    {"code": "%", "nbMaxResults": 5},
    {"name": "%", "nbMaxResults": 5},
    {"clauses": [{"field": "code", "operator": "like", "value": "%"}], "nbMaxResults": 5},
]

for i, body in enumerate(search_tests):
    print(f"\nTEST {i+4}: POST /customers/search")
    print(f"  Body: {json.dumps(body)}")
    try:
        r = requests.post(f"{BASE}/customers/search", auth=AUTH, headers=HEADERS, json=body)
        print(f"  Status: {r.status_code}")
        resp = r.text[:300]
        print(f"  Response: {resp}")
        # If we get 200, we found it!
        if r.status_code == 200:
            print("  >>> SUCCESS! This format works! <<<")
            break
    except Exception as e:
        print(f"  Error: {e}")

# --- Also try the swagger YAML to get schemas ---
print("\n" + "=" * 60)
print("BONUS: Trying to fetch API schema definitions...")
try:
    r = requests.get("https://docs.akuiteo.fr/api/5.0/swagger-crm.yaml")
    if r.status_code == 200:
        # Search for CustomerCriteria in the YAML
        text = r.text
        idx = text.find("CustomerCriteria")
        if idx >= 0:
            # Get surrounding context
            start = max(0, idx - 100)
            end = min(len(text), idx + 2000)
            print(f"  Found CustomerCriteria at position {idx}:")
            print(text[start:end])
        else:
            print("  CustomerCriteria not found in YAML")
            # Try other keywords
            for kw in ["Criteria", "searchCriteria", "clauses"]:
                idx = text.find(kw)
                if idx >= 0:
                    start = max(0, idx - 50)
                    end = min(len(text), idx + 500)
                    print(f"\n  Found '{kw}' at position {idx}:")
                    print(text[start:end])
except Exception as e:
    print(f"  Error fetching schema: {e}")

print("\n" + "=" * 60)
print("DONE. Copy-paste ALL the output above and share it.")
