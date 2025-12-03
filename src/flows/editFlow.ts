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
  getLogsByReport,
} from '../db';
import { EditContext, DialogState } from '../types';
import { CalculationService } from '../services/CalculationService';
import { getFlowKeyboard } from '../utils/keyboards';
import { AdminPanel } from '../admin/adminPanel';
import { getMoscowDate } from '../utils/dateTime';
import { calculateBonusByTargets } from '../utils/bonusTarget';

export class EditFlow {
  /**
   * Форматирует дату из YYYY-MM-DD в DD.MM.YYYY
   */
  private static formatDateShort(dateString: string): string {
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
  }

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
    const today = getMoscowDate();
    
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
    
    // Получаем уникальные сочетания "Фамилия Имя", чтобы отсечь однофамильцев
    const uniqueNames = [...new Set(allReports.map(r => `${r.lastname} ${r.firstname}`))].sort();
    
    // Формируем клавиатуру с фамилией и именем
    // В callback_data передаем полное имя, пробелы заменяем на подчеркивания
    const keyboard = uniqueNames.map(fullName => [
      {
        text: fullName,
        callback_data: `edit_lastname_${fullName.replace(/\s+/g, '_')}`,
      },
    ]);
    
    await ctx.reply('Выберите фамилию сотрудника:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Обрабатывает выбор фамилии для редактирования
   * @param fullName - полное имя в формате "Фамилия Имя" (может быть передано с подчеркиванием)
   */
  static async handleLastnameSelection(ctx: Context, userId: string, fullName: string) {
    const user = await getUserById(userId);
    const isAdmin = user ? AdminPanel.isAdmin(user) : false;
    const today = getMoscowDate();
    
    // Восстанавливаем пробелы из callback_data и разбираем Фамилию/Имя
    const normalizedName = fullName.replace(/_/g, ' ');
    const [lastname, firstname] = normalizedName.split(' ').filter(Boolean);
    
    // Получаем площадки пользователя
    const sites = await getSitesByDateForUser(today, userId, isAdmin);
    
    // Получаем все отчеты с этой фамилией и именем по площадкам пользователя
    const allReports: any[] = [];
    for (const site of sites) {
      const siteReports = await getReportsBySite(site.id, site.date);
      const filteredReports = siteReports.filter(r =>
        r.lastname.toLowerCase() === lastname.toLowerCase() &&
        (!firstname || r.firstname.toLowerCase() === firstname.toLowerCase())
      );
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
    
    // Если несколько, показываем список для выбора:
    // "Фамилия Имя - Название площадки - 03.12.2025"
    const keyboard = await Promise.all(
      allReports.map(async (report) => {
        const site = await getSiteById(report.site_id);
        const siteName = site?.name || 'неизвестная площадка';
        const formattedDate = this.formatDateShort(report.date);
        return [
          {
            text: `${report.lastname} ${report.firstname} - ${siteName} - ${formattedDate}`,
            callback_data: `select_report_${report.id}`,
          },
        ];
      })
    );
    
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
    const today = getMoscowDate();
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
      {
        text: `${site.name} - ${this.formatDateShort(site.date)}`,
        callback_data: `select_site_edit_${site.id}`,
      },
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
    
    // Получаем площадку (для проверки доступа и отображения названия)
    const site = await getSiteById(siteId);
    const siteName = site?.name || 'неизвестная площадка';
    
    // Проверяем доступ: для не-админов разрешаем редактирование только своего объекта
    if (!isAdmin) {
      if (!site || site.responsible_user_id !== userId) {
        await ctx.editMessageText('❌ У вас нет доступа к редактированию этой площадки');
        await clearSession(userId);
        return;
      }
    }
    
    const today = getMoscowDate();
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
        text: `${report.lastname} ${report.firstname} - ${siteName} - ${this.formatDateShort(report.date)}`,
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
   * Начинает редактирование отчета - показывает меню параметров
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
      current_field: undefined,
      field_index: undefined,
    };
    
    await createOrUpdateSession(userId, 'edit_field', {
      flow: 'edit',
      editContext,
      originalReport: report,
    });
    
    // Показываем меню параметров
    await this.showFieldMenu(ctx, userId, report);
  }

  /**
   * Показывает меню выбора параметров для редактирования
   */
  static async showFieldMenu(ctx: Context, userId: string, report: any) {
    try {
      if (!report || !report.id) {
        console.error('[EditFlow] showFieldMenu - invalid report:', report);
        await ctx.reply('❌ Ошибка: отчет не найден');
        return;
      }
      
      console.log('[EditFlow] showFieldMenu - report.id:', report.id);
      
      const fields = [
        { key: 'lastname', label: 'Фамилия', value: report.lastname },
        { key: 'firstname', label: 'Имя', value: report.firstname },
        { key: 'qr_number', label: '№ QR', value: report.qr_number },
        { key: 'qr_amount', label: 'Сумма по QR', value: report.qr_amount, isAmount: true },
        { key: 'cash_amount', label: 'Сумма наличных', value: report.cash_amount, isAmount: true },
        { key: 'terminal_amount', label: 'Сумма по терминалу', value: report.terminal_amount, isAmount: true },
        { key: 'comment', label: 'Комментарий', value: report.comment },
      ];
      
      const keyboard = fields.map(field => {
        const rawValue = field.value;
        const hasValue =
          rawValue !== null &&
          rawValue !== undefined &&
          String(rawValue).trim() !== '';
        
        let displayValue: string;
        if (field.isAmount) {
          displayValue = typeof rawValue === 'number'
            ? CalculationService.formatAmount(rawValue as number)
            : 'нет значения';
        } else {
          displayValue = hasValue ? String(rawValue) : 'нет значения';
        }
        
        // Ограничиваем длину значения для кнопки (макс 30 символов)
        const truncatedValue = displayValue.length > 30 
          ? displayValue.substring(0, 27) + '...' 
          : displayValue;
        
        const callbackData = `edit_field_${field.key}__${report.id}`;
        console.log('[EditFlow] showFieldMenu - callback_data:', callbackData);
        
        return [{
          text: `${field.label}: ${truncatedValue}`,
          callback_data: callbackData,
        }];
      });
      
      // Добавляем кнопку "История изменений"
      keyboard.push([{
        text: '📝 История изменений',
        callback_data: `view_logs_${report.id}`,
      }]);
      
      // Добавляем кнопку "Завершить"
      keyboard.push([{
        text: '✅ Завершить редактирование',
        callback_data: `finish_editing_${report.id}`,
      }]);
      
      await ctx.reply('Выберите параметр для редактирования:', {
        reply_markup: {
          inline_keyboard: keyboard,
        } as any,
      });
    } catch (error) {
      console.error('[EditFlow] showFieldMenu - error:', error);
      throw error;
    }
  }

  /**
   * Обрабатывает выбор поля для редактирования
   */
  static async handleFieldSelection(ctx: Context, userId: string, reportId: string, fieldKey: string) {
    try {
      console.log('[EditFlow] handleFieldSelection - fieldKey:', fieldKey, 'reportId:', reportId, 'userId:', userId);
      
      const session = await getSession(userId);
      if (!session) {
        console.error('[EditFlow] Session not found for userId:', userId);
        await ctx.answerCbQuery('❌ Сессия не найдена');
        await ctx.reply('❌ Сессия не найдена. Пожалуйста, начните редактирование заново.');
        return;
      }
      
      if (!session.context || !session.context.originalReport) {
        console.error('[EditFlow] originalReport not found in session. Session context:', session.context);
        await ctx.answerCbQuery('❌ Отчет не найден в сессии');
        await ctx.reply('❌ Отчет не найден в сессии. Пожалуйста, начните редактирование заново.');
        return;
      }
      
      const report = session.context.originalReport;
      const fields = [
        { key: 'lastname', label: 'Фамилия', value: report.lastname },
        { key: 'firstname', label: 'Имя', value: report.firstname },
        { key: 'qr_number', label: '№ QR', value: report.qr_number },
        { key: 'qr_amount', label: 'Сумма по QR', value: report.qr_amount, isAmount: true },
        { key: 'cash_amount', label: 'Сумма наличных', value: report.cash_amount, isAmount: true },
        { key: 'terminal_amount', label: 'Сумма по терминалу', value: report.terminal_amount, isAmount: true },
        { key: 'comment', label: 'Комментарий', value: report.comment },
      ];
      
      console.log('[EditFlow] Available fields:', fields.map(f => f.key));
      console.log('[EditFlow] Looking for field:', fieldKey);
      
      const selectedField = fields.find(f => f.key === fieldKey);
      if (!selectedField) {
        console.error('[EditFlow] Field not found. fieldKey:', fieldKey, 'Available keys:', fields.map(f => f.key));
        await ctx.answerCbQuery('❌ Поле не найдено');
        await ctx.reply('❌ Поле не найдено');
        return;
      }
      
      // Обновляем контекст редактирования
      if (!session.context.editContext) {
        console.error('[EditFlow] editContext not found in session');
        await ctx.answerCbQuery('❌ Контекст редактирования не найден');
        await ctx.reply('❌ Контекст редактирования не найден. Пожалуйста, начните редактирование заново.');
        return;
      }
      
      const editContext: EditContext = session.context.editContext;
      editContext.current_field = fieldKey;
      
      await createOrUpdateSession(userId, 'edit_field', {
        ...session.context,
        editContext,
      });
      
      // Показываем текущее значение и запрашиваем новое
      const rawValue = selectedField.value;
      const hasValue =
        rawValue !== null &&
        rawValue !== undefined &&
        String(rawValue).trim() !== '';

      const displayValue = selectedField.isAmount
        ? typeof rawValue === 'number'
          ? CalculationService.formatAmount(rawValue as number)
          : '<i>Значения нет❗</i>'
        : hasValue
        ? String(rawValue)
        : '<i>Значения нет❗</i>';

      const keyboard = getFlowKeyboard();
      
      // Пытаемся обновить сообщение, если не получается - отправляем новое
      try {
        await ctx.editMessageText(
          `Текущее значение ${selectedField.label}: ${displayValue}\n` +
          `Введите новое значение или нажмите "Далее":`,
          {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup as any,
          }
        );
        await ctx.answerCbQuery();
      } catch (editError: any) {
        // Если не удалось обновить сообщение (например, оно уже изменено), отправляем новое
        console.warn('[EditFlow] Failed to edit message, sending new one:', editError.message);
        await ctx.reply(
          `Текущее значение ${selectedField.label}: ${displayValue}\n` +
          `Введите новое значение или нажмите "Далее":`,
          {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup as any,
          }
        );
        await ctx.answerCbQuery();
      }
    } catch (error) {
      console.error('[EditFlow] handleFieldSelection - error:', error);
      await ctx.answerCbQuery('❌ Ошибка при обработке');
      throw error; // Пробрасываем дальше для глобального обработчика
    }
  }
  
  /**
   * Обрабатывает редактирование поля
   */
  static async handleFieldEdit(ctx: Context, userId: string, newValue?: string) {
    const session = await getSession(userId);
    if (!session || !session.context.originalReport) return;
    
    const report = session.context.originalReport;
    const editContext: EditContext = session.context.editContext;
    const fieldKey = editContext.current_field;
    
    if (!fieldKey) {
      await ctx.reply('❌ Поле не выбрано');
      return;
    }
    
    const fields = [
      { key: 'lastname', label: 'Фамилия', value: report.lastname },
      { key: 'firstname', label: 'Имя', value: report.firstname },
      { key: 'qr_number', label: '№ QR', value: report.qr_number },
      { key: 'qr_amount', label: 'Сумма по QR', value: report.qr_amount, isAmount: true },
      { key: 'cash_amount', label: 'Сумма наличных', value: report.cash_amount, isAmount: true },
      { key: 'terminal_amount', label: 'Сумма по терминалу', value: report.terminal_amount, isAmount: true },
      { key: 'comment', label: 'Комментарий', value: report.comment },
    ];
    
    const currentField = fields.find(f => f.key === fieldKey);
    if (!currentField) {
      await ctx.reply('❌ Поле не найдено');
      return;
    }
    
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
      
      // Обновляем сессию с новым значением
      await createOrUpdateSession(userId, 'edit_field', {
        ...session.context,
        originalReport: report,
      });
    }
    
    // Очищаем текущее поле и возвращаемся в меню
    editContext.current_field = undefined;
    await createOrUpdateSession(userId, 'edit_field', {
      ...session.context,
      editContext,
    });
    
    // Возвращаемся в меню параметров
    await ctx.reply('✅ Параметр обновлен');
    await this.showFieldMenu(ctx, userId, report);
  }

