/**
 * Админская панель
 */

import { Context } from 'telegraf';
import {
  getUserByTelegramId,
  getSitesByDate,
  getReportsBySite,
  getReportById,
  getUserById,
  updateUser,
  createLog,
  getSiteById,
  getLogsByReport,
} from '../db';
import { UserRole } from '../types';
import { PDFService } from '../services/PDFService';
import { CalculationService } from '../services/CalculationService';
import { getMoscowDate } from '../utils/dateTime';

export class AdminPanel {
  /**
   * Проверяет, является ли пользователь админом
   */
  static isAdmin(user: { role: UserRole }): boolean {
    return user.role === 'admin' || user.role === 'superadmin';
  }
  
  /**
   * Показывает главное меню админа
   */
  static async showMainMenu(ctx: Context, userId: string) {
    const user = await getUserById(userId);
    if (!user || !this.isAdmin(user)) {
      await ctx.reply('❌ У вас нет прав доступа');
      return;
    }
    
    const keyboard = [
      [{ text: '📊 Посмотреть площадки', callback_data: 'admin_view_sites' }],
      [{ text: '📄 Получить PDF отчета', callback_data: 'admin_get_pdf' }],
      [{ text: '📝 История изменений отчета', callback_data: 'admin_view_logs' }],
    ];
    
    if (user.role === 'superadmin') {
      keyboard.push(
        [{ text: '➕ Добавить админа', callback_data: 'admin_add_admin' }],
        [{ text: '➖ Убрать админа', callback_data: 'admin_remove_admin' }]
      );
    }
    
    await ctx.reply('Админ-панель:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Показывает список площадок за сегодня
   */
  static async viewSites(ctx: Context) {
    const today = getMoscowDate();
    const sites = await getSitesByDate(today);
    
    if (sites.length === 0) {
      await ctx.reply('На сегодня нет площадок');
      return;
    }
    
    let message = `📊 Площадки на ${today}:\n\n`;
    
    for (const site of sites) {
      const reports = await getReportsBySite(site.id, today);
      message += `📍 ${site.name}\n`;
      message += `Статус: ${this.getStatusText(site.status)}\n`;
      message += `Отчетов: ${reports.length}\n`;
      if (reports.length > 0) {
        const totalRevenue = reports.reduce((sum, r) => sum + r.total_revenue, 0);
        message += `Общая выручка: ${CalculationService.formatAmount(totalRevenue)}\n`;
      }
      message += '\n';
    }
    
    await ctx.reply(message);
  }
  
  /**
   * Обрабатывает запрос PDF отчета
   */
  static async handleGetPDF(ctx: Context) {
    const today = getMoscowDate();
    const sites = await getSitesByDate(today);
    
    if (sites.length === 0) {
      await ctx.reply('На сегодня нет площадок');
      return;
    }
    
    const keyboard = sites.map(site => [
      { text: site.name, callback_data: `admin_pdf_site_${site.id}` },
    ]);
    
    await ctx.reply('Выберите площадку для генерации PDF:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
  
  /**
   * Генерирует и отправляет PDF для площадки
   */
  static async generatePDF(ctx: Context, siteId: string, userId: string) {
    const site = await getSiteById(siteId);
    if (!site) {
      await ctx.reply('❌ Площадка не найдена');
      return;
    }
    
    const reports = await getReportsBySite(siteId, site.date);
    
    if (reports.length === 0) {
      await ctx.reply('❌ Отчеты по этой площадке не найдены');
      return;
    }
    
    try {
      const pdfBuffer = await PDFService.generateSiteSummaryPDF(site, reports);
      
      await ctx.replyWithDocument(
        {
          source: pdfBuffer,
          filename: `summary_${site.name}_${site.date}.pdf`,
        },
        {
          caption: `Сводный отчет по площадке: ${site.name} - ${site.date}`,
        }
      );
      
      await createLog(userId, 'pdf_generated', null, { site_id: siteId, reports_count: reports.length });
    } catch (error) {
      console.error('Error generating site summary PDF:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.reply(
        `❌ Ошибка при генерации сводного PDF по площадке\n` +
        `Ошибка: ${errorMessage}`
      );
    }
  }
  
  /**
   * Обрабатывает добавление админа (только для superadmin)
   */
  static async handleAddAdmin(ctx: Context, userId: string) {
    const user = await getUserById(userId);
    if (!user || user.role !== 'superadmin') {
      await ctx.reply('❌ Только супер-админ может добавлять админов');
      return;
    }
    
    await ctx.reply('Введите Telegram ID или username (например: 123456789 или @username) пользователя, которого нужно сделать админом:');
    // Состояние будет обработано в основном боте
  }
  
  /**
   * Добавляет админа по Telegram ID
   */
  static async addAdmin(ctx: Context, adminUserId: string, superadminId: string) {
    const superadmin = await getUserById(superadminId);
    if (!superadmin || superadmin.role !== 'superadmin') {
      await ctx.reply('❌ Только супер-админ может добавлять админов');
      return;
    }
    
    const targetUser = await getUserById(adminUserId);
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    if (targetUser.role === 'admin' || targetUser.role === 'superadmin') {
      await ctx.reply('Пользователь уже является админом');
      return;
    }
    
    await updateUser({ ...targetUser, role: 'admin' });
    await createLog(superadminId, 'admin_added', { user_id: adminUserId, old_role: targetUser.role }, { user_id: adminUserId, new_role: 'admin' });
    
    await ctx.reply(`✅ Пользователь ${targetUser.username || targetUser.telegram_id} теперь админ`);
  }
  
  /**
   * Обрабатывает удаление админа (только для superadmin)
   */
  static async handleRemoveAdmin(ctx: Context, userId: string) {
    const user = await getUserById(userId);
    if (!user || user.role !== 'superadmin') {
      await ctx.reply('❌ Только супер-админ может убирать роли админов');
      return;
    }
    
    await ctx.reply('Введите Telegram ID или username (например: 123456789 или @username) пользователя, у которого нужно убрать роль админа:');
    // Состояние будет обработано в основном боте
  }
  
  /**
   * Убирает роль админа по Telegram ID
   */
  static async removeAdmin(ctx: Context, adminUserId: string, superadminId: string) {
    const superadmin = await getUserById(superadminId);
    if (!superadmin || superadmin.role !== 'superadmin') {
      await ctx.reply('❌ Только супер-админ может убирать роли админов');
      return;
    }
    
    const targetUser = await getUserById(adminUserId);
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    if (targetUser.role === 'user') {
      await ctx.reply('Пользователь уже является обычным пользователем');
      return;
    }
    
    if (targetUser.role === 'superadmin') {
      await ctx.reply('❌ Нельзя убрать роль у супер-админа');
      return;
    }
    
    const oldRole = targetUser.role;
    await updateUser({ ...targetUser, role: 'user' });
    await createLog(superadminId, 'admin_removed', { user_id: adminUserId, old_role: oldRole }, { user_id: adminUserId, new_role: 'user' });
    
    await ctx.reply(`✅ Роль админа убрана у пользователя ${targetUser.username || targetUser.telegram_id}. Теперь он обычный пользователь`);
  }
  
  /**
   * Обрабатывает запрос истории изменений отчета
   */
  static async handleViewLogs(ctx: Context) {
    const today = getMoscowDate();
    const sites = await getSitesByDate(today);
    
    if (sites.length === 0) {
      await ctx.reply('На сегодня нет площадок');
      return;
    }
    
    const keyboard = sites.map(site => [
      { text: site.name, callback_data: `admin_logs_site_${site.id}` },
    ]);
    
    await ctx.reply('Выберите площадку для просмотра истории изменений:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  /**
   * Показывает список отчетов площадки для выбора истории
   */
  static async handleSiteLogsSelection(ctx: Context, siteId: string) {
    const site = await getSiteById(siteId);
    if (!site) {
      await ctx.reply('❌ Площадка не найдена');
      return;
    }
    
    const reports = await getReportsBySite(siteId, site.date);
    
    if (reports.length === 0) {
      await ctx.reply('❌ Отчеты по этой площадке не найдены');
      return;
    }
    
    const keyboard = reports.map(report => [
      {
        text: `${report.lastname} ${report.firstname} - ${this.formatDateShort(report.date)}`,
        callback_data: `admin_logs_report_${report.id}`,
      },
    ]);
    
    await ctx.editMessageText('Выберите отчет для просмотра истории изменений:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  /**
   * Показывает историю изменений отчета
   */
  static async showReportLogs(ctx: Context, reportId: string) {
    const report = await getReportById(reportId);
    if (!report) {
      await ctx.reply('❌ Отчет не найден');
      return;
    }
    
    const logs = await getLogsByReport(reportId);
    
    if (logs.length === 0) {
      await ctx.reply('📝 История изменений пуста. Этот отчет еще не редактировался.');
      return;
    }
    
    // Фильтруем только логи редактирования полей
    const editLogs = logs.filter(log => log.action_type === 'field_edited');
    
    if (editLogs.length === 0) {
      await ctx.reply('📝 Нет записей об редактировании полей этого отчета.');
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
  }

  /**
   * Получает текстовое представление статуса
   */
  private static getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      morning_filled: 'Утреннее заполнение',
      evening_filled: 'Вечерний отчет',
      completed: 'Завершено',
    };
    return statusMap[status] || status;
  }

  /**
   * Форматирует дату из YYYY-MM-DD в DD.MM.YYYY
   */
  private static formatDateShort(dateString: string): string {
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
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
}

