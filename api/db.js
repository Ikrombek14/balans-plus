/**
 * Balans Plus - SQL Ma'lumotlar bazasi (SQLite)
 * Node.js (v22+) o'rnatilgan node:sqlite moduli orqali ishlaydi (tashqi kutubxonasiz)
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  // Ma'lumotlar bazasi fayl yo'li
  let dbPath = process.env.DATABASE_PATH;

  if (!dbPath) {
    // Vercel serverless muhitida faqat /tmp papkasi yozish uchun ochiq
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      dbPath = '/tmp/balans.sqlite';
    } else {
      dbPath = path.join(process.cwd(), 'data', 'balans.sqlite');
    }
  }

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

/**
 * Yangi arizani SQL jadvaliga saqlash
 */
export function insertAriza({ name, phone, service, message }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO arizalar (name, phone, service, message, status, created_at)
    VALUES (?, ?, ?, ?, 'yangi', datetime('now', '+5 hours'))
  `);

  const result = stmt.run(
    name.trim(),
    phone.trim(),
    service || 'Umumiy konsultatsiya',
    message ? message.trim() : ''
  );

  return {
    id: Number(result.lastInsertRowid),
    name,
    phone,
    service,
    message,
    status: 'yangi'
  };
}

/**
 * Barcha arizalarni qidiruv va filtrlash bilan olish
 */
export function getAllArizalar({ status = '', search = '' } = {}) {
  const db = getDb();

  let query = `SELECT * FROM arizalar WHERE 1=1`;
  const params = [];

  if (status && status !== 'all') {
    query += ` AND status = ?`;
    params.push(status);
  }

  if (search && search.trim() !== '') {
    query += ` AND (name LIKE ? OR phone LIKE ? OR message LIKE ? OR service LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY id DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Ariza statusini yangilash ('yangi', 'boglanildi', 'bajarildi', 'rad_etildi')
 */
export function updateArizaStatus(id, status) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE arizalar 
    SET status = ? 
    WHERE id = ?
  `);
  const result = stmt.run(status, Number(id));
  return result.changes > 0;
}

/**
 * Arizani o'chirish
 */
export function deleteAriza(id) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM arizalar 
    WHERE id = ?
  `);
  const result = stmt.run(Number(id));
  return result.changes > 0;
}

/**
 * Dashboard uchun statistika
 */
export function getStats() {
  const db = getDb();

  const total = db.prepare(`SELECT COUNT(*) as count FROM arizalar`).get().count;
  const yangi = db.prepare(`SELECT COUNT(*) as count FROM arizalar WHERE status = 'yangi'`).get().count;
  const boglanildi = db.prepare(`SELECT COUNT(*) as count FROM arizalar WHERE status = 'boglanildi'`).get().count;
  const bajarildi = db.prepare(`SELECT COUNT(*) as count FROM arizalar WHERE status = 'bajarildi'`).get().count;
  const bugun = db.prepare(`
    SELECT COUNT(*) as count 
    FROM arizalar 
    WHERE date(created_at) = date('now', '+5 hours')
  `).get().count;

  return {
    total: Number(total),
    yangi: Number(yangi),
    boglanildi: Number(boglanildi),
    bajarildi: Number(bajarildi),
    bugun: Number(bugun)
  };
}
