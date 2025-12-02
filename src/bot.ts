/**
 * Основной файл бота
 */

import { Telegraf, Context, Markup } from 'telegraf';
import { config, isSuperadmin } from './config';
import { initKV, getUserByTelegramId, createUser, getSession, clearSession, getUserById, createOrUpdateSession } from './db';
import { DialogState } from './types';
import { MorningFillFlow } from './flows/morningFill';
import { EveningReportFlow } from './flows/eveningReport';
import { EditFlow } from './flows/editFlow';
import { BonusPenaltyFlow } from './flows/bonusPenaltyFlow';
import { AdminPanel } from './admin/adminPanel';
import { getMainKeyboard, getFlowKeyboard, getConfirmKeyboard } from './utils/keyboards';

// Инициализация бота
const bot = new Telegraf(config.botToken);

// Инициализация KV
initKV();

// Клавиатура для навигации в процессе заполнения (экспортирована в utils/keyboards.ts)

// Middleware для получения/создания пользователя
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  
  let user = await getUserByTelegramId(ctx.from.id);
  
  if (!user) {
    // Создаем пользователя при первом обращении
    user = await createUser(
      ctx.from.id,
      ctx.from.username,
      undefined // телефон будет запрошен отдельно
    );
  }
  
  // Сохраняем пользователя в контексте
  (ctx as any).user = user;
  
  return next();
});

// Команда /start
bot.command('start', async (ctx) => {
  const user = (ctx as any).user;
  
  if (AdminPanel.isAdmin(user)) {
    // Для админов показываем админ-панель
    await AdminPanel.showMainMenu(ctx, user.id);
  }
  
  await ctx.reply(
    `Привет, ${user.username || 'пользователь'}!\n\n` +
    `Я бот для сбора отчетности аквагрима.\n` +
    `Используйте кнопки ниже для навигации.`,
    getMainKeyboard()
  );
});

