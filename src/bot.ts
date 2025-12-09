/**
 * Основной файл бота
 */

import { Telegraf, Context, Markup } from 'telegraf';
import { config, isSuperadmin } from './config';
import { initKV, getUserByTelegramId, getUserByUsername, createUser, getSession, clearSession, getUserById, createOrUpdateSession, getSitesByDateForUser, getSiteById, getReportsBySite, createLog, updateUser, ensureUserUsernameIndex } from './db';
import { DialogState } from './types';
import { MorningFillFlow } from './flows/morningFill';
import { EveningReportFlow } from './flows/eveningReport';
import { EditFlow } from './flows/editFlow';
import { BonusPenaltyFlow } from './flows/bonusPenaltyFlow';
import { AdminPanel } from './admin/adminPanel';
import { getMainKeyboard, getFlowKeyboard, getConfirmKeyboard } from './utils/keyboards';
import { PDFService } from './services/PDFService';
import { getMoscowDate, parseDate } from './utils/dateTime';

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
  } else {
    // Обновляем username и индекс для существующих пользователей
    // Это нужно для старых пользователей, у которых индекс не был создан
    const usernameChanged = user.username !== ctx.from.username;
    if (usernameChanged || !user.username) {
      user.username = ctx.from.username;
      await updateUser(user);
      // Убеждаемся, что индекс создан (для старых пользователей)
      await ensureUserUsernameIndex(user);
    } else {
      // Даже если username не изменился, убеждаемся что индекс существует
      await ensureUserUsernameIndex(user);
    }
  }
  
  // Сохраняем пользователя в контексте
  (ctx as any).user = user;
  
  return next();
});

// Команда /start
bot.command('start', async (ctx) => {
  const user = (ctx as any).user;
  const isAdmin = AdminPanel.isAdmin(user);
  
  if (isAdmin) {
    // Для админов показываем админ-панель
    await AdminPanel.showMainMenu(ctx, user.id);
  }
  
  await ctx.reply(
    `Привет, ${user.username || 'пользователь'}!\n\n` +
    `Я бот для сбора отчетности аквагрима.\n` +
    `Используйте кнопки ниже для навигации.`,
    getMainKeyboard(isAdmin)
  );
});

/**
 * Формирует текст справки по использованию бота
 */
function buildHelpText(isAdmin: boolean): string {
  let helpText = `📖 Помощь по использованию бота:\n\n` +
    `🌅 Заполнить площадку (утро) - утреннее заполнение площадки\n` +
    `🌆 Заполнить площадку (вечер) - вечерний отчет по площадке\n` +
    `✏️ Редактировать данные - редактирование существующих отчетов\n` +
    `💰 Назначить ЗП ответственного/штрафы - начисление ЗП ответственного, бонусы или штрафы сотрудникам\n` +
    `ℹ️ Помощь - показать это сообщение\n`;
  
  if (isAdmin) {
    helpText += `🔧 Админ-панель - доступ к административным функциям\n\n`;
  } else {
    helpText += `📊 Сводный отчет - получить PDF сводного отчета по вашей площадке\n\n`;
  }
  
  helpText += `Во время заполнения:\n` +
    `⏭️ Далее - пропустить текущий шаг (если поле необязательное)\n` +
    `⬅️ Назад - вернуться на предыдущий шаг\n` +
    `❌ Отмена - отменить заполнение`;
  
  return helpText;
}

// Команда /help
bot.command('help', async (ctx) => {
  const user = (ctx as any).user;
  const isAdmin = AdminPanel.isAdmin(user);
  await ctx.reply(buildHelpText(isAdmin));
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

bot.hears('💰 Назначить ЗП ответственного/штрафы', async (ctx) => {
  const user = (ctx as any).user;
  await BonusPenaltyFlow.start(ctx, user.id);
});

bot.hears('👤 Заполнить следующего человека', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session || !session.context.site_id) {
    const isAdmin = AdminPanel.isAdmin(user);
    await ctx.reply('❌ Эта опция доступна только после сохранения вечернего отчета', getMainKeyboard(isAdmin));
    return;
  }
  
  await EveningReportFlow.startNextPerson(ctx, user.id);
});

bot.hears('✅ Завершить', async (ctx) => {
  const user = (ctx as any).user;
  await clearSession(user.id);
  
  const isAdmin = AdminPanel.isAdmin(user);
  await ctx.reply('✅ Работа завершена', getMainKeyboard(isAdmin));
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  const user = (ctx as any).user;
  const isAdmin = AdminPanel.isAdmin(user);
  await ctx.reply(buildHelpText(isAdmin));
});

