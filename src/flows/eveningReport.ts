/**
 * Поток вечернего отчета по площадке
 */

import { Context } from 'telegraf';
import {
  getUserByTelegramId,
  createOrUpdateSession,
  getSession,
  clearSession,
  getSitesByDate,
  getReportsBySite,
  createReport,
  updateSite,
  createLog,
  getSiteById,
} from '../db';
import { DialogState } from '../types';
import { CalculationService } from '../services/CalculationService';

export class EveningReportFlow {
  /**
   * Начинает процесс вечернего отчета
   */
  static async start(ctx: Context, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const sites = await getSitesByDate(today);
    
    if (sites.length === 0) {
      await ctx.reply('❌ На сегодня нет заполненных площадок. Сначала заполните утреннюю форму.');
      return;
    }
    
    // Если площадка одна, используем её автоматически
    if (sites.length === 1) {
      await createOrUpdateSession(userId, 'evening_fill_lastname', {
        flow: 'evening',
        site_id: sites[0].id,
        report: {},
      });
      await ctx.reply('Введите фамилию сотрудника:');
      return;
    }
    
    // Если несколько площадок, нужно выбрать
    const keyboard = sites.map(site => [{ text: site.name, callback_data: `select_site_${site.id}` }]);
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
    await createOrUpdateSession(userId, 'evening_fill_lastname', {
      flow: 'evening',
      site_id: siteId,
      report: {},
    });
    
    await createLog(userId, 'evening_fill_started', null, { site_id: siteId });
    
    await ctx.editMessageText('Введите фамилию сотрудника:');
  }
  
  /**
   * Обрабатывает ввод фамилии
   */
  static async handleLastname(ctx: Context, userId: string, lastname: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, lastname: lastname.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_firstname', context);
    
    await ctx.reply('Введите имя сотрудника:');
  }
  
  /**
   * Обрабатывает ввод имени
   */
  static async handleFirstname(ctx: Context, userId: string, firstname: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, firstname: firstname.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_qr_number', context);
    
    await ctx.reply('Введите № QR:');
  }
  
  /**
   * Обрабатывает ввод номера QR
   */
  static async handleQrNumber(ctx: Context, userId: string, qrNumber: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, qr_number: qrNumber.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_qr_amount', context);
    
    await ctx.reply('Введите сумму по QR (в рублях, например: 1000 или 1000.50):');
  }
  
