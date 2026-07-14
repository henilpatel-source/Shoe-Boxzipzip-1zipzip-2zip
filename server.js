const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

// Firebase config
const FB_DB = 'shoe-box-3a237-default-rtdb.firebaseio.com';
const FB_KEY = 'AIzaSyAeBdqEblXIxnGZzk7i0wHhqwgSX1ABJ7I';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Firebase REST helper ──────────────────────────────────────────────────
function fbRequest(method, fbPath, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: FB_DB,
      path: `${fbPath}?auth=${FB_KEY}`,
      method,
      headers: { 'Content-Type': 'application/json', ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) }
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Multipart file upload parser ─────────────────────────────────────────
function parseMultipart(body, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);
  let start = 0;
  while (start < body.length) {
    const sepIdx = body.indexOf(sep, start);
    if (sepIdx === -1) break;
    start = sepIdx + sep.length;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break; // --
    if (body[start] === 0x0d) start += 2; // \r\n
    // Find headers end
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headerStr = body.slice(start, headerEnd).toString();
    start = headerEnd + 4;
    const nextSep = body.indexOf(sep, start);
    const dataEnd = nextSep === -1 ? body.length : nextSep - 2; // trim \r\n before boundary
    const data = body.slice(start, dataEnd);
    start = nextSep;
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const fileMatch = headerStr.match(/filename="([^"]+)"/);
    const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: fileMatch ? fileMatch[1] : null,
      contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
      data
    });
  }
  return parts;
}

// ── Read request body ─────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── JSON response helpers ─────────────────────────────────────────────────
function jsonOk(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function jsonErr(res, msg, status = 500) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ message: msg }));
}

// ── Convert Firebase object map → array ──────────────────────────────────
function fbMapToArray(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).map(([key, val]) => ({ ...val, _fbKey: key }));
}

// ── Static file server ────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not Found');
    } else {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
}

// ── Main server ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,PUT', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // ── Admin login page (protect /admin route) ────────────────────────────
  if (url === '/admin' || url === '/admin/') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'admin.html'));
  }

  // ── API: Admin session (always return logged in for SPA) ───────────────
  if (url === '/api/admin/session') {
    return jsonOk(res, { adminId: 1 });
  }

  // ── API: Products ──────────────────────────────────────────────────────
  if (url === '/api/products' && method === 'GET') {
    try {
      const data = await fbRequest('GET', '/products.json');
      const arr = fbMapToArray(data).map(p => ({
        id: p._fbKey, name: p.name, price: p.price, discount: p.discount,
        category: p.category, description: p.description,
        imageUrl: p.imageUrl, additionalImages: p.additionalImages || []
      }));
      return jsonOk(res, arr);
    } catch (e) { return jsonErr(res, e.message); }
  }

  if (url === '/api/products' && method === 'POST') {
    try {
      const body = await readBody(req);
      const product = JSON.parse(body.toString());
      product.createdAt = new Date().toISOString();
      const result = await fbRequest('POST', '/products.json', product);
      return jsonOk(res, { ...product, id: result.name }, 201);
    } catch (e) { return jsonErr(res, e.message); }
  }

  // DELETE /api/products/:id
  const productDeleteMatch = url.match(/^\/api\/products\/(.+)$/);
  if (productDeleteMatch && method === 'DELETE') {
    try {
      await fbRequest('DELETE', `/products/${productDeleteMatch[1]}.json`);
      res.writeHead(204); return res.end();
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── API: Offer config ──────────────────────────────────────────────────
  if (url === '/api/offer-config' && method === 'GET') {
    try {
      const data = await fbRequest('GET', '/offerConfig.json');
      return jsonOk(res, data || { isEnabled: false, message: '', endTime: null });
    } catch (e) { return jsonErr(res, e.message); }
  }

  if (url === '/api/offer-config' && method === 'POST') {
    try {
      const body = await readBody(req);
      const config = JSON.parse(body.toString());
      await fbRequest('PUT', '/offerConfig.json', config);
      return jsonOk(res, config);
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── API: Customers ─────────────────────────────────────────────────────
  if (url === '/api/customers' && method === 'GET') {
    try {
      const data = await fbRequest('GET', '/customers.json');
      return jsonOk(res, fbMapToArray(data));
    } catch (e) { return jsonErr(res, e.message); }
  }

  const customerDeleteMatch = url.match(/^\/api\/customers\/(.+)$/);
  if (customerDeleteMatch && method === 'DELETE') {
    try {
      await fbRequest('DELETE', `/customers/${customerDeleteMatch[1]}.json`);
      res.writeHead(204); return res.end();
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── API: File Upload ───────────────────────────────────────────────────
  if (url === '/api/upload' && method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) return jsonErr(res, 'No boundary in Content-Type', 400);

      const body = await readBody(req);
      const parts = parseMultipart(body, boundaryMatch[1].trim());
      const filePart = parts.find(p => p.filename);
      if (!filePart) return jsonErr(res, 'No file in request', 400);

      const ext = path.extname(filePart.filename) || '.jpg';
      const filename = crypto.randomBytes(16).toString('hex') + ext;
      const savePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(savePath, filePart.data);

      return jsonOk(res, { url: `/uploads/${filename}` });
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── Customer auth stubs (so SPA doesn't crash) ─────────────────────────
  if (url === '/api/customer/session') return jsonErr(res, 'Not authenticated', 401);
  if (url === '/api/customer/login' && method === 'POST') return jsonErr(res, 'Invalid credentials', 401);
  if (url === '/api/customer/register' && method === 'POST') {
    try {
      const body = await readBody(req);
      const customer = JSON.parse(body.toString());
      customer.createdAt = new Date().toISOString();
      const result = await fbRequest('POST', '/customers.json', customer);
      return jsonOk(res, { success: true, customer: { id: result.name, ...customer } });
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── Static files ───────────────────────────────────────────────────────
  let filePath = path.join(PUBLIC_DIR, path.normalize(url).replace(/^(\.\.[\/\\])+/, ''));

  // Directory → try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    return serveStatic(res, filePath);
  }

  // SPA fallback → index.html
  serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Shoe Box server running on http://0.0.0.0:${PORT}`);
});