// Команда /help
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📖 Помощь по использованию бота:\n\n` +
    `🌅 Заполнить площадку (утро) - утреннее заполнение площадки\n` +
    `🌆 Заполнить площадку (вечер) - вечерний отчет по площадке\n` +
    `✏️ Редактировать данные - редактирование существующих отчетов\n` +
    `💰 Начислить бонус/штраф - начисление бонусов или штрафов сотрудникам\n` +
    `ℹ️ Помощь - показать это сообщение\n` +
    `🔧 Админ-панель - доступ к административным функциям\n\n` +
    `Во время заполнения:\n` +
    `⏭️ Далее - пропустить текущий шаг (если поле необязательное)\n` +
    `⬅️ Назад - вернуться на предыдущий шаг\n` +
    `❌ Отмена - отменить заполнение`
  );
});

// Обработка кнопок
bot.hears('🌅 Заполнить площадку (утро)', async (ctx) => {
  const user = (ctx as any).user;
  await MorningFillFlow.start(ctx, user.id);
});

bot.hears('🌆 Заполнить площадку (вечер)', async (ctx) => {
  const user = (ctx as any).user;
  await EveningReportFlow.start(ctx, user.id);
});

bot.hears('✏️ Редактировать данные', async (ctx) => {
  const user = (ctx as any).user;
  await EditFlow.start(ctx, user.id);
});

bot.hears('💰 Начислить бонус/штраф', async (ctx) => {
  const user = (ctx as any).user;
  await BonusPenaltyFlow.start(ctx, user.id);
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  // Повторяем команду /help
  await ctx.reply(
    `📖 Помощь по использованию бота:\n\n` +
    `🌅 Заполнить площадку (утро) - утреннее заполнение площадки\n` +
    `🌆 Заполнить площадку (вечер) - вечерний отчет по площадке\n` +
    `✏️ Редактировать данные - редактирование существующих отчетов\n` +
    `💰 Начислить бонус/штраф - начисление бонусов или штрафов сотрудникам\n` +
    `ℹ️ Помощь - показать это сообщение\n` +
    `🔧 Админ-панель - доступ к административным функциям\n\n` +
    `Во время заполнения:\n` +
    `⏭️ Далее - пропустить текущий шаг (если поле необязательное)\n` +
    `⬅️ Назад - вернуться на предыдущий шаг\n` +
    `❌ Отмена - отменить заполнение`
  );
});

bot.hears('🔧 Админ-панель', async (ctx) => {
  const user = (ctx as any).user;
  
  if (AdminPanel.isAdmin(user)) {
    await AdminPanel.showMainMenu(ctx, user.id);
  } else {
    await ctx.reply('❌ У вас нет доступа к админ-панели');
  }
});

// Обработка кнопок навигации
bot.hears('⏭️ Далее', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session) {
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard());
    return;
  }
  
  switch (session.state) {
    case 'morning_fill_phone':
      await MorningFillFlow.handleNext(ctx, user.id);
      break;
    case 'evening_fill_terminal_amount':
      await EveningReportFlow.handleTerminalAmount(ctx, user.id);
      break;
    case 'evening_fill_comment':
      await EveningReportFlow.handleComment(ctx, user.id);
      break;
    case 'edit_field':
      await EditFlow.handleFieldEdit(ctx, user.id);
      break;
    default:
      await ctx.reply('Это поле обязательно для заполнения', getFlowKeyboard());
  }
});

bot.hears('✅ Ок', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session) {
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard());
    return;
  }
  
  if (session.state === 'evening_fill_confirm') {
    await EveningReportFlow.handleConfirm(ctx, user.id);
  } else {
    await ctx.reply('Подтверждение недоступно на этом шаге', getFlowKeyboard());
  }
});

bot.hears('⬅️ Назад', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session) {
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard());
    return;
  }
  
  if (session.state.startsWith('evening_')) {
    await EveningReportFlow.goBack(ctx, user.id);
  } else {
    await ctx.reply('Возврат назад недоступен на этом шаге', getFlowKeyboard());
  }
});

bot.hears('❌ Отмена', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session) {
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard());
    return;
  }
  
  await ctx.reply('Вы уверены, что хотите отменить заполнение?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Да, отменить', callback_data: 'confirm_cancel' }],
        [{ text: 'Нет, продолжить', callback_data: 'cancel_cancel' }],
      ],
    },
  });
});

// Обработка callback-кнопок
bot.action('confirm_cancel', async (ctx) => {
  const user = (ctx as any).user;
  await clearSession(user.id);
  await ctx.editMessageText('Заполнение отменено');
  await ctx.reply('Главное меню:', getMainKeyboard());
});

bot.action('cancel_cancel', async (ctx) => {
  await ctx.editMessageText('Продолжаем заполнение');
});

// Обработка выбора площадки для вечернего отчета
bot.action(/^select_site_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  await EveningReportFlow.handleSiteSelection(ctx, user.id, siteId);
});

// Обработка выбора площадки для редактирования
bot.action(/^select_site_edit_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  await EditFlow.handleSiteSelection(ctx, user.id, siteId);
});

// Обработка выбора отчета для редактирования
bot.action(/^select_report_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const reportId = ctx.match[1];
  const session = await getSession(user.id);
  const mode = session?.context.editContext?.mode || 'by_lastname';
  await EditFlow.startEditingReport(ctx, user.id, reportId, mode);
});

// Обработка выбора площадки для начисления бонуса/штрафа
bot.action(/^bonus_site_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  await BonusPenaltyFlow.handleSiteSelection(ctx, user.id, siteId);
});

// Обработка выбора сотрудника для начисления бонуса/штрафа
bot.action(/^bonus_employee_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const reportId = ctx.match[1];
  await BonusPenaltyFlow.handleEmployeeSelection(ctx, user.id, reportId);
});

// Обработка режима редактирования
bot.action('edit_by_lastname', async (ctx) => {
  const user = (ctx as any).user;
  await EditFlow.handleByLastname(ctx, user.id);
});

bot.action('edit_by_site', async (ctx) => {
  const user = (ctx as any).user;
  await EditFlow.handleBySite(ctx, user.id);
});

// Обработка админских действий
bot.action('admin_view_sites', async (ctx) => {
  await AdminPanel.viewSites(ctx);
});

bot.action('admin_get_pdf', async (ctx) => {
  await AdminPanel.handleGetPDF(ctx);
});

bot.action(/^admin_pdf_site_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  await AdminPanel.generatePDF(ctx, siteId, user.id);
});

bot.action('admin_add_admin', async (ctx) => {
  const user = (ctx as any).user;
  await AdminPanel.handleAddAdmin(ctx, user.id);
  // Сохраняем состояние для ввода Telegram ID
  const session = await getSession(user.id);
  if (session) {
    await createOrUpdateSession(user.id, 'admin_add_admin', { ...session.context, waiting_for_admin_id: true });
  }
});

// Обработка текстовых сообщений в зависимости от состояния
bot.on('text', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session) {
    // Если нет активной сессии, игнорируем
    return;
  }
  
  const text = ctx.message.text;
  
  // Обработка состояний утреннего заполнения
  if (session.state === 'morning_fill_site_name') {
    await MorningFillFlow.handleSiteName(ctx, user.id, text);
  } else if (session.state === 'morning_fill_bonus_target') {
    await MorningFillFlow.handleBonusTarget(ctx, user.id, text);
  } else if (session.state === 'morning_fill_responsible_lastname') {
    await MorningFillFlow.handleResponsibleLastname(ctx, user.id, text);
  } else if (session.state === 'morning_fill_responsible_firstname') {
    await MorningFillFlow.handleResponsibleFirstname(ctx, user.id, text);
  } else if (session.state === 'morning_fill_phone') {
    await MorningFillFlow.handlePhone(ctx, user.id, text);
  }
  // Обработка состояний вечернего отчета
  else if (session.state === 'evening_fill_lastname') {
    await EveningReportFlow.handleLastname(ctx, user.id, text);
  } else if (session.state === 'evening_fill_firstname') {
    await EveningReportFlow.handleFirstname(ctx, user.id, text);
  } else if (session.state === 'evening_fill_qr_number') {
    await EveningReportFlow.handleQrNumber(ctx, user.id, text);
  } else if (session.state === 'evening_fill_qr_amount') {
    await EveningReportFlow.handleQrAmount(ctx, user.id, text);
  } else if (session.state === 'evening_fill_cash_amount') {
    await EveningReportFlow.handleCashAmount(ctx, user.id, text);
  } else if (session.state === 'evening_fill_terminal_amount') {
    await EveningReportFlow.handleTerminalAmount(ctx, user.id, text);
  } else if (session.state === 'evening_fill_comment') {
    await EveningReportFlow.handleComment(ctx, user.id, text);
  }
  // Обработка редактирования
  else if (session.state === 'edit_by_lastname_input') {
    await EditFlow.handleLastnameInput(ctx, user.id, text);
  } else if (session.state === 'edit_field') {
    await EditFlow.handleFieldEdit(ctx, user.id, text);
  }
  // Обработка начисления бонуса/штрафа
  else if (session.state === 'bonus_input_amount') {
    await BonusPenaltyFlow.handleAmount(ctx, user.id, text);
  }
  // Обработка добавления админа
  else if (session.state === 'admin_add_admin' && session.context.waiting_for_admin_id) {
    const adminTelegramId = parseInt(text.trim());
    if (isNaN(adminTelegramId)) {
      await ctx.reply('❌ Пожалуйста, введите корректный Telegram ID (число)');
      return;
    }
    
    const targetUser = await getUserByTelegramId(adminTelegramId);
    if (!targetUser) {
      await ctx.reply('❌ Пользователь с таким Telegram ID не найден');
      await clearSession(user.id);
      return;
    }
    
    await AdminPanel.addAdmin(ctx, targetUser.id, user.id);
    await clearSession(user.id);
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('Error in bot:', err);
  ctx.reply('Произошла ошибка. Попробуйте еще раз или обратитесь к администратору.');
});

export { bot };

