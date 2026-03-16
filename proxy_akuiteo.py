"""
Proxy local pour les appels Akuiteo API (contourne le CORS)
Lancer : python proxy_akuiteo.py
Le proxy écoute sur http://localhost:8888
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests
import json

AKUITEO_ROOT = "https://novamingenierie-test.myakuiteo.com/akuiteo/rest"
AKUITEO_AUTH = ("API1", "API1")

class ProxyHandler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _proxy(self, method):
        # Routes: /crm/... → module CRM, /sales/... → module Sales
        path = self.path
        url = AKUITEO_ROOT + path

        body = None
        if self.headers.get('Content-Length'):
            body = self.rfile.read(int(self.headers['Content-Length']))

        headers = {"Accept": self.headers.get('Accept', 'application/json')}
        if body:
            headers["Content-Type"] = self.headers.get('Content-Type', 'application/json')

        print(f"[PROXY] {method} {url}")
        try:
            r = requests.request(method, url, auth=AKUITEO_AUTH, headers=headers, data=body, timeout=120)
            print(f"[PROXY] Response: {r.status_code} ({len(r.content)} bytes)")

            self.send_response(r.status_code)
            self._cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(r.content)
        except Exception as e:
            print(f"[PROXY] Error: {e}")
            self.send_response(502)
            self._cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_GET(self):
        self._proxy('GET')

    def do_POST(self):
        self._proxy('POST')

    def do_PUT(self):
        self._proxy('PUT')

    def do_PATCH(self):
        self._proxy('PATCH')

    def do_DELETE(self):
        self._proxy('DELETE')

    def log_message(self, format, *args):
        pass  # Silencer les logs par défaut, on utilise nos propres prints

if __name__ == '__main__':
    port = 8888
    server = HTTPServer(('localhost', port), ProxyHandler)
    print(f"=== Proxy Akuiteo démarré sur http://localhost:{port} ===")
    print(f"=== Cible: {AKUITEO_ROOT} ===")
    print("Appuyez Ctrl+C pour arrêter")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nProxy arrêté.")
