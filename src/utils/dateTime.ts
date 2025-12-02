/**
 * Утилиты для работы с московским временем
 * Москва = UTC + 3 часа
 */

/**
 * Получает текущую дату в формате YYYY-MM-DD по московскому времени
 */
export function getMoscowDate(): string {
  const now = new Date();
  // Москва = UTC + 3 часа
  const moscowTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return moscowTime.toISOString().split('T')[0];
}

/**
 * Получает текущее время в формате ISO по московскому времени
 */
export function getMoscowISOString(): string {
  const now = new Date();
  // Москва = UTC + 3 часа
  const moscowTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return moscowTime.toISOString();
}

