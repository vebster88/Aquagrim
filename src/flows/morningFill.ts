/**
 * Поток утреннего заполнения площадки
 */

import { Context } from 'telegraf';
import {
  getUserByTelegramId,
  createOrUpdateSession,
  createSite,
  createLog,
  getSession,
  clearSession,
} from '../db';
import { DialogState } from '../types';

export class MorningFillFlow {
  /**
   * Начинает процесс утреннего заполнения
   */
  static async start(ctx: Context, userId: string) {
    await createOrUpdateSession(userId, 'morning_fill_site_name', {
      flow: 'morning',
      site: {},
    });
    
    await createLog(userId, 'morning_fill_started');
    
    await ctx.reply('Введите название площадки:');
  }
  
  /**
   * Обрабатывает ввод названия площадки
   */
  static async handleSiteName(ctx: Context, userId: string, siteName: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, site: { ...session.context.site, name: siteName } };
    await createOrUpdateSession(userId, 'morning_fill_bonus_target', context);
    
    await ctx.reply('Введите бонусную планку (в рублях, например: 1000 или 1000.50):');
  }
  
  /**
   * Обрабатывает ввод бонусной планки
   */
  static async handleBonusTarget(ctx: Context, userId: string, input: string) {
    // Валидация: только цифры
    const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    
    if (isNaN(num) || num < 0) {
      await ctx.reply('❌ Пожалуйста, введите корректное число (например: 1000 или 1000.50)');
      return;
    }
    
    const bonusTarget = Math.round(num * 100); // в копейках
    
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, site: { ...session.context.site, bonus_target: bonusTarget } };
    await createOrUpdateSession(userId, 'morning_fill_phone', context);
    
    await ctx.reply('Введите номер телефона ответственной:');
  }
  
  /**
   * Обрабатывает ввод телефона
   */
  static async handlePhone(ctx: Context, userId: string, phone: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const user = await getUserByTelegramId(ctx.from?.id || 0);
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const site = await createSite({
      name: session.context.site.name,
      responsible_user_id: userId,
      bonus_target: session.context.site.bonus_target,
      phone: phone.trim(),
      date: today,
      status: 'morning_filled',
    });
    
    await createLog(userId, 'morning_fill_completed', null, { site_id: site.id });
    await clearSession(userId);
    
    await ctx.reply(
      `✅ Утреннее заполнение завершено!\n\n` +
      `Площадка: ${site.name}\n` +
      `Дата: ${today}\n` +
      `Бонусная планка: ${(site.bonus_target / 100).toFixed(2)} ₽`
    );
  }
  
  /**
   * Обрабатывает шаг с возможностью пропуска
   */
  static async handleNext(ctx: Context, userId: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    switch (session.state) {
      case 'morning_fill_phone':
        // Для телефона можно использовать номер из профиля пользователя
        const user = await getUserByTelegramId(ctx.from?.id || 0);
        if (user?.phone) {
          await this.handlePhone(ctx, userId, user.phone);
        } else {
          await ctx.reply('Пожалуйста, введите номер телефона или используйте кнопку "Отмена"');
        }
        break;
      default:
        await ctx.reply('Пожалуйста, введите значение или используйте кнопку "Отмена"');
    }
  }
}