bot.hears('🔧 Админ-панель', async (ctx) => {
  const user = (ctx as any).user;
  
  if (AdminPanel.isAdmin(user)) {
    await AdminPanel.showMainMenu(ctx, user.id);
  } else {
    await ctx.reply('❌ У вас нет доступа к админ-панели');
  }
});

// Обработка кнопки "Сводный отчет" для ответственных
bot.hears('📊 Сводный отчет', async (ctx) => {
  const user = (ctx as any).user;
  
  // Проверяем, что пользователь не админ
  if (AdminPanel.isAdmin(user)) {
    await ctx.reply('❌ Администраторы используют админ-панель для получения PDF');
    return;
  }
  
  const today = getMoscowDate();
  const sites = await getSitesByDateForUser(today, user.id, false);
  
  if (sites.length === 0) {
    await ctx.reply('❌ На сегодня нет ваших площадок');
    return;
  }
  
  // Если площадка одна, генерируем PDF сразу
  if (sites.length === 1) {
    await generateSummaryPDFForUser(ctx, user.id, sites[0].id);
    return;
  }
  
  // Если несколько площадок, предлагаем выбрать
  const keyboard = sites.map(site => [
    { text: site.name, callback_data: `user_pdf_site_${site.id}` },
  ]);
  
  await ctx.reply('Выберите площадку для генерации сводного отчета:', {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
});

// Функция для генерации PDF сводного отчета для пользователя
async function generateSummaryPDFForUser(ctx: Context, userId: string, siteId: string) {
  const site = await getSiteById(siteId);
  if (!site) {
    await ctx.reply('❌ Площадка не найдена');
    return;
  }
  
  // Проверяем, что пользователь является ответственным за эту площадку
  const user = await getUserById(userId);
  if (!user || (!AdminPanel.isAdmin(user) && site.responsible_user_id !== userId)) {
    await ctx.reply('❌ У вас нет доступа к этой площадке');
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

// Обработка кнопок навигации
bot.hears('⏭️ Далее', async (ctx) => {
  const user = (ctx as any).user;
  const session = await getSession(user.id);
  
  if (!session) {
    const user = (ctx as any).user;
    const isAdmin = AdminPanel.isAdmin(user);
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard(isAdmin));
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
    const user = (ctx as any).user;
    const isAdmin = AdminPanel.isAdmin(user);
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard(isAdmin));
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
    const user = (ctx as any).user;
    const isAdmin = AdminPanel.isAdmin(user);
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard(isAdmin));
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
    const user = (ctx as any).user;
    const isAdmin = AdminPanel.isAdmin(user);
    await ctx.reply('Нет активного процесса заполнения', getMainKeyboard(isAdmin));
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
  
  // Получаем пользователя и определяем isAdmin
  const currentUser = await getUserById(user.id);
  const isAdmin = currentUser ? AdminPanel.isAdmin(currentUser) : false;
  
  await ctx.reply('Главное меню:', getMainKeyboard(isAdmin));
});

bot.action('cancel_cancel', async (ctx) => {
  await ctx.editMessageText('Продолжаем заполнение');
});

// Обработка выбора площадки для вечернего отчета
// Обработка выбора площадки для вечернего отчета (не должен перехватывать select_site_edit_)
bot.action(/^select_site_(?!edit_)(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  await EveningReportFlow.handleSiteSelection(ctx, user.id, siteId);
});

// Обработка выбора площадки для редактирования
bot.action(/^select_site_edit_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
  console.log('[bot.ts] select_site_edit callback:', {
    callbackData,
    extractedSiteId: siteId,
    matchGroups: ctx.match,
  });
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

// Обработка выбора поля для редактирования
// Используем двойное подчеркивание __ как разделитель между fieldKey и reportId
// чтобы правильно обработать случаи, когда и fieldKey (qr_number), и reportId (report_123) содержат подчеркивания
bot.action(/^edit_field_(.+?)__(.+)$/, async (ctx) => {
  try {
    const user = (ctx as any).user;
    if (!user) {
      console.error('[bot] edit_field - user not found');
      await ctx.answerCbQuery('❌ Пользователь не найден');
      return;
    }
    
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      console.error('[bot] edit_field - callbackQuery or data not found');
      await ctx.answerCbQuery('❌ Ошибка обработки запроса');
      return;
    }
    
    // Проверяем, что ctx.match существует и содержит нужные группы
    if (!ctx.match || !ctx.match[1] || !ctx.match[2]) {
      console.error('[bot] edit_field - invalid match:', ctx.match, 'callbackData:', ctx.callbackQuery.data);
      await ctx.answerCbQuery('❌ Ошибка парсинга данных');
      return;
    }
    
    // ctx.match[1] - fieldKey (может содержать подчеркивания, например qr_number)
    // ctx.match[2] - reportId (может содержать подчеркивания, например report_123)
    const fieldKey = ctx.match[1];
    const reportId = ctx.match[2];
    
    console.log('[bot] edit_field - callbackData:', ctx.callbackQuery.data);
    console.log('[bot] edit_field - fieldKey:', fieldKey, 'reportId:', reportId);
    
    await EditFlow.handleFieldSelection(ctx, user.id, reportId, fieldKey);
  } catch (error) {
    console.error('[bot] edit_field - error:', error);
    await ctx.answerCbQuery('❌ Ошибка при обработке запроса');
    throw error; // Пробрасываем дальше для глобального обработчика
  }
});

// Обработка завершения редактирования
bot.action(/^finish_editing_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const reportId = ctx.match[1];
  await EditFlow.finishEditing(ctx, user.id, reportId);
});

// Обработка просмотра истории изменений при редактировании
bot.action(/^view_logs_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const reportId = ctx.match[1];
  
  // Обновляем сообщение, показывая выбранный параметр, и скрываем inline-кнопки
  try {
    await ctx.editMessageText(
      `✅ Выбран параметр: История изменений`,
      { reply_markup: { inline_keyboard: [] } } as any
    );
    await ctx.answerCbQuery();
  } catch (editError: any) {
    // Если не удалось обновить сообщение, просто скрываем кнопки
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] } as any);
    } catch (e) {
      // Игнорируем ошибку
    }
    await ctx.answerCbQuery();
  }
  
  await EditFlow.showReportLogs(ctx, user.id, reportId);
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