  /**
   * Завершает редактирование и сохраняет отчет
   */
  static async finishEditing(ctx: Context, userId: string, reportId: string) {
    const session = await getSession(userId);
    if (!session || !session.context.originalReport) {
      await ctx.reply('❌ Сессия не найдена');
      return;
    }
    
    const report = session.context.originalReport;
    await this.saveEditedReport(ctx, userId, report);
  }

  /**
   * Показывает историю изменений отчета
   */
  static async showReportLogs(ctx: Context, userId: string, reportId: string) {
    const report = await getReportById(reportId);
    if (!report) {
      await ctx.reply('❌ Отчет не найден');
      return;
    }
    
    const logs = await getLogsByReport(reportId);
    
    // Фильтруем только логи редактирования полей
    const editLogs = logs.filter(log => log.action_type === 'field_edited');
    
    if (editLogs.length === 0) {
      await ctx.reply('📝 История изменений пуста. Этот отчет еще не редактировался.');
      return;
    }
    
    let message = `📝 История изменений отчета:\n`;
    message += `Сотрудник: ${report.lastname} ${report.firstname}\n`;
    message += `Дата: ${this.formatDateShort(report.date)}\n\n`;
    message += `Всего изменений: ${editLogs.length}\n\n`;
    
    for (const log of editLogs) {
      const user = await getUserById(log.user_id);
      const username = user?.username || `ID: ${user?.telegram_id}` || 'Неизвестный';
      
      const fieldLabel = this.getFieldLabel(log.payload_before?.field || '');
      const oldValue = this.formatFieldValue(log.payload_before?.field, log.payload_before?.old_value);
      const newValue = this.formatFieldValue(log.payload_before?.field, log.payload_before?.new_value);
      
      const timestamp = new Date(log.timestamp);
      const formattedDate = timestamp.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      
      message += `🕐 ${formattedDate}\n`;
      message += `👤 ${username}\n`;
      message += `📝 ${fieldLabel}:\n`;
      message += `   Было: ${oldValue}\n`;
      message += `   Стало: ${newValue}\n\n`;
    }
    
    // Разбиваем сообщение на части, если оно слишком длинное
    const maxLength = 4000; // Telegram ограничение
    if (message.length > maxLength) {
      const parts = [];
      let currentPart = message.split('\n\n')[0] + '\n\n';
      
      for (let i = 1; i < message.split('\n\n').length; i++) {
        const block = message.split('\n\n')[i];
        if ((currentPart + block + '\n\n').length > maxLength) {
          parts.push(currentPart);
          currentPart = block + '\n\n';
        } else {
          currentPart += block + '\n\n';
        }
      }
      parts.push(currentPart);
      
      for (const part of parts) {
        await ctx.reply(part);
      }
    } else {
      await ctx.reply(message);
    }
    
    // Возвращаемся в меню редактирования
    const session = await getSession(userId);
    if (session && session.context.originalReport) {
      await this.showFieldMenu(ctx, userId, session.context.originalReport);
    }
  }

