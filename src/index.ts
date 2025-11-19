/**
 * Точка входа для локальной разработки
 */

import 'dotenv/config';
import { bot } from './bot';
import { initKV } from './db';
import { config } from './config';

// Инициализация KV
initKV();

// Запуск бота в режиме polling (для локальной разработки)
if (require.main === module) {
  bot.launch({
    webhook: {
      domain: undefined, // для локальной разработки не используем webhook
    },
  });
  
  console.log('Bot is running in polling mode...');
  
  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export { bot };

