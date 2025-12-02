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
    ];
    
    if (user.role === 'superadmin') {
      keyboard.push([{ text: '➕ Добавить админа', callback_data: 'admin_add_admin' }]);
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
    
    await ctx.reply('Введите Telegram ID пользователя, которого нужно сделать админом:');
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
}

