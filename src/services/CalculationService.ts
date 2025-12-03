/**
 * Сервис для автоматических расчетов
 */

import { CalculationResult } from '../types';
import { config } from '../config';

export interface CalculationInput {
  qr_amount: number; // в рублях
  cash_amount: number; // в рублях
  terminal_amount?: number; // в рублях
  bonus_penalty?: number; // в рублях
  bonus_target?: string | number; // строка с бонусными планками через запятую (в рублях) или число для обратной совместимости
}

export class CalculationService {
  /**
   * Рассчитывает все финансовые показатели для отчета
   */
  static calculate(input: CalculationInput): CalculationResult {
    const { qr_amount, cash_amount, terminal_amount = 0, bonus_penalty = 0 } = input;
    // bonus_target больше не используется в расчетах, но оставлен для обратной совместимости
    
    // Общая выручка (округление до целых)
    const total_revenue = Math.round(qr_amount + cash_amount + terminal_amount);
    
    // Зарплата (20% от выручки, округление до целых)
    const salary = Math.round(total_revenue * config.salaryPercent);
    
    // Зарплата ответственного (можно расширить логику)
    const responsible_salary = salary;
    
    // Общая сумма за день (оборот, округление до целых)
    const total_daily = total_revenue;
    
    // Общая сумма наличных (округление до целых)
    const total_cash = Math.round(cash_amount);
    
    // Общая сумма по QR (округление до целых)
    const total_qr = Math.round(qr_amount);
    
    // Нал в конверте НЕ рассчитывается здесь, так как требует bonus_by_targets и responsible_salary_bonus
    // Используйте calculateCashInEnvelope() для правильного расчета
    const cash_in_envelope = 0; // Временное значение, будет пересчитано отдельно
    
    return {
      total_revenue,
      salary,
      bonus_penalty,
      responsible_salary,
      total_daily,
      total_cash,
      total_qr,
      cash_in_envelope,
    };
  }

  /**
   * Рассчитывает "Нал в конверте" с учетом всех бонусов и штрафов
   * Формула: cash_amount - (bonus_by_targets + bonus_penalty + responsible_salary_bonus)
   */
  static calculateCashInEnvelope(
    cash_amount: number,
    bonus_by_targets: number = 0,
    bonus_penalty: number = 0,
    responsible_salary_bonus: number = 0
  ): number {
    const totalBonusesPenalties = bonus_by_targets + bonus_penalty + responsible_salary_bonus;
    return Math.round(cash_amount - totalBonusesPenalties);
  }
  
  /**
   * Форматирует сумму в рублях в читаемый формат (целые числа)
   */
  static formatAmount(rubles: number): string {
    return `${Math.round(rubles)} ₽`;
  }
  
  /**
   * Парсит введенную сумму в рубли (целые числа)
   * Принимает строку вида "1000.50" или "1000,50" или "1000"
   */
  static parseAmount(input: string): number | null {
    // Убираем пробелы и заменяем запятую на точку
    const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
    
    // Проверяем, что это число (разрешаем отрицательные для штрафов)
    const num = parseFloat(cleaned);
    if (isNaN(num) || !Number.isFinite(num)) {
      return null;
    }
    
    // Возвращаем рубли (округление до целых чисел)
    return Math.round(num);
  }
  
  /**
   * Валидирует ввод суммы
   */
  static validateAmount(input: string): boolean {
    const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
    return /^\d+(\.\d{1,2})?$/.test(cleaned);
  }
}

