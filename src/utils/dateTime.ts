/**
 * Утилиты для работы с московским временем (UTC+3)
 */

export function getMoscowDate(): string {
  const now = new Date();
  const moscowTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC + 3 hours
  return moscowTime.toISOString().split('T')[0];
}

export function getMoscowISOString(): string {
  const now = new Date();
  const moscowTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC + 3 hours
  return moscowTime.toISOString();
}