bot.action(/^bonus_type_penalty_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const reportId = ctx.match[1];
  await BonusPenaltyFlow.handleTypeSelection(ctx, user.id, reportId, 'penalty');
});

bot.action(/^bonus_type_salary_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const reportId = ctx.match[1];
  await BonusPenaltyFlow.handleTypeSelection(ctx, user.id, reportId, 'salary');
});

// Обработка режима редактирования
bot.action('edit_by_lastname', async (ctx) => {
  const user = (ctx as any).user;
  await EditFlow.handleByLastname(ctx, user.id);
});

bot.action(/^edit_lastname_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const fullName = ctx.match[1]; // Теперь передаем полное имя (может быть с подчеркиваниями)
  await EditFlow.handleLastnameSelection(ctx, user.id, fullName);
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
  const user = (ctx as any).user;
  await AdminPanel.handleGetPDF(ctx, user.id);
  
  // Сохраняем состояние для ввода даты
  const session = await getSession(user.id);
  await createOrUpdateSession(user.id, 'admin_pdf_date', {
    ...(session?.context || {}),
    waiting_for_date: true
  });
});

bot.action('admin_pdf_today', async (ctx) => {
  const user = (ctx as any).user;
  const today = getMoscowDate();
  await ctx.editMessageText(`Выбрана дата: ${today}`);
  await clearSession(user.id); // Очищаем сессию после выбора даты
  await AdminPanel.handlePDFDateSelection(ctx, user.id, today);
});

bot.action(/^admin_pdf_site_(.+?)(?:_(.+))?$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  const date = ctx.match[2]; // Опциональная дата из callback_data
  await AdminPanel.generatePDF(ctx, siteId, user.id, date);
});

bot.action(/^user_pdf_site_(.+)$/, async (ctx) => {
  const user = (ctx as any).user;
  const siteId = ctx.match[1];
  await generateSummaryPDFForUser(ctx, user.id, siteId);
});

bot.action('admin_add_admin', async (ctx) => {
  const user = (ctx as any).user;
  console.log('[BOT] admin_add_admin action, user:', user.id);

  // Используем функцию из AdminPanel для обработки
  await AdminPanel.handleAddAdmin(ctx, user.id);

  // Сохраняем состояние для ввода Telegram ID или username
  const session = await getSession(user.id);
  console.log('[BOT] Creating session for admin_add_admin, existing session:', !!session);
  await createOrUpdateSession(user.id, 'admin_add_admin', {
    ...(session?.context || {}),
    waiting_for_admin_id: true
  });
  console.log('[BOT] Session created, waiting for admin ID/username input');
});

