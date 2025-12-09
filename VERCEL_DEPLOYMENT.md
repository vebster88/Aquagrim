# Инструкция по диагностике проблем с деплоем на Vercel

## Проверка основных настроек

### 1. Переменные окружения в Vercel

Убедитесь, что в Vercel Dashboard → Settings → Environment Variables добавлены:

- `BOT_TOKEN` - токен Telegram бота
- `KV_REST_API_URL` - URL вашего Vercel KV
- `KV_REST_API_TOKEN` - токен Vercel KV
- `SUPERADMIN_IDS` - ID супер-админов через запятую (например: `123456789,987654321`)

**Важно:** Переменные должны быть добавлены для всех окружений (Production, Preview, Development).

### 2. Подключение Vercel KV

1. Vercel Dashboard → Storage
2. Убедитесь, что Vercel KV создан и подключен к проекту
3. Скопируйте `KV_REST_API_URL` и `KV_REST_API_TOKEN` из настроек KV

### 3. Проверка логов деплоя

1. Vercel Dashboard → Deployments
2. Откройте последний деплой
3. Проверьте Build Logs на наличие ошибок

**Типичные ошибки:**
- `Module not found` - проблема с импортами
- `Environment variable not found` - не настроены переменные окружения
- `Build failed` - ошибка компиляции TypeScript

### 4. Проверка структуры проекта

Убедитесь, что структура проекта правильная:

```
Aquagrim/
├── api/
│   └── webhook.ts          # Vercel Function
├── src/
│   ├── bot.ts
│   ├── config.ts
│   └── ...
├── package.json
├── tsconfig.json
└── vercel.json
```

### 5. Проверка вебхука Telegram

После успешного деплоя настройте вебхук:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://your-project.vercel.app/api/webhook"
```

Замените:
- `<BOT_TOKEN>` на ваш токен бота
- `your-project.vercel.app` на ваш домен Vercel

### 6. Проверка работы функции

Проверьте, что функция доступна:

```bash
curl https://your-project.vercel.app/api/webhook
```

Должен вернуться `405 Method Not Allowed` (это нормально, функция принимает только POST).

## Типичные проблемы и решения

### Проблема: "Module not found: Can't resolve '../src/bot'"

**Решение:**
Vercel автоматически компилирует TypeScript в папке `api/`. Убедитесь, что:
1. Файл `api/webhook.ts` существует
2. Импорты используют относительные пути: `../src/bot`
3. В `tsconfig.json` не исключена папка `api`

### Проблема: "Environment variable BOT_TOKEN is not defined"

**Решение:**
1. Vercel Dashboard → Settings → Environment Variables
2. Добавьте все необходимые переменные
3. Передеплойте проект

### Проблема: "Build failed" или ошибки TypeScript

**Решение:**
1. Проверьте логи сборки в Vercel Dashboard
2. Убедитесь, что проект собирается локально: `npm run build`
3. Проверьте, что все зависимости установлены

### Проблема: Функция возвращает 500 ошибку

**Решение:**
1. Проверьте логи функции в Vercel Dashboard → Functions → Logs
2. Убедитесь, что переменные окружения настроены
3. Проверьте, что Vercel KV подключен

### Проблема: Деплой не запускается автоматически при push

**Решение:**
1. Vercel Dashboard → Settings → Git
2. Убедитесь, что репозиторий подключен
3. Проверьте вебхуки в GitHub: Settings → Webhooks
4. Переподключите репозиторий, если нужно

## Проверка локальной сборки

Перед деплоем убедитесь, что проект собирается локально:

```bash
# Установка зависимостей
npm install

# Сборка проекта
npm run build

# Проверка типов
npm run type-check
```

Если сборка проходит успешно локально, но не работает на Vercel, проблема скорее всего в:
- Переменных окружения
- Настройках Vercel KV
- Конфигурации проекта в Vercel

## Полезные команды

### Проверка переменных окружения локально

Создайте файл `.env.local` (не коммитьте в git):

```env
BOT_TOKEN=your_token_here
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token
SUPERADMIN_IDS=123456789
```

### Тестирование вебхука локально

Используйте Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

Это запустит локальный сервер с поддержкой Vercel Functions.

## Контакты для поддержки

Если проблема не решается:
1. Проверьте логи в Vercel Dashboard
2. Проверьте документацию Vercel: https://vercel.com/docs
3. Создайте issue в репозитории с описанием проблемы и логами

