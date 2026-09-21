'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED = new Set([
  'index.html',
  'styles.css',
  'wow.css',
  'personal.css',
  'personal.js',
  'weather.js',
  'marketBrain.js',
  'app.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'sw.js'
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

function allowedRelativePath(pathname) {
  const clean = decodeURIComponent(pathname || '/').replace(/^\/+/, '');
  if (!clean) return 'index.html';
  if (ALLOWED.has(clean)) return clean;
  if (/^fonts\/[a-z0-9._-]+\.woff2$/i.test(clean)) return clean;
  return null;
}

function serveStatic(req, res) {
  if (!req || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch (_) { return false; }

  const relative = allowedRelativePath(pathname);
  if (!relative) return false;
  const absolute = path.resolve(ROOT, relative);
  if (!absolute.startsWith(ROOT + path.sep) && absolute !== path.join(ROOT, 'index.html')) return false;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return false;

  const ext = path.extname(absolute).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  };
  if (ext === '.woff2' || ext === '.png') headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else headers['Cache-Control'] = 'no-cache';

  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(absolute).pipe(res);
  return true;
}

module.exports = { serveStatic, allowedRelativePath };
