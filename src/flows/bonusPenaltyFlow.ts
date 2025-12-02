/**
 * Поток начисления бонусов/штрафов сотрудникам
 */

import { Context } from 'telegraf';
import {
  getSession,
  createOrUpdateSession,
  clearSession,
  getSitesByDate,
  getReportsBySite,
  getSiteById,
  getReportById,
  updateReport,
  createLog,
} from '../db';
import { CalculationService } from '../services/CalculationService';
import { getFlowKeyboard, getMainKeyboard } from '../utils/keyboards';

export class BonusPenaltyFlow {
  /**
   * Начинает процесс начисления бонуса/штрафа
   */
  static async start(ctx: Context, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const sites = await getSitesByDate(today);
    
    if (sites.length === 0) {
      await ctx.reply('❌ На сегодня нет заполненных площадок.');
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
    
    await createOrUpdateSession(userId, 'bonus_input_amount', {
      flow: 'bonus',
      site_id: session.context.site_id,
      report_id: reportId,
    });
    
    // Редактируем сообщение с выбором сотрудника
    try {
      await ctx.editMessageText(`Сотрудник выбран: ${report.lastname} ${report.firstname}`);
    } catch (e) {
      // Если не удалось отредактировать, игнорируем
    }
    
    await ctx.reply(
      `Введите сумму бонуса (положительное число) или штрафа (отрицательное число, например: -500):\n\n` +
      `Текущий бонус/штраф: ${report.bonus_penalty ? (report.bonus_penalty > 0 ? '+' : '') + CalculationService.formatAmount(report.bonus_penalty) : '0.00 ₽'}`,
      getFlowKeyboard()
    );
  }
  
  /**
   * Обрабатывает ввод суммы бонуса/штрафа
   */
  static async handleAmount(ctx: Context, userId: string, input: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const amount = CalculationService.parseAmount(input);
    
    if (amount === null) {
      await ctx.reply(
        '❌ Пожалуйста, введите корректное число.\n' +
        'Для бонуса: положительное число (например: 500)\n' +
        'Для штрафа: отрицательное число (например: -500)',
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
    
    // Обновляем bonus_penalty (добавляем к существующему значению)
    const currentBonusPenalty = report.bonus_penalty || 0;
    const newBonusPenalty = currentBonusPenalty + amount;
    
    // Обновляем отчет
    await updateReport({
      ...report,
      bonus_penalty: newBonusPenalty,
    });
    
    await createLog(userId, 'bonus_penalty_added', null, {
      report_id: reportId,
      amount,
      total_bonus_penalty: newBonusPenalty,
    });
    
    await clearSession(userId);
    
    const amountText = amount > 0 
      ? `бонус +${CalculationService.formatAmount(amount)}`
      : `штраф ${CalculationService.formatAmount(amount)}`;
    
    await ctx.reply(
      `✅ ${amountText} начислен сотруднику ${report.lastname} ${report.firstname}!\n\n` +
      `Общий бонус/штраф: ${newBonusPenalty > 0 ? '+' : ''}${CalculationService.formatAmount(newBonusPenalty)}`,
      getMainKeyboard()
    );
  }
}

