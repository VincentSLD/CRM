"""
Test script v2 - Now we know each field must be a Clause object, not a string
The error said: expected type: Clause<java.lang.String>, actual type: String
"""
import requests
import json

BASE = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest/crm"
AUTH = ("API1", "API1")
HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}

# Also fetch the YAML schema for Clause definition
print("=" * 60)
print("Fetching Clause schema from YAML...")
try:
    r = requests.get("https://docs.akuiteo.fr/api/5.0/swagger-crm.yaml")
    if r.status_code == 200:
        text = r.text
        # Find Clause definition
        for kw in ["Clause", "CustomerCriteria", "clause"]:
            idx = text.find(kw)
            while idx >= 0:
                start = max(0, idx - 200)
                end = min(len(text), idx + 800)
                snippet = text[start:end]
                # Only show if it looks like a schema definition
                if "properties" in snippet or "type:" in snippet or "description" in snippet:
                    print(f"\n--- Found '{kw}' at pos {idx} ---")
                    print(snippet)
                    print("---")
                idx = text.find(kw, idx + 1)
                if idx > 0 and idx - start > 5000:
                    break  # Don't search forever
except Exception as e:
    print(f"  Error: {e}")

print("\n" + "=" * 60)
print("Testing Clause object formats...")

search_tests = [
    # Format A: Clause as object with operator + value
    {"code": {"operator": "like", "value": "%"}},
    {"code": {"operator": "LIKE", "value": "%"}},
    {"code": {"operator": "=", "value": "C00100003"}},
    {"code": {"operator": "eq", "value": "C00100003"}},
    {"code": {"operator": "equals", "value": "C00100003"}},
    {"name": {"operator": "like", "value": "%"}},
    {"name": {"operator": "LIKE", "value": "%"}},

    # Format B: Clause with "op" instead of "operator"
    {"code": {"op": "like", "value": "%"}},
    {"name": {"op": "like", "value": "%"}},

    # Format C: Clause with just value (implicit equals)
    {"code": {"value": "%"}},
    {"code": {"value": "C00100003"}},
    {"name": {"value": "%"}},

    # Format D: Clause with operand
    {"code": {"operand": "like", "value": "%"}},
    {"name": {"operand": "like", "value": "%"}},

    # Format E: Clause with comparison
    {"code": {"comparison": "like", "value": "%"}},
    {"code": {"comparison": "LIKE", "value": "%"}},

    # Format F: Clause as {field, operator, value}
    {"code": {"field": "code", "operator": "like", "value": "%"}},

    # Format G: Clause with type/condition
    {"code": {"type": "like", "value": "%"}},
    {"code": {"condition": "like", "value": "%"}},

    # Format H: Multiple fields
    {"name": {"operator": "like", "value": "%"}, "type": {"operator": "=", "value": "CUSTOMER"}},

    # Format I: Clause with "like" as key
    {"code": {"like": "%"}},
    {"name": {"like": "%"}},

    # Format J: Clause with "contains" / "startsWith"
    {"code": {"contains": "C001"}},
    {"name": {"startsWith": "A"}},

    # Format K: Clause with "equals"
    {"code": {"equals": "C00100003"}},
    {"name": {"equals": "AUCUN"}},

    # Format L: nbMaxResults with clause
    {"code": {"operator": "like", "value": "%"}, "nbMaxResults": 5},
    {"name": {"operator": "like", "value": "%"}, "nbMaxResults": 5},

    # Format M: Clause with values array
    {"code": {"operator": "in", "values": ["C00100003"]}},

    # Format N: maybe "operateur" in French?
    {"code": {"operateur": "like", "valeur": "%"}},

    # Format O: Java-style with comparator
    {"code": {"comparator": "LIKE", "value": "%"}},
    {"code": {"comparator": "like", "value": "%"}},
]

for i, body in enumerate(search_tests):
    print(f"\nTEST {i+1}: {json.dumps(body)}")
    try:
        r = requests.post(f"{BASE}/customers/search", auth=AUTH, headers=HEADERS, json=body)
        print(f"  Status: {r.status_code} | {r.text[:250]}")
        if r.status_code == 200:
            print("  >>> SUCCESS! <<<")
            try:
                data = r.json()
                print(f"  Results: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
            except:
                pass
            break
    except Exception as e:
        print(f"  Error: {e}")

print("\n" + "=" * 60)
print("DONE")
