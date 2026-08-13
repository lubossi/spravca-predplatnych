#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import mimetypes

PORT = 3005
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DATA_FILE = os.path.join(DATA_DIR, 'subscriptions.json')

DEMO_DATA = [
    {
        "id": "sub_demo_1",
        "name": "Netflix Premium",
        "price": 17.99,
        "billingCycle": "monthly",
        "category": "Zábava",
        "paymentMethod": "Platebná karta",
        "nextPaymentDate": "2026-08-16",
        "color": "#e50914",
        "notes": "4K Ultra HD rodinné konto",
        "active": True
    },
    {
        "id": "sub_demo_2",
        "name": "Spotify Family",
        "price": 10.99,
        "billingCycle": "monthly",
        "category": "Zábava",
        "paymentMethod": "PayPal",
        "nextPaymentDate": "2026-08-24",
        "color": "#1db954",
        "notes": "Pre 6 členov rodiny",
        "active": True
    },
    {
        "id": "sub_demo_3",
        "name": "Optický Internet Telekom",
        "price": 22.90,
        "billingCycle": "monthly",
        "category": "Domácnosť",
        "paymentMethod": "Bankový prevod",
        "nextPaymentDate": "2026-08-14",
        "color": "#e20074",
        "notes": "Rýchlosť 500/50 Mbps",
        "active": True
    },
    {
        "id": "sub_demo_4",
        "name": "Posilňovňa GymBeam",
        "price": 29.00,
        "billingCycle": "monthly",
        "category": "Zdravie",
        "paymentMethod": "Platebná karta",
        "nextPaymentDate": "2026-08-19",
        "color": "#f59e0b",
        "notes": "Mesačné členstvo bez viazanosti",
        "active": True
    },
    {
        "id": "sub_demo_5",
        "name": "ChatGPT Plus (OpenAI)",
        "price": 20.00,
        "billingCycle": "monthly",
        "category": "Nástroje",
        "paymentMethod": "Apple Pay",
        "nextPaymentDate": "2026-08-31",
        "color": "#10a37f",
        "notes": "GPT-4o a generovanie obrázkov",
        "active": True
    },
    {
        "id": "sub_demo_6",
        "name": "Adobe Creative Cloud",
        "price": 380.00,
        "billingCycle": "yearly",
        "category": "Práca",
        "paymentMethod": "Platebná karta",
        "nextPaymentDate": "2026-09-27",
        "color": "#ff0000",
        "notes": "Ročné predplatné pre grafiku",
        "active": True
    },
    {
        "id": "sub_demo_7",
        "name": "iCloud+ 200GB",
        "price": 2.99,
        "billingCycle": "monthly",
        "category": "Nástroje",
        "paymentMethod": "Apple Pay",
        "nextPaymentDate": "2026-08-15",
        "color": "#3b82f6",
        "notes": "Zálohovanie fotiek a iPhone",
        "active": True
    }
]

def ensure_data_file():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(DEMO_DATA, f, ensure_ascii=False, indent=2)

def read_subscriptions():
    ensure_data_file()
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading file: {e}")
        return DEMO_DATA

def write_subscriptions(data):
    ensure_data_file()
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

class RestRequestHandler(http.server.BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def parse_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length)
                return json.loads(body.decode('utf-8'))
        except Exception as e:
            print("JSON parse error:", e)
        return {}

    def serve_static(self, rel_path):
        if rel_path == '/' or not rel_path:
            rel_path = '/index.html'

        clean_path = rel_path.lstrip('/')
        file_path = os.path.normpath(os.path.join(BASE_DIR, clean_path))

        if not file_path.startswith(BASE_DIR) or not os.path.exists(file_path) or os.path.isdir(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")
            return

        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            if file_path.endswith('.css'): content_type = 'text/css'
            elif file_path.endswith('.js'): content_type = 'application/javascript'
            elif file_path.endswith('.html'): content_type = 'text/html'
            else: content_type = 'application/octet-stream'

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', f"{content_type}; charset=utf-8" if 'text' in content_type or 'javascript' in content_type or 'json' in content_type else content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"500 Internal Error: {e}".encode('utf-8'))

    def do_GET(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path

        if path == '/api/subscriptions':
            subs = read_subscriptions()
            self.send_json(subs)
        else:
            self.serve_static(path)

    def do_POST(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path

        if path == '/api/subscriptions':
            body = self.parse_json_body()
            subs = read_subscriptions()
            subs.append(body)
            write_subscriptions(subs)
            self.send_json(body, 201)
        elif path == '/api/subscriptions/reset':
            write_subscriptions(DEMO_DATA)
            self.send_json(DEMO_DATA, 200)
        elif path == '/api/subscriptions/import':
            body = self.parse_json_body()
            if isinstance(body, list):
                write_subscriptions(body)
                self.send_json(body, 200)
            else:
                self.send_json({"error": "Invalid data format"}, 400)
        else:
            self.send_response(404)
            self.end_headers()

    def do_PUT(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path

        if path.startswith('/api/subscriptions/'):
            sub_id = path.split('/')[-1]
            body = self.parse_json_body()
            subs = read_subscriptions()

            found = False
            for i, item in enumerate(subs):
                if item.get('id') == sub_id:
                    subs[i] = body
                    found = True
                    break

            if found:
                write_subscriptions(subs)
                self.send_json(body, 200)
            else:
                self.send_json({"error": "Subscription not found"}, 404)
        else:
            self.send_response(404)
            self.end_headers()

    def do_DELETE(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path

        if path.startswith('/api/subscriptions/'):
            sub_id = path.split('/')[-1]
            subs = read_subscriptions()
            filtered = [s for s in subs if s.get('id') != sub_id]

            if len(filtered) < len(subs):
                write_subscriptions(filtered)
                self.send_json({"success": True, "id": sub_id}, 200)
            else:
                self.send_json({"error": "Subscription not found"}, 404)
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    ensure_data_file()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), RestRequestHandler) as httpd:
        print(f"====================================================")
        print(f"  SPRÁVCA PREDPLATNÝCH - RestRequestHandler Server")
        print(f"  Aplikácia beží na: http://localhost:{PORT}")
        print(f"  Dáta sa ukladajú do: {DATA_FILE}")
        print(f"====================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer zastavený.")
