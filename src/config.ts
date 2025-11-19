/**
 * Конфигурация приложения
 */

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  kvUrl: process.env.KV_REST_API_URL || '',
  kvToken: process.env.KV_REST_API_TOKEN || '',
  superadminIds: (process.env.SUPERADMIN_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id)),
  salaryPercent: 0.2, // 20% от выручки
  port: parseInt(process.env.PORT || '3000'),
};

export function isSuperadmin(telegramId: number): boolean {
  return config.superadminIds.includes(telegramId);
}

