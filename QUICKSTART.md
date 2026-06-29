# 🚀 RaveClone — Запуск с нуля (5 шагов)

> **Цель:** запустить бэкенд + мобильное приложение на реальном iPhone через Expo Go, **без Xcode и без платного аккаунта Apple**.
>
> Время настройки: **~15 минут**.

---

## 📋 Что нужно

| Программа | Зачем | Где скачать |
|-----------|-------|-------------|
| **Node.js 20+** | Запуск Expo + бэкенда | https://nodejs.org |
| **Docker Desktop** | База данных (Postgres) + Redis | https://docker.com |
| **Expo Go** (на iPhone) | Запуск приложения на телефоне | App Store |
| **Терминал** | Ввод команд | Встроенный (macOS) / cmd (Windows) |

---

## Шаг 1 — Проверка и установка окружения

Откройте терминал и выполните команды по очереди:

### 1.1 Проверить Node.js

```bash
node --version
```

✅ Если видите `v20.x.x` или выше — всё ок.
❌ Если «command not found» — скачайте с https://nodejs.org и установите.

### 1.2 Проверить Docker

```bash
docker --version
```

✅ Если видите `Docker version 2x.x.x` — всё ок.
❌ Если «command not found» — скачайте **Docker Desktop** с https://docker.com, установите и **запустите приложение Docker** (иконка в меню-баре).

> ⚠️ Docker Desktop должен быть **запущен** (китик в меню-баре активен), иначе следующие команды не сработают.

Проверим, что Docker работает:

```bash
docker info
```

Если выводит информацию о системе — всё готово.

### 1.3 Узнать IP-адрес вашего компьютера

**Это самый важный шаг** — без него iPhone не найдёт бэкенд.

```bash
# macOS:
ipconfig getifaddr en0

# Windows (в cmd):
ipconfig
# ищите строку "IPv4 Address" → например 192.168.1.50
```

Запишите полученный IP, например: **`192.168.1.50`**

---

## Шаг 2 — Запуск Бэкенда (БД + Сервер)

### 2.1 Перейти в папку проекта

```bash
cd /Users/hellcart/ZCodeProject/RaveClone
```

*(Замените путь на тот, где находится ваш проект)*

### 2.2 Поднять базу данных и Redis одной командой

```bash
docker compose -f docker-compose.quickstart.yml up -d
```

Docker скачает образы (первый раз ~2 минуты) и запустит:
- **PostgreSQL** (база) на порту 5432
- **Redis** (кэш) на порту 6379
- **Бэкенд** (Node.js) на порту 3000

### 2.3 Проверить, что всё работает

```bash
# Статус контейнеров (все должны быть "Up"):
docker compose -f docker-compose.quickstart.yml ps

# Проверка бэкенда (должен ответить {"status":"ok"}):
curl http://localhost:3000/health
```

### 2.4 Посмотреть логи бэкенда (если что-то не работает)

```bash
docker compose -f docker-compose.quickstart.yml logs -f app
```

Нажмите `Ctrl+C` чтобы выйти из логов.

> 💡 Бэкенд автоматически накатывает миграции базы при старте (`prisma db push`),
> так что вручную ничего настраивать не нужно.

---

## Шаг 3 — Настроить IP-адрес в мобильном приложении

### 3.1 Открыть файл конфигурации

Откройте файл в любом редакторе кода (или даже в Блокноте):

```
mobile/src/config/index.ts
```

### 3.2 Вписать свой IP

Найдите строку (примерно строка 22):

```typescript
export const LOCAL_IP = "192.168.1.50";
```

Замените `192.168.1.50` на **ваш реальный IP** из Шага 1.3:

```typescript
export const LOCAL_IP = "ВАШ_IP_СЮДА";  // например: 192.168.1.50
```

Сохраните файл. **Это единственное, что нужно изменить вручную.**

---

## Шаг 4 — Запуск Expo (QR-код)

### 4.1 Перейти в папку мобильного приложения

```bash
cd mobile
```

### 4.2 Установить зависимости (первый раз ~2 минуты)

```bash
npm install
```

> Если ругается на конфликты версий, добавьте флаг:
> ```bash
> npm install --legacy-peer-deps
> ```

### 4.3 Запустить Expo-сервер

```bash
npx expo start
```

🎉 В терминале появится **большой QR-код**:

```
╔════════════════════════════════════════╗
║                                        ║
║         ▄▄▄▄▄▄▄ ▄▄▄▄ ▄▄   ▄▄         ║
║         ███    █   █ █   ▄▀           ║
║         ███    ▀████ ▀▄  █▀           ║
║         ... (ваш QR-код тут) ...        ║
║                                        ║
╚════════════════════════════════════════╝

› Metro waiting on exp://192.168.1.50:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
```

> ⚠️ **НЕ ЗАКРЫВАЙТЕ терминал!** Пока он открыт — Expo работает.
> Для остановки нажмите `Ctrl+C`.

---

## Шаг 5 — Запуск на iPhone

### ✅ Чек-лист для телефона

- [ ] **iPhone и Mac/PC подключены к одной Wi-Fi сети**
      *(например, оба к «Home_WiFi», не к гостевой)*

- [ ] **Установлено приложение Expo Go** из App Store:
      https://apps.apple.com/app/expo-go/id982107779

- [ ] **Бэкенд запущен** (Шаг 2, контейнеры Up)

- [ ] **Expo запущен** (Шаг 4, QR-код виден в терминале)

