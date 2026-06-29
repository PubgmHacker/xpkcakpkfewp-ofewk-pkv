# 🚀 RaveClone — Деплой на Railway + сборка .ipa для iPhone

> Полный гайд: от локального проекта до работающего приложения на реальном iPhone.
> Время: **~30 минут** (включая ожидание сборок).

---

## Архитектура после деплоя

```
iPhone (мобильный интернет / любой Wi-Fi)
    │
    ▼
┌─────────────────────────────────────────┐
│  Railway (raveclone-production.up.railway.app)  │
│  ├─ Node.js бэкенд (Fastify + WebSocket)        │
│  ├─ PostgreSQL (встроенная)                     │
│  └─ Redis (через Upstash, бесплатно)            │
└─────────────────────────────────────────┘
```

Бэкенд доступен из интернета 24/7. Приложение собирается в .ipa через EAS Build
и устанавливается на iPhone. **Никакого localhost, общего Wi-Fi или Expo Go.**

---

## Часть 1 — Деплой бэкенда на Railway

### Шаг 1.1 — Регистрация на Railway

1. Откройте https://railway.app
2. Нажмите **Login** → **Login with GitHub** (используйте ваш GitHub-аккаунт)
3. Авторизуйте Railway в GitHub

### Шаг 1.2 — Запушить проект на GitHub

Если проект ещё не на GitHub:

```bash
cd /Users/hellcart/ZCodeProject/RaveClone
git init
git add .
git commit -m "Ready for Railway deploy"
```

Создайте репозиторий на https://github.com/new (название: `raveclone`), затем:

```bash
git remote add origin https://github.com/ВАШ_НИК/raveclone.git
git branch -M main
git push -u origin main
```

### Шаг 1.3 — Создать проект на Railway

1. На Railway.app нажмите **New Project**
2. Выберите **Deploy from GitHub repo**
3. Выберите ваш репозиторий `raveclone`
4. Railway начнёт сборку автоматически

⚠️ **Важно:** Railway определит папку `server/` автоматически (там есть `package.json`).
Если спросит — укажите **Root Directory: `server`**.

### Шаг 1.4 — Добавить PostgreSQL

1. В проекте нажмите **+ New → Database → PostgreSQL**
2. Railway создаст базу и даст `DATABASE_URL` автоматически

### Шаг 1.5 — Добавить Redis (бесплатно через Upstash)

Railway не имеет встроенного Redis. Используем Upstash (бесплатный тариф):

1. Откройте https://upstash.com → зарегистрируйтесь
2. Нажмите **Create Database**
3. Имя: `raveclone`, регион: ближайший к вам
4. Скопируйте **REST URL** (вида `redis://default:xxx@xxx.upstash.io:6379`)

### Шаг 1.6 — Настроить переменные окружения

В Railway → ваш сервис (backend) → вкладка **Variables**:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | *(автоматически из PostgreSQL, не трогать)* |
| `REDIS_URL` | `redis://default:xxx@xxx.upstash.io:6379` *(из Upstash)* |
| `JWT_SECRET` | `любой-случайный-набор-из-64-символов` |
| `CORS_ORIGIN` | `*` |
| `PORT` | `3000` *(или не указывать — Railway даст свой)* |

### Шаг 1.7 — Получить URL бэкенда

1. В Railway → сервис backend → вкладка **Settings**
2. Нажмите **Generate Domain**
3. Вы получите URL вида: `raveclone-production.up.railway.app`

Проверьте, что бэкенд работает:

```bash
curl https://raveclone-production.up.railway.app/health
# → {"status":"ok",...}
```

---

## Часть 2 — Настройка мобильного приложения

### Шаг 2.1 — Вписать Railway URL в config

Откройте `mobile/src/config/index.ts` и замените URL на ваш:

```typescript
// Строка ~16
const PROD_URL = "https://raveclone-production.up.railway.app";
//                 ↑ замените на ваш URL из Railway
```

### Шаг 2.2 — Запушить изменения

```bash
cd /Users/hellcart/ZCodeProject/RaveClone
git add mobile/src/config/index.ts
git commit -m "Set production backend URL"
git push
```

---

## Часть 3 — Сборка .ipa через EAS Build

### Шаг 3.1 — Установить EAS CLI

```bash
npm install --global eas-cli
```

