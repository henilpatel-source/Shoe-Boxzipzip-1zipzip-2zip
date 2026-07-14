const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  // Remove query strings and hash
  url = url.split('?')[0].split('#')[0];

  // Security: prevent directory traversal
  const safePath = path.normalize(url).replace(/^(\.\.[\/\\])/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  // Check if file exists and is within public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Try serving index.html for SPA routes
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (err2, indexData) => {
          if (err2) {
            res.statusCode = 404;
            res.end('Not Found');
          } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(indexData);
          }
        });
      } else {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server running on http://0.0.0.0:${PORT}`);
});
