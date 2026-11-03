/**
 * Balans Plus - Admin API
 * Serverless API handler (Login, arizalar ro'yxati, status yangilash va o'chirish)
 */

import { getAllArizalar, updateArizaStatus, deleteAriza, getStats } from './db.js';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const SECRET_KEY = process.env.ADMIN_SECRET || 'balans-plus-secure-token-2026';

// Tokenni tekshirish
function verifyAuth(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  if (!authHeader) return false;

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [user, timestamp, secret] = decoded.split(':::');
    if (user === ADMIN_USER && secret === SECRET_KEY) {
      // 7 kunlik amal qilish muddati
      const age = Date.now() - Number(timestamp);
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

// Token yaratish
function generateToken() {
  const payload = `${ADMIN_USER}:::${Date.now()}:::${SECRET_KEY}`;
  return Buffer.from(payload).toString('base64');
}

export default async function handler(req, res) {
  // CORS & Header sozlamalari
  res.setHeader('Content-Type', 'application/json');

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  // 1. LOGIN SO'ROVI (POST /api/admin { action: 'login', username, password })
  if (req.method === 'POST' && (body?.action === 'login' || req.query?.action === 'login')) {
    const { username, password } = body || {};

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = generateToken();
      return res.status(200).json({
        success: true,
        message: 'Muvaffaqiyatli tizimga kirildi',
        token,
        user: { username: ADMIN_USER }
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Login yoki parol noto\'g\'ri'
      });
    }
  }

  // 2. BOSHQA BARCHA AMALLAR UCHUN TOKEN TEKSHIRUVI
  if (!verifyAuth(req)) {
    return res.status(401).json({
      success: false,
      error: 'Ruxsat berilmagan. Iltimos, qaytadan tizimga kiring.'
    });
  }

  // 3. ARIZALARNI OLISH (GET /api/admin)
  if (req.method === 'GET') {
    try {
      const status = req.query?.status || 'all';
      const search = req.query?.search || '';

      const [arizalar, stats] = await Promise.all([
        getAllArizalar({ status, search }),
        getStats()
      ]);

      return res.status(200).json({
        success: true,
        arizalar,
        stats
      });
    } catch (err) {
      console.error('Arizalarni yuklashda xatolik:', err);
      return res.status(500).json({
        success: false,
        error: 'Arizalarni olishda xatolik yuz berdi'
      });
    }
  }

  // 4. STATUSNI YANGILASH (PATCH yoki PUT /api/admin)
  if (req.method === 'PATCH' || req.method === 'PUT') {
    try {
      const { id, status } = body || {};
      if (!id || !status) {
        return res.status(400).json({
          success: false,
          error: 'ID va status kiritilishi shart'
        });
      }

      const updated = await updateArizaStatus(id, status);
      if (updated) {
        return res.status(200).json({
          success: true,
          message: 'Status yangilandi'
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'Ariza topilmadi'
        });
      }
    } catch (err) {
      console.error('Status yangilash xatoligi:', err);
      return res.status(500).json({
        success: false,
        error: 'Statusni yangilashda xatolik yuz berdi'
      });
    }
  }

  // 5. ARIZANI O'CHIRISH (DELETE /api/admin)
  if (req.method === 'DELETE') {
    try {
      const id = body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Ariza ID si ko\'rsatilmadi'
        });
      }

      const deleted = await deleteAriza(id);
      if (deleted) {
        return res.status(200).json({
          success: true,
          message: 'Ariza muvaffaqiyatli o\'chirildi'
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'Ariza topilmadi'
        });
      }
    } catch (err) {
      console.error('O\'chirish xatoligi:', err);
      return res.status(500).json({
        success: false,
        error: 'Arizani o\'chirishda xatolik'
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: 'Metod qo\'llab-quvvatlanmaydi'
  });
}