### Шаг 3.2 — Войти в Expo аккаунт

```bash
cd /Users/hellcart/ZCodeProject/RaveClone/mobile
eas login
```

Создайте аккаунт на https://expo.dev/signup (бесплатно), если его нет.

### Шаг 3.3 — Инициализировать EAS проект

```bash
eas build:configure
```

Это создаст `eas.json` (уже есть) и привяжет проект к Expo.

### Шаг 3.4 — Запустить сборку .ipa

```bash
eas build --profile preview --platform ios
```

**Что произойдёт:**
1. EAS спросит ваш Apple ID и Team ID
2. Отправит код в облако Expo (~10-15 минут сборки)
3. Создаст `.ipa` с подписью ad-hoc (можно установить на свой iPhone)

### Шаг 3.5 — Установить на iPhone

После завершения сборки EAS даст ссылку вида:
`https://expo.dev/artifacts/eas/xxxxx.ipa`

**Способ A — через Diawi (проще всего):**
1. Скачайте `.ipa` по ссылке
2. Загрузите на https://diawi.com
3. Отсканируйте QR-код камерой iPhone → установите

**Способ B — через Xcode:**
1. Скачайте `.ipa`
2. Подключите iPhone кабелем к Mac
3. Xcode → Window → Devices and Simulators
4. Перетащите `.ipa` на ваш iPhone

**Способ C — через TestFlight (нужен Apple Developer $99/год):**
1. `eas submit --profile production --platform ios`
2. EAS загрузит сборку в App Store Connect
3. Откройте TestFlight на iPhone → установите

---

## Часть 4 — Проверка

После установки приложения на iPhone:

1. Откройте RaveClone на iPhone
2. Нажмите **«Продолжить как гость»**
3. Должен пройти гостевой вход (бэкенд уже на Railway)
4. Откроется главный экран со списком комнат
5. Создайте комнату → добавьте видео → наслаждайтесь!

---

## Частые проблемы

### Railway: сборка падает

Проверьте логи: Railway → сервис → **Deploy Logs**.
Чаще всего проблема в переменных окружения (нет DATABASE_URL или REDIS_URL).

### Railway: «Application failed to respond»

Бэкенд стартует на порту из `PORT`. Railway сам пробрасывает порт — не указывайте
его вручную в настройках. Переменная `PORT` должна быть только если Railway её не дал.

### Приложение: «Network request failed»

1. Проверьте, что URL в `config/index.ts` правильный (с `https://`)
2. Проверьте, что бэкенд отвечает: `curl https://ваш-url/health`
3. Убедитесь, что сборка .ipa была сделана ПОСЛЕ изменения config

### EAS Build: нужна Apple Team

Для профиля `preview` (ad-hoc) достаточно бесплатного Apple ID.
Для `production` (TestFlight/App Store) нужен платный аккаунт разработчика ($99/год).

---

## Структура файлов деплоя

```
RaveClone/
├── RAILWAY_DEPLOY.md              ← этот файл
├── docker-compose.quickstart.yml  ← локальный Docker (для разработки)
│
├── server/
│   ├── railway.json               ← конфиг Railway (startCommand: tsx)
│   ├── Dockerfile                 ← Docker образ (Debian slim + Prisma)
│   ├── package.json               ← tsx в dependencies (для прода)
│   └── src/config/index.ts        ← CORS: * (разрешает мобильные запросы)
│
└── mobile/
    ├── eas.json                   ← EAS Build профили (development/preview/production)
    └── src/config/index.ts        ← PROD_URL: Railway, DEV_URL: localhost
```

---

## Чек-лист готовности

- [ ] Проект запушен на GitHub
- [ ] Railway проект создан, бэкенд задеплоен
- [ ] PostgreSQL добавлен на Railway
- [ ] Redis добавлен через Upstash
- [ ] Переменные окружения настроены (DATABASE_URL, REDIS_URL, JWT_SECRET)
- [ ] Railway URL получен (raveclone-production.up.railway.app)
- [ ] URL вписан в `mobile/src/config/index.ts`
- [ ] Изменения запушены в GitHub
- [ ] EAS Build запущен (`eas build --profile preview --platform ios`)
- [ ] .ipa скачан и установлен на iPhone
- [ ] Гостевой вход работает!
