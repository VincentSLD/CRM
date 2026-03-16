"""
Serveur local pour le CRM — résout les erreurs file:// et CORS
Lancer : python serve.py
Ouvrir : http://localhost:3000
"""
import http.server
import os

PORT = 3000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map.update({'.js': 'application/javascript', '.mjs': 'application/javascript'})

print(f"=== CRM démarré sur http://localhost:{PORT} ===")
print("Appuyez Ctrl+C pour arrêter")
http.server.HTTPServer(('localhost', PORT), handler).serve_forever()
