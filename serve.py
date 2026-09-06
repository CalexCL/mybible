from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser, threading

PORT = 8765
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

print(f"Chinese Study Bible V0.1 running at http://127.0.0.1:{PORT}")
print("Press Ctrl+C to stop.")
threading.Timer(0.8, lambda: webbrowser.open(f'http://127.0.0.1:{PORT}')).start()
ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
