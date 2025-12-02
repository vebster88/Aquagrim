/**
 * Поток начисления бонусов/штрафов сотрудникам
 */

import { Context } from 'telegraf';
import {
  getSession,
  createOrUpdateSession,
  clearSession,
  getSitesByDateForUser,
  getReportsBySite,
  getSiteById,
  getReportById,
  getUserById,
  updateReport,
  createLog,
} from '../db';
import { CalculationService } from '../services/CalculationService';
import { getFlowKeyboard, getMainKeyboard } from '../utils/keyboards';
import { AdminPanel } from '../admin/adminPanel';

export class BonusPenaltyFlow {
  /**
   * Начинает процесс начисления бонуса/штрафа
   */
  static async start(ctx: Context, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    const sites = await getSitesByDateForUser(today, userId, isAdmin);
    
    if (sites.length === 0) {
      if (isAdmin) {
        await ctx.reply('❌ На сегодня нет заполненных площадок.');
      } else {
        await ctx.reply('❌ На сегодня нет ваших площадок.');
      }
      return;
    }
    
    // Если площадка одна, используем её автоматически
    if (sites.length === 1) {
      await this.selectSite(ctx, userId, sites[0].id);
      return;
    }
    
    // Если несколько площадок, нужно выбрать
    const keyboard = sites.map(site => [{ text: site.name, callback_data: `bonus_site_${site.id}` }]);
    await createOrUpdateSession(userId, 'bonus_select_site', {
      flow: 'bonus',
    });
    await ctx.reply('Выберите площадку:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Обрабатывает выбор площадки
   */
  static async handleSiteSelection(ctx: Context, userId: string, siteId: string) {
    await this.selectSite(ctx, userId, siteId);
  }
  
  /**
   * Выбирает площадку и показывает список сотрудников
   */
  static async selectSite(ctx: Context, userId: string, siteId: string) {
    const today = new Date().toISOString().split('T')[0];
    const reports = await getReportsBySite(siteId, today);
    
    if (reports.length === 0) {
      await ctx.reply('❌ На этой площадке нет сотрудников за сегодня.');
      await clearSession(userId);
      return;
    }
    
    const site = await getSiteById(siteId);
    const siteName = site?.name || 'неизвестная площадка';
    
    // Редактируем сообщение с выбором площадки, если это callback
    try {
      await ctx.editMessageText(`Площадка выбрана: ${siteName}`);
    } catch (e) {
      // Если не удалось отредактировать, игнорируем
    }
    
    await createOrUpdateSession(userId, 'bonus_select_employee', {
      flow: 'bonus',
      site_id: siteId,
    });
    
    // Формируем список сотрудников
    const keyboard = reports.map(report => [
      {
        text: `${report.lastname} ${report.firstname}`,
        callback_data: `bonus_employee_${report.id}`,
      },
    ]);
    
    await ctx.reply('Выберите сотрудника:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Обрабатывает выбор сотрудника
   */
  static async handleEmployeeSelection(ctx: Context, userId: string, reportId: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    // Получаем отчет из БД
    const report = await getReportById(reportId);
    
    if (!report) {
      await ctx.reply('❌ Отчет не найден.');
      await clearSession(userId);
      return;
    }
    
    // Редактируем сообщение с выбором сотрудника
    try {
      await ctx.editMessageText(`Сотрудник выбран: ${report.lastname} ${report.firstname}`);
    } catch (e) {
      // Если не удалось отредактировать, игнорируем
    }
    
    // Если это ответственный, предлагаем выбор типа начисления
    if (report.is_responsible) {
      await createOrUpdateSession(userId, 'bonus_select_type', {
        flow: 'bonus',
        site_id: session.context.site_id,
        report_id: reportId,
      });
      
      await ctx.reply(
        `Выберите тип начисления для ответственного:\n\n` +
        `Текущий бонус/штраф: ${report.bonus_penalty ? (report.bonus_penalty > 0 ? '+' : '') + CalculationService.formatAmount(report.bonus_penalty) : '0 ₽'}\n` +
        `Текущая ЗП ответственного: ${report.responsible_salary_bonus ? CalculationService.formatAmount(report.responsible_salary_bonus) : 'не начислена'}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Начислить бонус/штраф', callback_data: `bonus_type_penalty_${reportId}` }],
              [{ text: '💼 Начислить ЗП ответственного', callback_data: `bonus_type_salary_${reportId}` }],
            ],
          },
        }
      );
    } else {
      // Для обычных сотрудников - сразу запрашиваем сумму бонуса/штрафа
      await createOrUpdateSession(userId, 'bonus_input_amount', {
        flow: 'bonus',
        site_id: session.context.site_id,
        report_id: reportId,
        bonus_type: 'penalty',
      });
      
      await ctx.reply(
        `Введите сумму бонуса (положительное число) или штрафа (отрицательное число, например: -500):\n\n` +
        `Текущий бонус/штраф: ${report.bonus_penalty ? (report.bonus_penalty > 0 ? '+' : '') + CalculationService.formatAmount(report.bonus_penalty) : '0.00 ₽'}`,
        getFlowKeyboard()
      );
    }
  }
  
  /**
   * Обрабатывает выбор типа начисления для ответственного
   */
  static async handleTypeSelection(ctx: Context, userId: string, reportId: string, type: 'penalty' | 'salary') {
    const session = await getSession(userId);
    if (!session) return;
    
    const report = await getReportById(reportId);
    if (!report) {
      await ctx.reply('❌ Отчет не найден.');
      await clearSession(userId);
      return;
    }
    
    await createOrUpdateSession(userId, 'bonus_input_amount', {
      flow: 'bonus',
      site_id: session.context.site_id,
      report_id: reportId,
      bonus_type: type,
    });
    
    try {
      await ctx.editMessageText(
        type === 'penalty'
          ? `Тип выбран: Начислить бонус/штраф`
          : `Тип выбран: Начислить ЗП ответственного`
      );
    } catch (e) {
      // Игнорируем ошибку
    }
    
    if (type === 'penalty') {
      await ctx.reply(
        `Введите сумму бонуса (положительное число в рублях) или штрафа (отрицательное число в рублях, например: -500):\n\n` +
        `Текущий бонус/штраф: ${report.bonus_penalty ? (report.bonus_penalty > 0 ? '+' : '') + CalculationService.formatAmount(report.bonus_penalty) : '0.00 ₽'}`,
        getFlowKeyboard()
      );
    } else {
      await ctx.reply(
        `Введите сумму ЗП ответственного (в рублях, например: 1500):\n\n` +
        `Текущая ЗП ответственного: ${report.responsible_salary_bonus ? CalculationService.formatAmount(report.responsible_salary_bonus) : 'не начислена'}`,
        getFlowKeyboard()
      );
    }
  }
  
  /**
   * Обрабатывает ввод суммы бонуса/штрафа или ЗП ответственного
   */
  static async handleAmount(ctx: Context, userId: string, input: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const bonusType = session.context.bonus_type || 'penalty';
    const amount = CalculationService.parseAmount(input);
    
    if (amount === null) {
      if (bonusType === 'salary') {
        await ctx.reply(
          '❌ Пожалуйста, введите корректное положительное число (например: 5000)',
          getFlowKeyboard()
        );
      } else {
        await ctx.reply(
          '❌ Пожалуйста, введите корректное число.\n' +
          'Для бонуса: положительное число (например: 500)\n' +
          'Для штрафа: отрицательное число (например: -500)',
          getFlowKeyboard()
        );
      }
      return;
    }
    
    // Для ЗП ответственного разрешаем только положительные числа
    if (bonusType === 'salary' && amount <= 0) {
      await ctx.reply(
        '❌ ЗП ответственного должна быть положительным числом (например: 5000)',
        getFlowKeyboard()
      );
      return;
    }
    
    const reportId = session.context.report_id;
    const report = await getReportById(reportId);
    
    if (!report) {
      await ctx.reply('❌ Отчет не найден.', getFlowKeyboard());
      await clearSession(userId);
      return;
    }
    
    if (bonusType === 'salary') {
      // Начисляем ЗП ответственного (заменяем значение, не добавляем)
      // Пересчитываем cash_in_envelope с учетом ЗП ответственного
      const bonusByTargets = report.bonus_by_targets || 0;
      const manualBonusPenalty = report.bonus_penalty || 0;
      const totalBonusesPenalties = bonusByTargets + manualBonusPenalty + amount;
      const cash_in_envelope = report.cash_amount - totalBonusesPenalties;
      
      await updateReport({
        ...report,
        responsible_salary_bonus: amount,
        cash_in_envelope: cash_in_envelope,
      });
      
      await createLog(userId, 'responsible_salary_added', null, {
        report_id: reportId,
        amount,
      });
      
      await clearSession(userId);
      
      const user = await getUserById(userId);
      const isAdmin = user ? AdminPanel.isAdmin(user) : false;
      await ctx.reply(
        `✅ ЗП ответственного ${CalculationService.formatAmount(amount)} начислена сотруднику ${report.lastname} ${report.firstname}!`,
        getMainKeyboard(isAdmin)
      );
    } else {
      // Обновляем bonus_penalty (добавляем к существующему значению)
      const currentBonusPenalty = report.bonus_penalty || 0;
      const newBonusPenalty = currentBonusPenalty + amount;
      
      // Рассчитываем все бонусы/штрафы для пересчета cash_in_envelope
      const bonusByTargets = report.bonus_by_targets || 0;
      const responsibleSalaryBonus = report.responsible_salary_bonus || 0;
      const totalBonusesPenalties = bonusByTargets + newBonusPenalty + responsibleSalaryBonus;
      // Нал в конверте = полученный нал - все бонусы/штрафы
      const cash_in_envelope = report.cash_amount - totalBonusesPenalties;
      
      // Обновляем отчет
      await updateReport({
        ...report,
        bonus_penalty: newBonusPenalty,
        cash_in_envelope: cash_in_envelope,
      });
      
      await createLog(userId, 'bonus_penalty_added', null, {
        report_id: reportId,
        amount,
        total_bonus_penalty: newBonusPenalty,
      });
      
      await clearSession(userId);
      
      const user = await getUserById(userId);
      const isAdmin = user ? AdminPanel.isAdmin(user) : false;
      const amountText = amount > 0 
        ? `бонус +${CalculationService.formatAmount(amount)}`
        : `штраф ${CalculationService.formatAmount(amount)}`;
      
      await ctx.reply(
        `✅ ${amountText} начислен сотруднику ${report.lastname} ${report.firstname}!\n\n` +
        `Общий бонус/штраф: ${newBonusPenalty > 0 ? '+' : ''}${CalculationService.formatAmount(newBonusPenalty)}`,
        getMainKeyboard(isAdmin)
      );
    }
  }
}

