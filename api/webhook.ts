/**
 * Vercel Function для обработки вебхука Telegram
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { bot } from '../src/bot';
import { initKV } from '../src/db';

// Инициализация KV при старте функции
initKV();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Проверка метода
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Обработка обновления от Telegram
    await bot.handleUpdate(req.body);
    
    // Отправляем успешный ответ
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