  /**
   * Обрабатывает ввод суммы по QR
   */
  static async handleQrAmount(ctx: Context, userId: string, input: string) {
    const amount = CalculationService.parseAmount(input);
    
    if (amount === null) {
      await ctx.reply('❌ Пожалуйста, введите корректное число (например: 1000 или 1000.50)');
      return;
    }
    
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, qr_amount: amount } };
    await createOrUpdateSession(userId, 'evening_fill_cash_amount', context);
    
    await ctx.reply('Введите сумму наличных (в рублях):');
  }
  
  /**
   * Обрабатывает ввод суммы наличных
   */
  static async handleCashAmount(ctx: Context, userId: string, input: string) {
    const amount = CalculationService.parseAmount(input);
    
    if (amount === null) {
      await ctx.reply('❌ Пожалуйста, введите корректное число (например: 1000 или 1000.50)');
      return;
    }
    
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, cash_amount: amount } };
    await createOrUpdateSession(userId, 'evening_fill_terminal_amount', context);
    
    await ctx.reply('Введите сумму по терминалу (в рублях, или нажмите "Далее" чтобы пропустить):');
  }
  
  /**
   * Обрабатывает ввод суммы по терминалу или пропуск
   */
  static async handleTerminalAmount(ctx: Context, userId: string, input?: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    let terminalAmount: number | undefined;
    
    if (input) {
      const amount = CalculationService.parseAmount(input);
      if (amount === null) {
        await ctx.reply('❌ Пожалуйста, введите корректное число или нажмите "Далее"');
        return;
      }
      terminalAmount = amount;
    }
    
    const context = { ...session.context, report: { ...session.context.report, terminal_amount: terminalAmount } };
    await createOrUpdateSession(userId, 'evening_fill_comment', context);
    
    await ctx.reply('Введите комментарий по итогам дня (или нажмите "Далее" чтобы пропустить):');
  }
  
  /**
   * Обрабатывает ввод комментария или пропуск
   */
  static async handleComment(ctx: Context, userId: string, comment?: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, comment: comment?.trim() || undefined } };
    await createOrUpdateSession(userId, 'evening_fill_signature', context);
    
    await ctx.reply('Введите подпись:');
  }
  
  /**
   * Обрабатывает ввод подписи
   */
  static async handleSignature(ctx: Context, userId: string, signature: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, signature: signature.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_responsible_signature', context);
    
    await ctx.reply('Введите подпись ответственного:');
  }
  
  /**
   * Завершает заполнение и создает отчет
   */
  static async handleResponsibleSignature(ctx: Context, userId: string, signature: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const siteId = session.context.site_id;
    const reportData = session.context.report;
    const site = await getSiteById(siteId);
    
    if (!site) {
      await ctx.reply('❌ Ошибка: площадка не найдена');
      await clearSession(userId);
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Выполняем расчеты
    const calculations = CalculationService.calculate({
      qr_amount: reportData.qr_amount,
      cash_amount: reportData.cash_amount,
      terminal_amount: reportData.terminal_amount,
      bonus_target: site.bonus_target,
    });
    
    // Создаем отчет
    const report = await createReport({
      site_id: siteId,
      date: today,
      lastname: reportData.lastname,
      firstname: reportData.firstname,
      qr_number: reportData.qr_number,
      qr_amount: reportData.qr_amount,
      cash_amount: reportData.cash_amount,
      terminal_amount: reportData.terminal_amount,
      comment: reportData.comment,
      signature: reportData.signature,
      responsible_signature: signature.trim(),
      ...calculations,
    });
    
    // Обновляем статус площадки
    await updateSite({ ...site, status: 'evening_filled' });
    
    await createLog(userId, 'evening_fill_completed', null, { report_id: report.id });
    await clearSession(userId);
    
    // Показываем краткий итог
    await ctx.reply(
      `✅ Отчет сохранен!\n\n` +
      `📊 Итоги:\n` +
      `Выручка: ${CalculationService.formatAmount(calculations.total_revenue)}\n` +
      `Зарплата: ${CalculationService.formatAmount(calculations.salary)}\n` +
      `Оборот: ${CalculationService.formatAmount(calculations.total_daily)}\n` +
      `Нал в конверте: ${CalculationService.formatAmount(calculations.cash_in_envelope)}\n\n` +
      `⚠️ Пожалуйста, проверьте соответствие сумм с отчетом.`
    );
  }
  
  /**
   * Возвращает на предыдущий шаг
   */
  static async goBack(ctx: Context, userId: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const stateOrder: DialogState[] = [
      'evening_fill_lastname',
      'evening_fill_firstname',
      'evening_fill_qr_number',
      'evening_fill_qr_amount',
      'evening_fill_cash_amount',
      'evening_fill_terminal_amount',
      'evening_fill_comment',
      'evening_fill_signature',
      'evening_fill_responsible_signature',
    ];
    
    const currentIndex = stateOrder.indexOf(session.state);
    if (currentIndex > 0) {
      const prevState = stateOrder[currentIndex - 1];
      await createOrUpdateSession(userId, prevState, session.context);
      
      const messages: Partial<Record<DialogState, string>> = {
        evening_fill_lastname: 'Введите фамилию сотрудника:',
        evening_fill_firstname: 'Введите имя сотрудника:',
        evening_fill_qr_number: 'Введите № QR:',
        evening_fill_qr_amount: 'Введите сумму по QR:',
        evening_fill_cash_amount: 'Введите сумму наличных:',
        evening_fill_terminal_amount: 'Введите сумму по терминалу:',
        evening_fill_comment: 'Введите комментарий:',
        evening_fill_signature: 'Введите подпись:',
        evening_fill_responsible_signature: 'Введите подпись ответственного:',
      };
      
      await ctx.reply(messages[prevState] || 'Вернулись на предыдущий шаг');
    } else {
      await ctx.reply('Вы на первом шаге');
    }
  }
}

