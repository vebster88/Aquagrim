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
import { getFlowKeyboard, getConfirmKeyboard, getMainKeyboard } from '../utils/keyboards';

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
      await createLog(userId, 'evening_fill_started', null, { site_id: sites[0].id });
      await ctx.reply('Введите фамилию сотрудника:', getFlowKeyboard());
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
    
    // Получаем информацию о площадке для отображения названия
    const site = await getSiteById(siteId);
    const siteName = site?.name || 'неизвестная площадка';
    
    // Редактируем сообщение с выбором площадки и отправляем новое с запросом фамилии
    try {
      await ctx.editMessageText(`Площадка выбрана: ${siteName}`);
    } catch (e) {
      // Если не удалось отредактировать (например, сообщение уже отредактировано), игнорируем
    }
    await ctx.reply('Введите фамилию сотрудника:', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод фамилии
   */
  static async handleLastname(ctx: Context, userId: string, lastname: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, lastname: lastname.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_firstname', context);
    
    await ctx.reply('Введите имя сотрудника:', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод имени
   */
  static async handleFirstname(ctx: Context, userId: string, firstname: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, firstname: firstname.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_qr_number', context);
    
    await ctx.reply('Введите № QR:', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод номера QR
   */
  static async handleQrNumber(ctx: Context, userId: string, qrNumber: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, qr_number: qrNumber.trim() } };
    await createOrUpdateSession(userId, 'evening_fill_qr_amount', context);
    
    await ctx.reply('Введите сумму по QR (в рублях, например: 1000):', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод суммы по QR
   */
  static async handleQrAmount(ctx: Context, userId: string, input: string) {
    const amount = CalculationService.parseAmount(input);
    
    if (amount === null) {
      await ctx.reply('❌ Пожалуйста, введите корректное число (например: 1000)', getFlowKeyboard());
      return;
    }
    
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, qr_amount: amount } };
    await createOrUpdateSession(userId, 'evening_fill_cash_amount', context);
    
    await ctx.reply('Введите сумму наличных (в рублях):', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод суммы наличных
   */
  static async handleCashAmount(ctx: Context, userId: string, input: string) {
    const amount = CalculationService.parseAmount(input);
    
    if (amount === null) {
      await ctx.reply('❌ Пожалуйста, введите корректное число (например: 1000)', getFlowKeyboard());
      return;
    }
    
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, cash_amount: amount } };
    await createOrUpdateSession(userId, 'evening_fill_terminal_amount', context);
    
    await ctx.reply('Введите сумму по терминалу (в рублях, или нажмите "Далее" чтобы пропустить):', getFlowKeyboard());
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
        await ctx.reply('❌ Пожалуйста, введите корректное число или нажмите "Далее"', getFlowKeyboard());
        return;
      }
      terminalAmount = amount;
    }
    
    const context = { ...session.context, report: { ...session.context.report, terminal_amount: terminalAmount } };
    await createOrUpdateSession(userId, 'evening_fill_comment', context);
    
    await ctx.reply('Введите комментарий по итогам дня (или нажмите "Далее" чтобы пропустить):', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод комментария или пропуск и переходит к подтверждению
   */
  static async handleComment(ctx: Context, userId: string, comment?: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, report: { ...session.context.report, comment: comment?.trim() || undefined } };
    await createOrUpdateSession(userId, 'evening_fill_confirm', context);
    
    const siteId = session.context.site_id;
    const reportData = context.report;
    const site = await getSiteById(siteId);
    
    if (!site) {
      await ctx.reply('❌ Ошибка: площадка не найдена', getFlowKeyboard());
      await clearSession(userId);
      return;
    }
    
    // Выполняем расчеты для предпросмотра
    const calculations = CalculationService.calculate({
      qr_amount: reportData.qr_amount,
      cash_amount: reportData.cash_amount,
      terminal_amount: reportData.terminal_amount,
      bonus_target: site.bonus_target,
    });
    
    // Формируем сводку данных для подтверждения
    const summary = 
      `📋 Проверьте введенные данные:\n\n` +
      `🏢 Площадка: ${site.name}\n` +
      `👤 Сотрудник: ${reportData.lastname} ${reportData.firstname}\n` +
      `📱 № QR: ${reportData.qr_number}\n` +
      `💳 Сумма по QR: ${CalculationService.formatAmount(reportData.qr_amount)}\n` +
      `💵 Сумма наличных: ${CalculationService.formatAmount(reportData.cash_amount)}\n` +
      (reportData.terminal_amount ? `💳 Сумма по терминалу: ${CalculationService.formatAmount(reportData.terminal_amount)}\n` : '') +
      (reportData.comment ? `📝 Комментарий: ${reportData.comment}\n` : '') +
      `\n📊 Расчеты:\n` +
      `💰 Выручка: ${CalculationService.formatAmount(calculations.total_revenue)}\n` +
      `💼 Зарплата: ${CalculationService.formatAmount(calculations.salary)}\n` +
      `📈 Оборот: ${CalculationService.formatAmount(calculations.total_daily)}\n` +
      `💵 Нал в конверте: ${CalculationService.formatAmount(calculations.cash_in_envelope)}\n\n` +
      `Нажмите "✅ Ок" для сохранения или "⬅️ Назад" для редактирования.`;
    
    await ctx.reply(summary, getConfirmKeyboard());
  }
  
  /**
   * Подтверждает и сохраняет отчет
   */
  static async handleConfirm(ctx: Context, userId: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const siteId = session.context.site_id;
    const reportData = session.context.report;
    const site = await getSiteById(siteId);
    
    if (!site) {
      await ctx.reply('❌ Ошибка: площадка не найдена', getFlowKeyboard());
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
    
    // Создаем отчет (подписи не заполняются, остаются null)
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
      signature: undefined, // Не заполняется
      responsible_signature: undefined, // Не заполняется
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
      `⚠️ Пожалуйста, проверьте соответствие сумм с отчетом.`,
      getMainKeyboard()
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
      'evening_fill_confirm',
    ];
    
    const currentIndex = stateOrder.indexOf(session.state);
    if (currentIndex > 0) {
      const prevState = stateOrder[currentIndex - 1];
      await createOrUpdateSession(userId, prevState, session.context);
      
      // Если возвращаемся из состояния подтверждения, показываем сводку заново
      if (prevState === 'evening_fill_confirm') {
        const siteId = session.context.site_id;
        const reportData = session.context.report;
        const site = await getSiteById(siteId);
        
        if (site) {
          const calculations = CalculationService.calculate({
            qr_amount: reportData.qr_amount,
            cash_amount: reportData.cash_amount,
            terminal_amount: reportData.terminal_amount,
            bonus_target: site.bonus_target,
          });
          
          const summary = 
            `📋 Проверьте введенные данные:\n\n` +
            `🏢 Площадка: ${site.name}\n` +
            `👤 Сотрудник: ${reportData.lastname} ${reportData.firstname}\n` +
            `📱 № QR: ${reportData.qr_number}\n` +
            `💳 Сумма по QR: ${CalculationService.formatAmount(reportData.qr_amount)}\n` +
            `💵 Сумма наличных: ${CalculationService.formatAmount(reportData.cash_amount)}\n` +
            (reportData.terminal_amount ? `💳 Сумма по терминалу: ${CalculationService.formatAmount(reportData.terminal_amount)}\n` : '') +
            (reportData.comment ? `📝 Комментарий: ${reportData.comment}\n` : '') +
            `\n📊 Расчеты:\n` +
            `💰 Выручка: ${CalculationService.formatAmount(calculations.total_revenue)}\n` +
            `💼 Зарплата: ${CalculationService.formatAmount(calculations.salary)}\n` +
            `📈 Оборот: ${CalculationService.formatAmount(calculations.total_daily)}\n` +
            `💵 Нал в конверте: ${CalculationService.formatAmount(calculations.cash_in_envelope)}\n\n` +
            `Нажмите "✅ Ок" для сохранения или "⬅️ Назад" для редактирования.`;
          
          await ctx.reply(summary, getConfirmKeyboard());
          return;
        }
      }
      
      const messages: Partial<Record<DialogState, string>> = {
        evening_fill_lastname: 'Введите фамилию сотрудника:',
        evening_fill_firstname: 'Введите имя сотрудника:',
        evening_fill_qr_number: 'Введите № QR:',
        evening_fill_qr_amount: 'Введите сумму по QR:',
        evening_fill_cash_amount: 'Введите сумму наличных:',
        evening_fill_terminal_amount: 'Введите сумму по терминалу:',
        evening_fill_comment: 'Введите комментарий по итогам дня (или нажмите "Далее" чтобы пропустить):',
      };
      
      await ctx.reply(messages[prevState] || 'Вернулись на предыдущий шаг', getFlowKeyboard());
    } else {
      await ctx.reply('Вы на первом шаге');
    }
  }
}

