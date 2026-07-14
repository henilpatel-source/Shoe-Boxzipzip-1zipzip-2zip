const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure directories exist
[UPLOADS_DIR, DATA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── JSON file storage helpers ─────────────────────────────────────────────
function readData(file) {
  const p = path.join(DATA_DIR, file);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return file.includes('config') ? {} : []; }
}
function writeData(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
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
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
    if (body[start] === 0x0d) start += 2;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headerStr = body.slice(start, headerEnd).toString();
    start = headerEnd + 4;
    const nextSep = body.indexOf(sep, start);
    const dataEnd = nextSep === -1 ? body.length : nextSep - 2;
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

// ── Response helpers ──────────────────────────────────────────────────────
function jsonOk(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function jsonErr(res, msg, status = 500) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ message: msg }));
}

// ── MIME types ────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); }
    else {
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

  // ── API: Admin session ─────────────────────────────────────────────────
  if (url === '/api/admin/session') return jsonOk(res, { adminId: 1 });

  // ── API: Products ──────────────────────────────────────────────────────
  if (url === '/api/products' && method === 'GET') {
    const category = new URL(req.url, 'http://localhost').searchParams.get('category');
    let products = readData('products.json');
    if (category) products = products.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
    return jsonOk(res, products);
  }

  if (url === '/api/products' && method === 'POST') {
    try {
      const body = await readBody(req);
      const product = JSON.parse(body.toString());
      const products = readData('products.json');
      product.id = Date.now();
      product.createdAt = new Date().toISOString();
      products.push(product);
      writeData('products.json', products);
      return jsonOk(res, product, 201);
    } catch (e) { return jsonErr(res, e.message); }
  }

  // DELETE /api/products/:id
  const productDeleteMatch = url.match(/^\/api\/products\/(.+)$/);
  if (productDeleteMatch && method === 'DELETE') {
    const id = String(productDeleteMatch[1]);
    let products = readData('products.json');
    products = products.filter(p => String(p.id) !== id);
    writeData('products.json', products);
    res.writeHead(204); return res.end();
  }

  // GET /api/products/:id
  const productGetMatch = url.match(/^\/api\/products\/(\d+)$/);
  if (productGetMatch && method === 'GET') {
    const products = readData('products.json');
    const product = products.find(p => String(p.id) === productGetMatch[1]);
    if (!product) return jsonErr(res, 'Product not found', 404);
    return jsonOk(res, product);
  }

  // ── API: Offer config ──────────────────────────────────────────────────
  if (url === '/api/offer-config' && method === 'GET') {
    return jsonOk(res, readData('offer-config.json') || { isEnabled: false, message: '', endTime: null });
  }

  if (url === '/api/offer-config' && method === 'POST') {
    try {
      const body = await readBody(req);
      const config = JSON.parse(body.toString());
      writeData('offer-config.json', config);
      return jsonOk(res, config);
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── API: Customers ─────────────────────────────────────────────────────
  if (url === '/api/customers' && method === 'GET') {
    return jsonOk(res, readData('customers.json'));
  }

  const customerDeleteMatch = url.match(/^\/api\/customers\/(.+)$/);
  if (customerDeleteMatch && method === 'DELETE') {
    let customers = readData('customers.json');
    customers = customers.filter(c => String(c.id) !== customerDeleteMatch[1]);
    writeData('customers.json', customers);
    res.writeHead(204); return res.end();
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
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), filePart.data);
      return jsonOk(res, { url: `/uploads/${filename}` });
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── Customer auth stubs ────────────────────────────────────────────────
  if (url === '/api/customer/session') return jsonErr(res, 'Not authenticated', 401);
  if (url === '/api/customer/logout' && method === 'POST') return jsonOk(res, { success: true });
  if (url === '/api/customer/login' && method === 'POST') return jsonErr(res, 'Invalid credentials', 401);
  if (url === '/api/customer/register' && method === 'POST') {
    try {
      const body = await readBody(req);
      const customer = JSON.parse(body.toString());
      const customers = readData('customers.json');
      customer.id = Date.now();
      customer.createdAt = new Date().toISOString();
      customers.push(customer);
      writeData('customers.json', customers);
      return jsonOk(res, { success: true, customer });
    } catch (e) { return jsonErr(res, e.message); }
  }

  // ── Static files ───────────────────────────────────────────────────────
  let filePath = path.join(PUBLIC_DIR, path.normalize(url).replace(/^(\.\.[\/\\])+/, ''));
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
