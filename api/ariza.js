/**
 * "Balans Plus" - Ariza qabul qilish va Telegram Botga jo'natish Serverless funksiyasi
 * Node.js (ES Module formati)
 */

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
    // Agar ko'rinmas honeypot maydoni to'ldirilgan bo'lsa, xabar yubormasdan 200 qaytaramiz
    const isBot = (honeypot_check && honeypot_check.trim() !== '') || 
                  (honeypot && honeypot.trim() !== '');

    if (isBot) {
      return res.status(200).json({
        success: true,
        message: 'Arizangiz qabul qilindi'
      });
    }

    // 4. Atrof-muhit o'zgaruvchilari (Environment Variables) tekshiruvi
    const botToken = process.env.BOT_TOKEN;
    const chatId = process.env.CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Xatolik: BOT_TOKEN yoki CHAT_ID muhit o\'zgaruvchisi topilmadi.');
      return res.status(500).json({
        success: false,
        error: 'Server sozlamalarida xatolik: Telegram ma\'lumotlari sozlanmagan'
      });
    }

    // 5. Validatsiya tekshiruvlari
    // Ism tekshiruvi (kamida 2 ta belgi)
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Ism kamida 2 ta belgidan iborat bo\'lishi shart'
      });
    }

    // Telefon raqami tekshiruvi (faqat raqamlari kamida 9 ta bo'lishi kerak)
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (!phone || phoneDigits.length < 9) {
      return res.status(400).json({
        success: false,
        error: 'Telefon raqami to\'g\'ri kiritilishi shart'
      });
    }

    // Xizmat nomi
    const formattedService = SERVICE_NAMES[service] || service || 'Ko\'rsatilmagan';
    const cleanMessage = (message && message.trim()) ? message.trim() : 'Mavjud emas';

    // 6. Telegram xabari matnini shakllantirish
    const telegramText = 
`🔔 <b>Yangi ariza</b>

👤 <b>Ism:</b> ${escapeHtml(name.trim())}
📞 <b>Telefon:</b> ${escapeHtml(phone.trim())}
💼 <b>Xizmat:</b> ${escapeHtml(formattedService)}
📝 <b>Izoh:</b> ${escapeHtml(cleanMessage)}`;

    // 7. Telegram Bot API ga so'rov yuborish (faqat Node.js fetch yordamida)
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: telegramText,
        parse_mode: 'HTML'
      })
    });

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramResult.ok) {
      console.error('Telegram API xatoligi:', telegramResult);
      return res.status(502).json({
        success: false,
        error: 'Telegram botiga xabar yetkazishda xatolik yuz berdi'
      });
    }

    // 8. Muvaffaqiyatli yakun
    return res.status(200).json({
      success: true,
      message: 'Arizangiz muvaffaqiyatli qabul qilindi! Tez orada mutaxassisimiz siz bilan bog\'lanadi.'
    });

  } catch (error) {
    console.error('Kutilmagan server xatoligi:', error);
    return res.status(500).json({
      success: false,
      error: 'Serverda kutilmagan ichki xatolik yuz berdi'
    });
  }
}

