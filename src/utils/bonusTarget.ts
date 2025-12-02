/**
 * Утилиты для работы с бонусными планками
 */

/**
 * Парсит строку с бонусными планками (через запятую) в массив чисел (в рублях)
 * @param input - строка вида "1000, 2000, 3000" или "1000,2000,3000"
 * @returns массив чисел в рублях или null, если парсинг не удался
 */
export function parseBonusTargets(input: string): number[] | null {
  if (!input || !input.trim()) {
    return null;
  }

  // Разделяем по запятой и обрабатываем каждое значение
  const parts = input.split(',').map(part => part.trim()).filter(part => part.length > 0);
  
  if (parts.length === 0) {
    return null;
  }

  const targets: number[] = [];
  
  for (const part of parts) {
    // Убираем пробелы
    const cleaned = part.replace(/\s/g, '');
    
    // Проверяем, что строка содержит только цифры, точку и знак минус в начале (для отрицательных чисел, хотя они не должны быть)
    // Разрешаем формат: целое число или число с десятичной частью
    if (!/^\d+(\.\d+)?$/.test(cleaned)) {
      return null; // Если содержит недопустимые символы (буквы, спецсимволы), возвращаем null
    }
    
    // Заменяем запятую на точку для десятичных чисел (если пользователь использовал запятую)
    const normalized = cleaned.replace(',', '.');
    const num = parseFloat(normalized);
    
    if (isNaN(num) || num < 0) {
      return null; // Если хотя бы одно значение некорректно, возвращаем null
    }
    
    // Округляем до 2 знаков после запятой
    targets.push(Math.round(num * 100) / 100);
  }
  
  return targets;
}

/**
 * Форматирует массив бонусных планок (в рублях) в строку для отображения
 * @param targets - массив чисел в рублях или строка с запятыми
 * @returns отформатированная строка вида "1 000.00 ₽, 2 000.00 ₽"
 */
export function formatBonusTargets(targets: number[] | string): string {
  if (typeof targets === 'string') {
    // Если это строка, парсим её
    const parsed = parseBonusTargets(targets);
    if (!parsed) {
      return targets; // Если не удалось распарсить, возвращаем как есть
    }
    targets = parsed;
  }
  
  if (!Array.isArray(targets) || targets.length === 0) {
    return '';
  }
  
  return targets
    .map(target => Math.round(target).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽')
    .join(', ');
}

/**
 * Конвертирует массив бонусных планок (в рублях) в строку для хранения
 * @param targets - массив чисел в рублях
 * @returns строка с запятыми (в рублях)
 */
export function bonusTargetsToString(targets: number[]): string {
  return targets.map(t => t.toString()).join(',');
}

/**
 * Рассчитывает бонусы по планкам: +500 рублей за каждую достигнутую планку
 * @param totalRevenue - общая выручка сотрудника (в рублях)
 * @param bonusTarget - строка с бонусными планками через запятую (в рублях)
 * @returns сумма бонусов (в рублях)
 */
export function calculateBonusByTargets(totalRevenue: number, bonusTarget: string): number {
  const targets = parseBonusTargets(bonusTarget);
  if (!targets || targets.length === 0) {
    return 0;
  }
  
  // Сортируем планки по возрастанию
  const sortedTargets = [...targets].sort((a, b) => a - b);
  
  // Считаем сколько планок достигнуто
  let achievedTargets = 0;
  for (const target of sortedTargets) {
    if (totalRevenue >= target) {
      achievedTargets++;
    } else {
      break; // Если текущая планка не достигнута, следующие тоже не достигнуты
    }
  }
  
  // +500 рублей за каждую достигнутую планку
  return achievedTargets * 500;
}

