const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3005;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'subscriptions.json');

const DEMO_DATA = [
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
    "active": true
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
    "active": true
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
    "active": true
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
    "active": true
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
    "active": true
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
    "active": true
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
    "active": true
  }
];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEMO_DATA, null, 2), 'utf8');
  }
}

function readSubscriptions() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return DEMO_DATA;
  }
}

function writeSubscriptions(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // REST API Routes
  if (pathname === '/api/subscriptions' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(readSubscriptions()));
    return;
  }

  if (pathname === '/api/subscriptions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const newSub = JSON.parse(body);
        const subs = readSubscriptions();
        subs.push(newSub);
        writeSubscriptions(subs);
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(newSub));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname === '/api/subscriptions/reset' && req.method === 'POST') {
    writeSubscriptions(DEMO_DATA);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(DEMO_DATA));
    return;
  }

  if (pathname === '/api/subscriptions/import' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const imported = JSON.parse(body);
        if (Array.isArray(imported)) {
          writeSubscriptions(imported);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(imported));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Data must be array' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/subscriptions/') && req.method === 'PUT') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updated = JSON.parse(body);
        const subs = readSubscriptions();
        const idx = subs.findIndex(s => s.id === id);
        if (idx !== -1) {
          subs[idx] = updated;
          writeSubscriptions(subs);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(updated));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/subscriptions/') && req.method === 'DELETE') {
    const id = pathname.split('/')[3];
    const subs = readSubscriptions();
    const filtered = subs.filter(s => s.id !== id);
    if (filtered.length < subs.length) {
      writeSubscriptions(filtered);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, id }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  // Serve Static Files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Súbor nenájdený');
      } else {
        res.writeHead(500);
        res.end('500 Serverová chyba');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  SPRÁVCA PREDPLATNÝCH - Node.js Backend Server`);
  console.log(`  Aplikácia beží na: http://localhost:${PORT}`);
  console.log(`  Dáta sa ukladajú do: ${DATA_FILE}`);
  console.log(`====================================================`);
});