### 📱 Запуск приложения

1. Откройте **стандартное приложение «Камера»** на iPhone.
2. Наведите на QR-код в терминале.
3. Появится уведомление: **«Open in Expo»** — нажмите его.
   *(Если не появляется — откройте Expo Go вручную и нажмите «Scan QR code»)*

4. Expo Go загрузит приложение (10-30 секунд).
5. Появится экран авторизации RaveClone:

```
┌──────────────────────────┐
│                          │
│           🎬              │
│      RaveClone           │
│  Смотри вместе с друзьями │
│                          │
│  [Войти через Google]    │
│  [Войти через Apple]     │
│  [Войти через VK ID]     │
│                          │
│  ─────── или ───────     │
│                          │
│  [Продолжить как гость]  │
│                          │
└──────────────────────────┘
```

🎉 **Готово!** Нажмите «Продолжить как гость» чтобы быстро войти.

---

## 🔧 Решение частых проблем

### Проблема: «Network request failed» в приложении

**Причина:** iPhone не может достучаться до бэкенда.

**Решение:**
1. Проверьте, что iPhone и Mac в **одной** Wi-Fi сети.
2. Проверьте, что IP в `config/index.ts` **правильный** (Шаг 1.3).
3. Проверьте, что бэкенд отвечает:
   ```bash
   curl http://ВАШ_IP:3000/health
   ```
   Должно вернуть `{"status":"ok"}`.
4. На macOS: **System Settings → Network → Firewall → Выключить** (или разрешить node).
5. На Windows: разрешить порт 3000 в брандмауэре.

### Проблема: QR-код не сканируется

- Увеличьте шрифт терминала: `Cmd +` (macOS) / `Ctrl +` (Windows)
- Или откройте Expo Go → «Enter URL manually» → введите `exp://ВАШ_IP:8081`

### Проблема: «Cannot connect to Docker daemon»

- Запустите **Docker Desktop** (приложение должно быть открыто).
- Проверьте: `docker info` (должно работать без ошибок).

### Проблема: «Port 3000 already in use»

- Узнайте, кто занимает порт:
  ```bash
  lsof -i :3000    # macOS
  netstat -ano | findstr :3000   # Windows
  ```
- Либо остановите процесс, либо измените порт в `docker-compose.quickstart.yml` → `ports: ["3001:3000"]`.

### Проблема: Expo Go показывает красный экран ошибки

- Нажмите на ошибку чтобы прочитать детали.
- Чаще всего: не установлен какой-то пакет → `npm install ИМЯ_ПАКЕТА`.
- Проверьте, что выполнили `npm install` в папке `mobile/`.

### Проблема: Белый экран после загрузки

- Подождите 30-60 секунд (первая загрузка долгая).
- Встряхните телефон → «Reload».
- Проверьте логи Metro в терминале.

---

## 🛑 Как остановить всё

### Остановить Expo
В терминале с Expo нажмите: **`Ctrl + C`**

### Остановить бэкенд и базу
```bash
cd /Users/hellcart/ZCodeProject/RaveClone
docker compose -f docker-compose.quickstart.yml down
```

### Полностью удалить данные базы (старт с чистого листа)
```bash
docker compose -f docker-compose.quickstart.yml down -v
```

---

## 📁 Структура проекта (что и где лежит)

```
RaveClone/
├── docker-compose.quickstart.yml   ← Docker (БД + бэкенд) — Шаг 2
├── QUICKSTART.md                    ← Этот файл
│
├── server/                          ← Бэкенд (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts                 ← Точка входа сервера
│   │   ├── routes/                  ← REST API (auth, rooms, media, admin)
│   │   ├── websocket/               ← WebSocket (синхронизация, чат)
│   │   └── services/                ← Экстракторы медиа, ИИ-модератор
│   └── prisma/schema.prisma         ← Схема базы данных
│
└── mobile/                          ← Фронтенд (React Native + Expo)
    ├── App.tsx                      ← Точка входа приложения
    ├── src/
    │   ├── config/index.ts          ← ⚠️ ЗДЕСЬ МЕНЯТЬ IP (Шаг 3)
    │   ├── AppNavigator.tsx         ← Навигация + Auth-Gate
    │   ├── screens/                 ← Экраны (Auth, Home, Profile, Room)
    │   ├── components/              ← Плеер, чат, DrmOverlay
    │   ├── services/                ← DrmSessionManager, SyncEngine
    │   └── store/                   ← Zustand (authStore, etc.)
    └── package.json                 ← Зависимости
```

---

## 🎯 Краткая шпаргалка (когда всё уже настроено)

Если вы уже всё установили и просто хотите перезапустить:

```bash
# Терминал 1 — бэкенд:
cd /Users/hellcart/ZCodeProject/RaveClone
docker compose -f docker-compose.quickstart.yml up -d

# Терминал 2 — Expo:
cd /Users/hellcart/ZCodeProject/RaveClone/mobile
npx expo start

# iPhone: Камера → сканировать QR → Expo Go
```

---

## ❓ Если ничего не помогло

1. Проверьте логи бэкенда: `docker compose logs app`
2. Проверьте логи Expo: читайте терминал
3. Встряхните iPhone в Expo Go → «Show Dev Menu» → «Toggle Element Inspector»
4. Убедитесь, что IP правильный: `curl http://ВАШ_IP:3000/health` с компьютера
5. Убедитесь, что iPhone и компьютер в одной Wi-Fi сети

**Удачного запуска! 🎬🚀**
