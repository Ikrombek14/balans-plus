/**
 * "Balans Plus" - Ariza qabul qilish, SQL bazaga saqlash va Telegram Botga jo'natish
 * Node.js (ES Module formati)
 */

import { insertAriza } from './db.js';

// HTML belgilarni xavfsiz tozalash (Telegram xatolik bermasligi uchun)
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Xizmat nomlarini tushunarli matnga o'girish xaritasi
const SERVICE_NAMES = {
  yatt: 'YaTTlar uchun buxgalteriya yuritish',
  mchj_full: 'MChJ uchun to\'liq buxgalteriya autsorsingi',
  soliq: 'Soliq hisobotlarini tayyorlash va topshirish',
  ish_haqi: 'Ish haqi va kadrlar hisobini yuritish',
  tiklash: 'Eski buxgalteriyani tiklash va audit',
  boshqa: 'Boshqa / Umumiy konsultatsiya'
};

export default async function handler(req, res) {
  // 1. Faqat POST so'rovlarini qabul qilish
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: 'Faqat POST so\'rovlari qabul qilinadi'
    });
  }

  try {
    // 2. So'rov tanasini olish (JSON yoki ob'yekt sifatida)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: 'Noto\'g\'ri JSON formati'
        });
      }
    }

    const {
      name,
      phone,
      service,
      message,
      honeypot_check,
      honeypot
    } = body || {};

    // 3. Xavfsizlik: Honeypot (spam botlar uchun tuzoq) tekshiruvi
    const isBot = (honeypot_check && honeypot_check.trim() !== '') || 
                  (honeypot && honeypot.trim() !== '');

    if (isBot) {
      return res.status(200).json({
        success: true,
        message: 'Arizangiz qabul qilindi'
      });
    }

    // 4. Validatsiya tekshiruvlari
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Ism kamida 2 ta belgidan iborat bo\'lishi shart'
      });
    }

    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (!phone || phoneDigits.length < 9) {
      return res.status(400).json({
        success: false,
        error: 'Telefon raqami to\'g\'ri kiritilishi shart'
      });
    }

    const formattedService = SERVICE_NAMES[service] || service || 'Umumiy konsultatsiya';
    const cleanMessage = (message && message.trim()) ? message.trim() : '';

    // 5. SQL Ma'lumotlar bazasiga saqlash
    let savedRow = null;
    try {
      savedRow = insertAriza({
        name: name.trim(),
        phone: phone.trim(),
        service: formattedService,
        message: cleanMessage
      });
    } catch (dbErr) {
      console.error('SQL bazaga yozishda xatolik:', dbErr);
    }

    // 6. Telegram Bot API ga so'rov yuborish
    const botToken = process.env.BOT_TOKEN;
    const chatId = process.env.CHAT_ID;

    if (botToken && chatId) {
      try {
        const telegramText = 
`🔔 <b>Yangi ariza (№${savedRow?.id || '—'})</b>

👤 <b>Ism:</b> ${escapeHtml(name.trim())}
📞 <b>Telefon:</b> ${escapeHtml(phone.trim())}
💼 <b>Xizmat:</b> ${escapeHtml(formattedService)}
📝 <b>Izoh:</b> ${escapeHtml(cleanMessage || 'Mavjud emas')}`;

        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: telegramText,
            parse_mode: 'HTML'
          })
        });
      } catch (tgErr) {
        console.error('Telegram botiga yuborishda xatolik:', tgErr);
      }
    } else {
      console.warn('Eslatma: BOT_TOKEN yoki CHAT_ID muhit o\'zgaruvchilari kiritilmagan. Ariza faqat SQL bazaga saqlandi.');
    }

    // 7. Muvaffaqiyatli yakun
    return res.status(200).json({
      success: true,
      message: 'Arizangiz muvaffaqiyatli qabul qilindi! Tez orada mutaxassisimiz siz bilan bog\'lanadi.',
      id: savedRow?.id
    });

  } catch (error) {
    console.error('Kutilmagan server xatoligi:', error);
    return res.status(500).json({
      success: false,
      error: 'Serverda kutilmagan ichki xatolik yuz berdi'
    });
  }
}
