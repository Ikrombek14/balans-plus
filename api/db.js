/**
 * Balans Plus - Ma'lumotlar ombori
 * Vercel'da: Vercel Blob (private) dagi bitta arizalar.json fayli
 * Lokal kompyuterda: SQLite (Node.js v22+ o'rnatilgan node:sqlite moduli)
 *
 * Vercel serverless funksiyalarida doimiy disk yo'q (/tmp har bir funksiyada alohida
 * va vaqtinchalik), shuning uchun u yerda arizalar Blob'da saqlanadi.
 */

import fs from 'node:fs';
import path from 'node:path';

const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const BLOB_PATH = 'arizalar.json';

// Toshkent vaqti (UTC+5) "YYYY-MM-DD HH:MM:SS" formatida (SQLite bilan bir xil)
function tashkentNow() {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/* ------------------------------------------------------------------ */
/* Vercel Blob                                                         */
/* ------------------------------------------------------------------ */

// Blob'dan arizalar faylini o'qish: { data: { nextId, items }, etag }
async function readBlob() {
  const { get } = await import('@vercel/blob');
  const result = await get(BLOB_PATH, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) {
    return { data: { nextId: 1, items: [] }, etag: null };
  }
  const text = await new Response(result.stream).text();
  return { data: JSON.parse(text), etag: result.blob.etag };
}

/**
 * Faylni o'qib, o'zgartirib, qayta yozish.
 * ifMatch (ETag) tufayli bir vaqtda kelgan ikki so'rov bir-birining yozganini o'chirib yubormaydi:
 * agar fayl orada o'zgargan bo'lsa, qaytadan o'qib, amalni takrorlaymiz.
 */
async function mutateBlob(mutator) {
  const { put, BlobPreconditionFailedError } = await import('@vercel/blob');

  const MAX_ATTEMPTS = 10;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await readBlob();
    const result = mutator(data);

    try {
      await put(BLOB_PATH, JSON.stringify(data), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false })
      });
      return result;
    } catch (err) {
      // ETag mos kelmadi yoki fayl birinchi marta yaratilayotganda boshqa so'rov ulgurdi
      const conflict = err instanceof BlobPreconditionFailedError || !etag;
      if (!conflict || attempt === MAX_ATTEMPTS) throw err;
      // Raqobatchi so'rovlar bir vaqtda qayta urinmasligi uchun tasodifiy kutish
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 120 * attempt));
    }
  }
}

/* ------------------------------------------------------------------ */
/* SQLite (lokal)                                                      */
/* ------------------------------------------------------------------ */

let dbInstance = null;

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const { DatabaseSync } = await import('node:sqlite');

  // Ma'lumotlar bazasi fayl yo'li
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'balans.sqlite');

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new DatabaseSync(dbPath);

  // Arizalar jadvalini yaratish (agar mavjud bo'lmasa)
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS arizalar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'yangi',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return dbInstance;
}

/* ------------------------------------------------------------------ */
/* Umumiy API (ikkala ombor uchun bir xil)                             */
/* ------------------------------------------------------------------ */

/**
 * Yangi arizani saqlash
 */
export async function insertAriza({ name, phone, service, message }) {
  const row = {
    name: name.trim(),
    phone: phone.trim(),
    service: service || 'Umumiy konsultatsiya',
    message: message ? message.trim() : '',
    status: 'yangi'
  };

  if (USE_BLOB) {
    return mutateBlob(data => {
      const saved = { id: data.nextId, ...row, created_at: tashkentNow() };
      data.nextId += 1;
      data.items.push(saved);
      return saved;
    });
  }

  const db = await getDb();
  const result = db.prepare(`
    INSERT INTO arizalar (name, phone, service, message, status, created_at)
    VALUES (?, ?, ?, ?, 'yangi', datetime('now', '+5 hours'))
  `).run(row.name, row.phone, row.service, row.message);

  return { id: Number(result.lastInsertRowid), ...row };
}

/**
 * Barcha arizalarni qidiruv va filtrlash bilan olish
 */
export async function getAllArizalar({ status = '', search = '' } = {}) {
  const term = search.trim().toLowerCase();

  if (USE_BLOB) {
    const { data } = await readBlob();
    return data.items
      .filter(item => !status || status === 'all' || item.status === status)
      .filter(item => !term || [item.name, item.phone, item.message, item.service]
        .some(field => String(field || '').toLowerCase().includes(term)))
      .sort((a, b) => b.id - a.id);
  }

  const db = await getDb();
  let query = `SELECT * FROM arizalar WHERE 1=1`;
  const params = [];

  if (status && status !== 'all') {
    query += ` AND status = ?`;
    params.push(status);
  }

  if (term) {
    query += ` AND (name LIKE ? OR phone LIKE ? OR message LIKE ? OR service LIKE ?)`;
    const like = `%${search.trim()}%`;
    params.push(like, like, like, like);
  }

  query += ` ORDER BY id DESC`;
  return db.prepare(query).all(...params);
}

/**
 * Ariza statusini yangilash ('yangi', 'boglanildi', 'bajarildi', 'rad_etildi')
 */
export async function updateArizaStatus(id, status) {
  if (USE_BLOB) {
    return mutateBlob(data => {
      const item = data.items.find(i => i.id === Number(id));
      if (!item) return false;
      item.status = status;
      return true;
    });
  }

  const db = await getDb();
  const result = db.prepare(`UPDATE arizalar SET status = ? WHERE id = ?`).run(status, Number(id));
  return result.changes > 0;
}

/**
 * Arizani o'chirish
 */
export async function deleteAriza(id) {
  if (USE_BLOB) {
    return mutateBlob(data => {
      const before = data.items.length;
      data.items = data.items.filter(i => i.id !== Number(id));
      return data.items.length < before;
    });
  }

  const db = await getDb();
  const result = db.prepare(`DELETE FROM arizalar WHERE id = ?`).run(Number(id));
  return result.changes > 0;
}

/**
 * Dashboard uchun statistika
 */
export async function getStats() {
  const items = await getAllArizalar();
  const today = tashkentNow().slice(0, 10);
  const count = s => items.filter(i => i.status === s).length;

  return {
    total: items.length,
    yangi: count('yangi'),
    boglanildi: count('boglanildi'),
    bajarildi: count('bajarildi'),
    bugun: items.filter(i => String(i.created_at || '').slice(0, 10) === today).length
  };
}
