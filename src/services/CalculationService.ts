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
    
    // Общая выручка
    const total_revenue = qr_amount + cash_amount + terminal_amount;
    
    // Зарплата (20% от выручки)
    const salary = Math.round((total_revenue * config.salaryPercent) * 100) / 100;
    
    // Зарплата ответственного (можно расширить логику)
    const responsible_salary = salary;
    
    // Общая сумма за день (оборот)
    const total_daily = total_revenue;
    
    // Общая сумма наличных
    const total_cash = cash_amount;
    
    // Общая сумма по QR
    const total_qr = qr_amount;
    
    // Нал в конверте с вычетом бонусов
    // Логика: наличные минус бонусы/штрафы
    const cash_in_envelope = cash_amount - (bonus_penalty || 0);
    
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
   * Форматирует сумму в рублях в читаемый формат
   */
  static formatAmount(rubles: number): string {
    return `${rubles.toFixed(2)} ₽`;
  }
  
  /**
   * Парсит введенную сумму в рубли
   * Принимает строку вида "1000.50" или "1000,50" или "1000"
   */
  static parseAmount(input: string): number | null {
    // Убираем пробелы и заменяем запятую на точку
    const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
    
    // Проверяем, что это число
    const num = parseFloat(cleaned);
    if (isNaN(num) || num < 0) {
      return null;
    }
    
    // Возвращаем рубли (округление до 2 знаков после запятой)
    return Math.round(num * 100) / 100;
  }
  
  /**
   * Валидирует ввод суммы
   */
  static validateAmount(input: string): boolean {
    const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
    return /^\d+(\.\d{1,2})?$/.test(cleaned);
  }
}

