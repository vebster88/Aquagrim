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
import { getFlowKeyboard, getMainKeyboard } from '../utils/keyboards';
import { getUserById } from '../db';
import { AdminPanel } from '../admin/adminPanel';
import { parseBonusTargets, bonusTargetsToString, formatBonusTargets } from '../utils/bonusTarget';
import { getMoscowDate } from '../utils/dateTime';

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
    
    await ctx.reply('Введите название площадки:', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод названия площадки
   */
  static async handleSiteName(ctx: Context, userId: string, siteName: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, site: { ...session.context.site, name: siteName } };
    await createOrUpdateSession(userId, 'morning_fill_bonus_target', context);
    
    await ctx.reply(
      'Введите бонусную планку (в рублях).\n' +
      'Можно ввести несколько значений через запятую, например:\n' +
      '• 5000\n' +
      '• 5000, 10000, 20000\n',
      getFlowKeyboard()
    );
  }
  
  /**
   * Обрабатывает ввод бонусной планки (может быть несколько через запятую)
   */
  static async handleBonusTarget(ctx: Context, userId: string, input: string) {
    // Парсим строку с бонусными планками
    const targets = parseBonusTargets(input);
    
    if (!targets || targets.length === 0) {
      await ctx.reply(
        '❌ Пожалуйста, введите корректное число или несколько чисел через запятую.\n' +
        'Примеры:\n' +
        '• 5000\n' +
        '• 5000, 10000, 20000\n',
        getFlowKeyboard()
      );
      return;
    }
    
    // Конвертируем массив в строку для хранения
    const bonusTargetString = bonusTargetsToString(targets);
    
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, site: { ...session.context.site, bonus_target: bonusTargetString } };
    await createOrUpdateSession(userId, 'morning_fill_responsible_lastname', context);
    
    // Показываем подтверждение введенных значений
    const formatted = targets.map(t => t.toFixed(2)).join(', ');
    await ctx.reply(
      `✅ Бонусные планки сохранены: ${formatted} ₽\n\n` +
      `Введите фамилию ответственной:`,
      getFlowKeyboard()
    );
  }
  
  /**
   * Обрабатывает ввод фамилии ответственной
   */
  static async handleResponsibleLastname(ctx: Context, userId: string, lastname: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, site: { ...session.context.site, responsible_lastname: lastname.trim() } };
    await createOrUpdateSession(userId, 'morning_fill_responsible_firstname', context);
    
    await ctx.reply('Введите имя ответственной:', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод имени ответственной
   */
  static async handleResponsibleFirstname(ctx: Context, userId: string, firstname: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const context = { ...session.context, site: { ...session.context.site, responsible_firstname: firstname.trim() } };
    await createOrUpdateSession(userId, 'morning_fill_phone', context);
    
    await ctx.reply('Введите номер телефона ответственной:', getFlowKeyboard());
  }
  
  /**
   * Обрабатывает ввод телефона
   */
  static async handlePhone(ctx: Context, userId: string, phone: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    const user = await getUserByTelegramId(ctx.from?.id || 0);
    if (!user) return;
    
    const today = getMoscowDate(); // YYYY-MM-DD (московское время)
    
    const site = await createSite({
      name: session.context.site.name,
      responsible_user_id: userId,
      responsible_lastname: session.context.site.responsible_lastname,
      responsible_firstname: session.context.site.responsible_firstname,
      bonus_target: session.context.site.bonus_target,
      phone: phone.trim(),
      date: today,
      status: 'morning_filled',
    });
    
    await createLog(userId, 'morning_fill_completed', null, { site_id: site.id });
    await clearSession(userId);
    
    const bonusTargetsFormatted = formatBonusTargets(site.bonus_target);
    
    const currentUser = await getUserById(userId);
    const isAdmin = currentUser ? AdminPanel.isAdmin(currentUser) : false;
    await ctx.reply(
      `✅ Утреннее заполнение завершено!\n\n` +
      `Площадка: ${site.name}\n` +
      `Дата: ${today}\n` +
      `Ответственная: ${site.responsible_lastname} ${site.responsible_firstname}\n` +
      `Телефон: ${site.phone}\n` +
      `Бонусные планки: ${bonusTargetsFormatted}`,
      getMainKeyboard(isAdmin)
    );
  }
  
  /**
   * Обрабатывает шаг с возможностью пропуска
   */
  static async handleNext(ctx: Context, userId: string) {
    const session = await getSession(userId);
    if (!session) return;
    
    switch (session.state) {
      case 'morning_fill_responsible_lastname':
        await ctx.reply('Пожалуйста, введите фамилию ответственной или используйте кнопку "Отмена"');
        break;
      case 'morning_fill_responsible_firstname':
        await ctx.reply('Пожалуйста, введите имя ответственной или используйте кнопку "Отмена"');
        break;
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

