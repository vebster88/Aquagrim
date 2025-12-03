/**
 * Поток редактирования данных
 */

import { Context } from 'telegraf';
import {
  getSession,
  createOrUpdateSession,
  clearSession,
  getReportsBySite,
  getReportById,
  getUserById,
  getSiteById,
  updateReport,
  createLog,
  getSitesByDateForUser,
} from '../db';
import { EditContext, DialogState } from '../types';
import { CalculationService } from '../services/CalculationService';
import { getFlowKeyboard } from '../utils/keyboards';
import { AdminPanel } from '../admin/adminPanel';

export class EditFlow {
  /**
   * Начинает процесс редактирования
   */
  static async start(ctx: Context, userId: string) {
    await ctx.reply('Выберите режим редактирования:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'По фамилии', callback_data: 'edit_by_lastname' }],
          [{ text: 'По площадке', callback_data: 'edit_by_site' }],
        ],
      },
    });
  }
  
  /**
   * Обрабатывает выбор режима "по фамилии"
   */
  static async handleByLastname(ctx: Context, userId: string) {
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    const today = new Date().toISOString().split('T')[0];
    
    // Получаем площадки пользователя
    const sites = await getSitesByDateForUser(today, userId, isAdmin);
    
    if (sites.length === 0) {
      if (isAdmin) {
        await ctx.reply('❌ На сегодня нет площадок');
      } else {
        await ctx.reply('❌ На сегодня нет ваших площадок');
      }
      await clearSession(userId);
      return;
    }
    
    // Собираем все отчеты по площадкам пользователя
    const allReports: any[] = [];
    for (const site of sites) {
      const siteReports = await getReportsBySite(site.id, site.date);
      allReports.push(...siteReports);
    }
    
    if (allReports.length === 0) {
      await ctx.reply('❌ На ваших площадках нет отчетов для редактирования');
      await clearSession(userId);
      return;
    }
    
    // Получаем уникальные фамилии
    const uniqueLastnames = [...new Set(allReports.map(r => r.lastname))].sort();
    
    // Формируем клавиатуру с фамилиями
    const keyboard = uniqueLastnames.map(lastname => [
      { text: lastname, callback_data: `edit_lastname_${lastname}` },
    ]);
    
    await ctx.reply('Выберите фамилию сотрудника:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Обрабатывает выбор фамилии для редактирования
   */
  static async handleLastnameSelection(ctx: Context, userId: string, lastname: string) {
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    const today = new Date().toISOString().split('T')[0];
    
    // Получаем площадки пользователя
    const sites = await getSitesByDateForUser(today, userId, isAdmin);
    
    // Получаем все отчеты с этой фамилией по площадкам пользователя
    const allReports: any[] = [];
    for (const site of sites) {
      const siteReports = await getReportsBySite(site.id, site.date);
      const filteredReports = siteReports.filter(r => r.lastname.toLowerCase() === lastname.toLowerCase());
      allReports.push(...filteredReports);
    }
    
    if (allReports.length === 0) {
      await ctx.reply('❌ Отчеты с такой фамилией не найдены');
      await clearSession(userId);
      return;
    }
    
    if (allReports.length === 1) {
      // Если один отчет, сразу начинаем редактирование
      await this.startEditingReport(ctx, userId, allReports[0].id, 'by_lastname');
      return;
    }
    
    // Если несколько, показываем список для выбора
    const keyboard = allReports.map((report) => [
      {
        text: `${report.lastname} ${report.firstname} - ${report.date}`,
        callback_data: `select_report_${report.id}`,
      },
    ]);
    
    await ctx.reply('Выберите отчет для редактирования:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  
  /**
   * Обрабатывает выбор режима "по площадке"
   */
  static async handleBySite(ctx: Context, userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    const sites = await getSitesByDateForUser(today, userId, isAdmin);
    
    if (sites.length === 0) {
      if (isAdmin) {
        await ctx.reply('❌ На сегодня нет площадок');
      } else {
        await ctx.reply('❌ На сегодня нет ваших площадок');
      }
      await clearSession(userId);
      return;
    }
    
    const keyboard = sites.map(site => [
      { text: `${site.name} - ${site.date}`, callback_data: `select_site_edit_${site.id}` },
    ]);
    
    await ctx.reply('Выберите площадку:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Обрабатывает выбор площадки для редактирования
   */
  static async handleSiteSelection(ctx: Context, userId: string, siteId: string) {
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    
    // Проверяем доступ: для не-админов разрешаем редактирование только своего объекта
    if (!isAdmin) {
      const site = await getSiteById(siteId);
      if (!site || site.responsible_user_id !== userId) {
        await ctx.editMessageText('❌ У вас нет доступа к редактированию этой площадки');
        await clearSession(userId);
        return;
      }
    }
    
    const today = new Date().toISOString().split('T')[0];
    const reports = await getReportsBySite(siteId, today);
    
    if (reports.length === 0) {
      await ctx.editMessageText('❌ Отчеты по этой площадке не найдены');
      await clearSession(userId);
      return;
    }
    
    if (reports.length === 1) {
      await this.startEditingReport(ctx, userId, reports[0].id, 'by_site');
      return;
    }
    
    const keyboard = reports.map(report => [
      {
        text: `${report.lastname} ${report.firstname} - ${report.date}`,
        callback_data: `select_report_${report.id}`,
      },
    ]);
    
    await ctx.editMessageText('Выберите отчет для редактирования:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Начинает редактирование отчета
   */
  static async startEditingReport(ctx: Context, userId: string, reportId: string, mode: 'by_lastname' | 'by_site') {
    const report = await getReportById(reportId);
    if (!report) {
      await ctx.reply('❌ Отчет не найден');
      await clearSession(userId);
      return;
    }
    
    // Проверяем доступ: для не-админов разрешаем редактирование только своего объекта
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    
    if (!isAdmin) {
      // Получаем площадку отчета
      const site = await getSiteById(report.site_id);
      if (!site || site.responsible_user_id !== userId) {
        await ctx.reply('❌ У вас нет доступа к редактированию этого отчета');
        await clearSession(userId);
        return;
      }
    }
    
    const editContext: EditContext = {
      mode,
      report_id: reportId,
      site_id: report.site_id,
      date: report.date,
      current_field: 'lastname',
      field_index: 0,
    };
    
    await createOrUpdateSession(userId, 'edit_field', {
      flow: 'edit',
      editContext,
      originalReport: report,
    });
    
    await ctx.reply(`Текущее значение Фамилия: ${report.lastname}\nВведите новое значение или нажмите "Далее":`, getFlowKeyboard());
  }
  
  /**
   * Обрабатывает редактирование поля
   */
  static async handleFieldEdit(ctx: Context, userId: string, newValue?: string) {
    const session = await getSession(userId);
    if (!session || !session.context.originalReport) return;
    
    const report = session.context.originalReport;
    const editContext: EditContext = session.context.editContext;
    const fieldIndex = editContext.field_index || 0;
    
    const fields = [
      { key: 'lastname', label: 'Фамилия', value: report.lastname },
      { key: 'firstname', label: 'Имя', value: report.firstname },
      { key: 'qr_number', label: '№ QR', value: report.qr_number },
      { key: 'qr_amount', label: 'Сумма по QR', value: report.qr_amount, isAmount: true },
      { key: 'cash_amount', label: 'Сумма наличных', value: report.cash_amount, isAmount: true },
      { key: 'terminal_amount', label: 'Сумма по терминалу', value: report.terminal_amount, isAmount: true },
      { key: 'comment', label: 'Комментарий', value: report.comment },
    ];
    
    if (fieldIndex >= fields.length) {
      // Все поля обработаны, сохраняем изменения
      await this.saveEditedReport(ctx, userId, report);
      return;
    }
    
    const currentField = fields[fieldIndex];
    let updatedValue: any = currentField.value;
    
    // Если введено новое значение
    if (newValue !== undefined && newValue.trim() !== '') {
      if (currentField.isAmount) {
        const amount = CalculationService.parseAmount(newValue);
        // Для сумм (не бонусов/штрафов) отрицательные значения недопустимы
        const isBonusPenaltyField = currentField.key === 'bonus_penalty';
        if (amount === null || (!isBonusPenaltyField && amount < 0)) {
          await ctx.reply('❌ Пожалуйста, введите корректное положительное число', getFlowKeyboard());
          return;
        }
        updatedValue = amount;
      } else {
        updatedValue = newValue.trim();
      }
      
      // Логируем изменение
      if (updatedValue !== currentField.value) {
        await createLog(userId, 'field_edited', {
          report_id: report.id,
          field: currentField.key,
          old_value: currentField.value,
          new_value: updatedValue,
        });
      }
      
      // Обновляем значение в отчете
      const reportAny = report as any;
      reportAny[currentField.key] = updatedValue;
    }
    
    // Переходим к следующему полю
    const nextIndex = fieldIndex + 1;
    editContext.field_index = nextIndex;
    editContext.current_field = nextIndex < fields.length ? fields[nextIndex].key : undefined;
    
    await createOrUpdateSession(userId, 'edit_field', {
      ...session.context,
      originalReport: report,
      editContext,
    });

    if (nextIndex < fields.length) {
      const nextField = fields[nextIndex];
      const rawValue = nextField.value;
      const hasValue =
        rawValue !== null &&
        rawValue !== undefined &&
        String(rawValue).trim() !== '';

      const displayValue = nextField.isAmount
        ? typeof rawValue === 'number'
          ? CalculationService.formatAmount(rawValue as number)
          : 'Значения нет❗'
        : hasValue
        ? String(rawValue)
        : 'Значения нет❗';

      await ctx.reply(
        `Текущее значение ${nextField.label}: ${displayValue}\n` +
        `Введите новое значение или нажмите "Далее":`,
        getFlowKeyboard()
      );
    } else {
      await ctx.reply('Все поля обработаны. Сохраняю изменения...');
      await this.saveEditedReport(ctx, userId, report);
    }
  }
  
  /**
   * Сохраняет отредактированный отчет
   */
  static async saveEditedReport(ctx: Context, userId: string, report: any) {
    // Пересчитываем значения, если изменились суммы
    const calculations = CalculationService.calculate({
      qr_amount: report.qr_amount,
      cash_amount: report.cash_amount,
      terminal_amount: report.terminal_amount,
      bonus_penalty: report.bonus_penalty,
    });
    
    const updatedReport = {
      ...report,
      ...calculations,
    };
    
    await updateReport(updatedReport);
    await createLog(userId, 'field_edited', null, { report_id: report.id, action: 'report_updated' });
    await clearSession(userId);
    
    await ctx.reply('✅ Отчет успешно обновлен!');
  }
}