  /**
   * Получает читаемое название поля
   */
  private static getFieldLabel(fieldKey: string): string {
    const labels: Record<string, string> = {
      lastname: 'Фамилия',
      firstname: 'Имя',
      qr_number: '№ QR',
      qr_amount: 'Сумма по QR',
      cash_amount: 'Сумма наличных',
      terminal_amount: 'Сумма по терминалу',
      comment: 'Комментарий',
      bonus_penalty: 'Бонус/штраф',
    };
    return labels[fieldKey] || fieldKey;
  }

  /**
   * Форматирует значение поля для отображения
   */
  private static formatFieldValue(fieldKey: string, value: any): string {
    if (value === null || value === undefined || value === '') {
      return '<пусто>';
    }
    
    // Для денежных полей используем форматирование
    if (fieldKey === 'qr_amount' || fieldKey === 'cash_amount' || fieldKey === 'terminal_amount' || fieldKey === 'bonus_penalty') {
      return typeof value === 'number' 
        ? CalculationService.formatAmount(value)
        : String(value);
    }
    
    return String(value);
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
    
    // Получаем площадку для пересчета бонусов по планкам
    const site = await getSiteById(report.site_id);
    if (!site) {
      await ctx.reply('❌ Ошибка: площадка не найдена');
      return;
    }
    
    // Пересчитываем бонусы по планкам с учетом новой выручки
    const bonusByTargets = calculateBonusByTargets(calculations.total_revenue, site.bonus_target);
    
    // Пересчитываем "Нал в конверте" с учетом всех бонусов/штрафов
    const cash_in_envelope = CalculationService.calculateCashInEnvelope(
      report.cash_amount,
      bonusByTargets, // Используем пересчитанное значение
      report.bonus_penalty || 0,
      report.responsible_salary_bonus || 0,
      report.best_revenue_bonus || 0
    );
    
    const updatedReport = {
      ...report,
      ...calculations,
      bonus_by_targets: bonusByTargets, // Обновляем бонусы по планкам
      cash_in_envelope, // Используем пересчитанное значение
    };
    
    await updateReport(updatedReport);
    await createLog(userId, 'field_edited', null, { report_id: report.id, action: 'report_updated' });
    await clearSession(userId);
    
    await ctx.reply('✅ Отчет успешно обновлен!');
  }
}

