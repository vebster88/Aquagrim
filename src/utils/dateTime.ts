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

/**
 * Парсит дату из формата ДД.ММ.ГГГГ в YYYY-MM-DD
 * @param dateString - дата в формате ДД.ММ.ГГГГ
 * @returns дата в формате YYYY-MM-DD или null, если формат неверный
 */
export function parseDate(dateString: string): string | null {
  const trimmed = dateString.trim();
  
  // Проверяем формат ДД.ММ.ГГГГ
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return null;
  }
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  
  // Проверяем валидность даты
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) {
    return null;
  }
  
  // Форматируем в YYYY-MM-DD
  const formattedMonth = month.toString().padStart(2, '0');
  const formattedDay = day.toString().padStart(2, '0');
  
  // Проверяем, что дата действительно валидна (например, 31.02.2024 не валидна)
  const date = new Date(`${year}-${formattedMonth}-${formattedDay}`);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return null;
  }
  
  return `${year}-${formattedMonth}-${formattedDay}`;
}

