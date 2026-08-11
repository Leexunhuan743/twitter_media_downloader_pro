'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.argv[2] || 25558);
const webRoot = path.resolve(__dirname, '..', '..', 'internal', 'api', 'web');

const assets = new Map([
  ['/', ['web3/index.html', 'text/html; charset=utf-8']],
  ['/static/app.js', ['web3/app.js', 'application/javascript; charset=utf-8']],
  ['/static/styles.css', ['web3/styles.css', 'text/css; charset=utf-8']],
  ['/static/shared/datetime.js', ['shared/datetime.js', 'application/javascript; charset=utf-8']],
]);

function apiData(url) {
  if (url.pathname === '/api/v1/tasks') return [];
  if (url.pathname === '/api/v1/health') return { status: 'ok', version: 'test' };
  if (url.pathname === '/api/v1/queue/status') return { status: 'idle', queue_size: 0 };
  if (url.pathname === '/api/v1/logs') return { logs: [], totalPages: 1 };
  if (url.pathname === '/api/v1/logs/stats') return {};
  return {};
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const asset = assets.get(url.pathname);
  if (asset) {
    const [relativePath, contentType] = asset;
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(webRoot, relativePath)).pipe(response);
    return;
  }
  if (url.pathname.startsWith('/api/v1/') && !url.pathname.includes('/stream') && !url.pathname.includes('/sse/')) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: true, data: apiData(url) }));
    return;
  }
  response.writeHead(204);
  response.end();
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`http://127.0.0.1:${actualPort}/\n`);
});
