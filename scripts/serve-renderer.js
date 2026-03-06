/**
 * Serve out/renderer on port 5173 using only Node built-ins.
 * Used by Playwright E2E so we don't depend on the "serve" package or npm cache.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5173;
const ROOT = path.join(__dirname, '..', 'out', 'renderer');

const MIMES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
  p = path.normalize(p);
  if (!p.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  fs.readFile(p, (err, data) => {
    if (err) {
      res.statusCode = err.code === 'ENOENT' ? 404 : 500;
      res.end();
      return;
    }
    const ext = path.extname(p);
    res.setHeader('Content-Type', MIMES[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