bot.action('admin_remove_admin', async (ctx) => {
  const user = (ctx as any).user;
  console.log('[BOT] admin_remove_admin action, user:', user.id);

  // Используем функцию из AdminPanel для обработки
  await AdminPanel.handleRemoveAdmin(ctx, user.id);

  // Сохраняем состояние для ввода Telegram ID или username
  const session = await getSession(user.id);
  console.log('[BOT] Creating session for admin_remove_admin, existing session:', !!session);
  await createOrUpdateSession(user.id, 'admin_remove_admin', {
    ...(session?.context || {}),
    waiting_for_admin_id: true
  });
  console.log('[BOT] Session created, waiting for admin ID/username input');
});

bot.action('admin_view_logs', async (ctx) => {
  await AdminPanel.handleViewLogs(ctx);
});

bot.action(/^admin_logs_site_(.+)$/, async (ctx) => {
  const siteId = ctx.match[1];
  await AdminPanel.handleSiteLogsSelection(ctx, siteId);
});

bot.action(/^admin_logs_report_(.+)$/, async (ctx) => {
  const reportId = ctx.match[1];
  await AdminPanel.showReportLogs(ctx, reportId);
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
  else if (session.state === 'edit_field') {
    await EditFlow.handleFieldEdit(ctx, user.id, text);
  }
  // Обработка начисления бонуса/штрафа
  else if (session.state === 'bonus_input_amount') {
    await BonusPenaltyFlow.handleAmount(ctx, user.id, text);
  }
  // Обработка добавления админа
  else if (session.state === 'admin_add_admin' && session.context.waiting_for_admin_id) {
    console.log('[BOT] Processing admin_add_admin, text:', text);
    const input = text.trim();
    let targetTelegramId: number | undefined;
    let targetUser = null;

    // Пытаемся распарсить как Telegram ID (число)
    if (!isNaN(parseInt(input))) {
      targetTelegramId = parseInt(input);
      targetUser = await getUserByTelegramId(targetTelegramId);
    } else {
      // Пытаемся распарсить как username
      const username = input.startsWith('@') ? input.substring(1) : input;
      let apiError: any = null;
      
      try {
        // Используем Telegram Bot API для получения информации о пользователе по username
        // API требует username с @ для приватных чатов
        const chat = await ctx.telegram.getChat(`@${username}`);
        if (chat.type === 'private' && 'id' in chat && chat.id) {
          targetTelegramId = chat.id;
          targetUser = await getUserByTelegramId(targetTelegramId);
        }
      } catch (error) {
        apiError = error;
        console.error('Error getting chat by username:', error);
      }
      
      // Если не нашли через API, пытаемся найти в базе данных по username
      if (!targetUser) {
        console.log('[BOT] Trying to find user by username in database:', username);
        targetUser = await getUserByUsername(username);
        if (targetUser) {
          console.log('[BOT] Found user in database by username:', targetUser.id);
        }
      }
      
      // Если все еще не нашли, показываем понятное сообщение
      if (!targetUser && apiError) {
        const errorMessage = apiError.response?.description || apiError.message || 'Unknown error';
        console.log('[BOT] User not found via Telegram API or database:', errorMessage);
        await ctx.reply(
          '❌ Не удалось найти пользователя по username.\n\n' +
          'Возможные причины:\n' +
          '• Пользователь не зарегистрирован в боте (не писал /start)\n' +
          '• Username указан неверно или изменен\n' +
          '• Пользователь скрыл свой username\n\n' +
          '💡 Решение: используйте Telegram ID пользователя (число).\n' +
          'Чтобы узнать Telegram ID, попросите пользователя написать боту @userinfobot или используйте другой способ.'
        );
        await clearSession(user.id);
        return;
      }
    }

    if (!targetUser) {
      console.log('[BOT] User not found for input:', input);
      await ctx.reply(
        '❌ Пользователь не найден в базе данных.\n\n' +
        'Убедитесь, что:\n' +
        '1. Username или Telegram ID указаны правильно\n' +
        '2. Пользователь зарегистрирован в боте (написал /start)\n\n' +
        'Альтернатива: введите Telegram ID пользователя (число)'
      );
      await clearSession(user.id);
      return;
    }
    
    console.log('[BOT] Found user:', targetUser.id, 'Calling addAdmin...');
    await AdminPanel.addAdmin(ctx, targetUser.id, user.id);
    await clearSession(user.id);
  }
  // Обработка удаления админа
  else if (session.state === 'admin_remove_admin' && session.context.waiting_for_admin_id) {
    console.log('[BOT] Processing admin_remove_admin, text:', text);
    const input = text.trim();
    let targetTelegramId: number | undefined;
    let targetUser = null;

    // Пытаемся распарсить как Telegram ID (число)
    if (!isNaN(parseInt(input))) {
      targetTelegramId = parseInt(input);
      targetUser = await getUserByTelegramId(targetTelegramId);
    } else {
      // Пытаемся распарсить как username
      const username = input.startsWith('@') ? input.substring(1) : input;
      let apiError: any = null;
      
      try {
        // Используем Telegram Bot API для получения информации о пользователе по username
        // API требует username с @ для приватных чатов
        const chat = await ctx.telegram.getChat(`@${username}`);
        if (chat.type === 'private' && 'id' in chat && chat.id) {
          targetTelegramId = chat.id;
          targetUser = await getUserByTelegramId(targetTelegramId);
        }
      } catch (error) {
        apiError = error;
        console.error('Error getting chat by username:', error);
      }
      
      // Если не нашли через API, пытаемся найти в базе данных по username
      if (!targetUser) {
        console.log('[BOT] Trying to find user by username in database:', username);
        targetUser = await getUserByUsername(username);
        if (targetUser) {
          console.log('[BOT] Found user in database by username:', targetUser.id);
        }
      }
      
      // Если все еще не нашли, показываем понятное сообщение
      if (!targetUser && apiError) {
        const errorMessage = apiError.response?.description || apiError.message || 'Unknown error';
        console.log('[BOT] User not found via Telegram API or database:', errorMessage);
        await ctx.reply(
          '❌ Не удалось найти пользователя по username.\n\n' +
          'Возможные причины:\n' +
          '• Пользователь не зарегистрирован в боте (не писал /start)\n' +
          '• Username указан неверно или изменен\n' +
          '• Пользователь скрыл свой username\n\n' +
          '💡 Решение: используйте Telegram ID пользователя (число).\n' +
          'Чтобы узнать Telegram ID, попросите пользователя написать боту @userinfobot или используйте другой способ.'
        );
        await clearSession(user.id);
        return;
      }
    }

    if (!targetUser) {
      console.log('[BOT] User not found for input:', input);
      await ctx.reply(
        '❌ Пользователь не найден в базе данных.\n\n' +
        'Убедитесь, что:\n' +
        '1. Username или Telegram ID указаны правильно\n' +
        '2. Пользователь зарегистрирован в боте (написал /start)\n\n' +
        'Альтернатива: введите Telegram ID пользователя (число)'
      );
      await clearSession(user.id);
      return;
    }
    
    console.log('[BOT] Found user:', targetUser.id, 'Calling removeAdmin...');
    await AdminPanel.removeAdmin(ctx, targetUser.id, user.id);
    await clearSession(user.id);
  }
  // Обработка ввода даты для генерации PDF
  else if (session.state === 'admin_pdf_date' && session.context.waiting_for_date) {
    const dateString = text.trim();
    const parsedDate = parseDate(dateString);
    
    if (!parsedDate) {
      await ctx.reply(
        '❌ Неверный формат даты.\n\n' +
        'Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например: 04.12.2024)\n\n' +
        'Или нажмите кнопку "Сегодня" для генерации отчета за сегодняшний день.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Сегодня', callback_data: 'admin_pdf_today' }],
            ],
          },
        }
      );
      return;
    }
    
    await clearSession(user.id);
    await AdminPanel.handlePDFDateSelection(ctx, user.id, parsedDate);
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('Error in bot:', err);
  console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace');
  console.error('Context:', {
    updateType: ctx.updateType,
    callbackQuery: ctx.callbackQuery ? {
      data: 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : 'no data',
      id: ctx.callbackQuery.id,
    } : 'no callbackQuery',
    message: ctx.message ? {
      text: 'text' in ctx.message ? ctx.message.text : 'no text',
    } : 'no message',
  });
  
  // Пытаемся ответить пользователю
  try {
    if (ctx.callbackQuery) {
      ctx.answerCbQuery('❌ Произошла ошибка').catch(() => {});
    }
    ctx.reply('Произошла ошибка. Попробуйте еще раз или обратитесь к администратору.').catch(() => {});
  } catch (replyError) {
    console.error('Failed to send error message:', replyError);
  }
});

export { bot };

