# Быстрый старт

## 1. Установка зависимостей

```bash
npm install
```

## 2. Настройка переменных окружения

Создайте файл `.env`:

```env
BOT_TOKEN=your_telegram_bot_token_here
KV_REST_API_URL=your_vercel_kv_rest_api_url
KV_REST_API_TOKEN=your_vercel_kv_rest_api_token
SUPERADMIN_IDS=123456789,987654321
PORT=3000
```

### Как получить BOT_TOKEN:

1. Откройте [@BotFather](https://t.me/botfather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте полученный токен

### Как получить Vercel KV credentials:

1. Создайте проект на [Vercel](https://vercel.com)
2. Перейдите в настройки проекта → Storage
3. Создайте KV Database
4. Скопируйте `KV_REST_API_URL` и `KV_REST_API_TOKEN`

## 3. Локальный запуск

```bash
npm run dev
```

Бот будет работать в режиме polling (опрос Telegram API).

## 4. Деплой на Vercel

### 4.1. Установка Vercel CLI

```bash
npm i -g vercel
```

### 4.2. Деплой

```bash
vercel --prod
```

### 4.3. Настройка переменных окружения в Vercel

1. Перейдите в настройки проекта на Vercel
2. Добавьте переменные окружения:
   - `BOT_TOKEN`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `SUPERADMIN_IDS`

### 4.4. Настройка вебхука

После деплоя получите URL вашего проекта (например: `https://your-project.vercel.app`)

Настройте вебхук:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://your-project.vercel.app/api/webhook"
```

Или используйте браузер:

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/webhook
```

## 5. Проверка работы

1. Откройте вашего бота в Telegram
2. Отправьте `/start`
3. Вы должны увидеть главное меню с кнопками

## 6. Настройка супер-админа

В файле `.env` укажите ваш Telegram ID в `SUPERADMIN_IDS`.

Чтобы узнать свой Telegram ID:
1. Откройте [@userinfobot](https://t.me/userinfobot)
2. Отправьте `/start`
3. Скопируйте ваш ID

## Возможные проблемы

### Ошибка подключения к KV

Убедитесь, что:
- Переменные окружения `KV_REST_API_URL` и `KV_REST_API_TOKEN` установлены
- Vercel KV создан и активен
- Учетные данные правильные

### Бот не отвечает

1. Проверьте, что `BOT_TOKEN` правильный
2. Убедитесь, что вебхук настроен (для продакшена)
3. Проверьте логи в Vercel Dashboard

### Ошибки компиляции TypeScript

```bash
npm run build
```

Проверьте ошибки в выводе.

