/**
 * Balans Plus - Mahalliy (Local) Server
 * Node.js da hech qanday qo'shimcha npm o'rnatmasdan ishga tushirish uchun
 * Buyruq: node server.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import arizaHandler from './api/ariza.js';
import adminHandler from './api/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Express/Vercel serverless request & response adapter
function adaptServerless(req, res, handler) {
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk;
  });

  req.on('end', async () => {
    // Parse JSON body if present
    if (rawBody) {
      try {
        req.body = JSON.parse(rawBody);
      } catch (e) {
        req.body = rawBody;
      }
    } else {
      req.body = {};
    }

    // Parse query params
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    req.query = Object.fromEntries(parsedUrl.searchParams);

    // Mock Express/Vercel res.status().json()
    res.status = function(code) {
      res.statusCode = code;
      return res;
    };

    res.json = function(data) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(data));
      return res;
    };

    try {
      await handler(req, res);
    } catch (err) {
      console.error('API Error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Server xatoligi' }));
      }
    }
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. API: /api/ariza
  if (pathname === '/api/ariza') {
    return adaptServerless(req, res, arizaHandler);
  }

  // 2. API: /api/admin
  if (pathname === '/api/admin') {
    return adaptServerless(req, res, adminHandler);
  }

  // 3. /admin yo'nalishi -> admin/index.html
  if (pathname === '/admin' || pathname === '/admin/') {
    const adminPath = path.join(__dirname, 'admin', 'index.html');
    fs.readFile(adminPath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Admin sahifasi topilmadi');
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(data);
    });
    return;
  }

  // 4. Statik fayllarni uzatish
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404: Sahifa topilmadi');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Balans Plus serveri ishga tushdi:`);
  console.log(`🏠 Asosiy sayt:  http://localhost:${PORT}`);
  console.log(`🔐 Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`   (Login: admin | Parol: admin)`);
  console.log(`💾 SQL Baza:     SQLite (data/balans.sqlite)`);
  console.log(`==================================================\n`);
});
