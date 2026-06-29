# Подключение iOS-симулятора к локальному бэкенду

## TL;DR

```bash
# 1. Поднять бэкенд
cd RaveClone
docker compose -f devops/docker-compose.local.yml --env-file devops/.env.local up -d

# 2. Проверить здоровье
curl http://localhost:3000/health
# → {"status":"ok","uptime":...}

# 3. В Xcode: выставить Build Configuration = Debug
#    APIBaseURL в коде уже указывает на http://localhost:3000

# 4. Запустить в симуляторе (⌘R)
```

---

## 1. Почему `localhost` работает в симуляторе

**iOS Simulator** разделяет сетевой стек с хост-машиной (в отличие от реального устройства).
Поэтому:

- `http://localhost:3000` ✅ работает в симуляторе
- `http://127.0.0.1:3000` ✅ работает в симуляторе
- `ws://localhost:3000/ws` ✅ WebSocket тоже работает

**Реальное устройство** так делать НЕ будет — ему нужен LAN IP или домен:
- `http://192.168.1.42:3000` (IP вашего Mac в локальной сети)

---

## 2. Настройка переменной окружения в Xcode

### Способ A — Info.plist (простой)

Добавьте в `Info.plist`:
```xml
<key>APIBaseURL</key>
<string>$(API_BASE_URL)</string>
```

В `xcconfig`-файлах создайте конфигурации:

`Configurations/Debug.xcconfig`:
```
API_BASE_URL = http://localhost:3000
WS_BASE_URL = ws://localhost:3000
```

`Configurations/Release.xcconfig`:
```
API_BASE_URL = https://raveclone.app
WS_BASE_URL = wss://raveclone.app
```

Подключите `.xcconfig` в Project → Info → Configurations.

### Способ B — Активная компиляция (рекомендуемый)

```swift
// в APIConfig.swift
enum APIConfig {
    #if DEBUG
    static let baseURL = URL(string: "http://localhost:3000/api")!
    static let wsURL = URL(string: "ws://localhost:3000/ws")!
    #else
    static let baseURL = URL(string: "https://raveclone.app/api")!
    static let wsURL = URL(string: "wss://raveclone.app/ws")!
    #endif
}
```

---

## 3. ATS (App Transport Security) для localhost

HTTP (без TLS) по умолчанию запрещён в iOS. Для локальной разработки
нужно разрешить `localhost` в `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <!-- Опционально: точечное исключение для localhost -->
    <key>NSExceptionDomains</key>
    <dict>
        <key>localhost</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
</dict>
```

> ⚠️ В Release-сборке ATS должен быть включён полностью (только HTTPS).
> Удалите `NSAllowsLocalNetworking` или замените на продакшен-домен.

Наш текущий `Info.plist` уже содержит `NSAllowsLocalNetworking: true` ✅

---

## 4. Тестирование на реальном устройстве (по LAN)

Если хотите проверить WebSocket / WebRTC на физическом iPhone:

```bash
# Узнать LAN IP вашего Mac
ipconfig getifaddr en0
# → 192.168.1.42

# В Xcode измените:
#   http://localhost:3000 → http://192.168.1.42:3000
```

Убедитесь, что:
- iPhone и Mac в одной Wi-Fi сети
- Брандмауэр macOS разрешает входящие на порт 3000
  (System Settings → Network → Firewall → Options → node)

Для WebRTC (голосовой чат) на устройстве:
- STUN/TURN должны быть доступны из интернета
- Локальный TURN не сработает для peer-to-peer между двумя LTE-устройствами

---

## 5. Быстрая проверка пайплайна (curl)

```bash
# Регистрация
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"tester","password":"123456"}'
# → { "token": "...", "user": {...} }

# Создание комнаты
TOKEN="<токен из шага выше>"
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Room","maxParticipants":10}'
# → { "id": "...", "code": "ABC123", ... }

# WebSocket (через websocat)
brew install websocat
websocat "ws://localhost:3000/ws?token=$TOKEN&roomId=<room_id>"
# Введите: {"type":"ping","timestamp":1700000000}
# Ответ: {"command":"pong",...}
```

---

## 6. Отладка

| Симптом | Причина | Решение |
|---------|---------|---------|
| «Cannot connect to localhost» | Бэкенд не запущен | `docker compose ps`, проверить `app` статус |
| WebSocket сразу закрывается | JWT невалиден/пуст | Проверить `token` в URL, логин повторно |
| ATS error в логах Xcode | HTTP заблокирован | Добавить `NSAllowsLocalNetworking` |
| «Address already in use :3000» | Порт занят | Изменить `APP_PORT` в `.env.local` |
| Prisma миграции падают | БД не успела стартовать | `docker compose restart app` |
| CORS ошибка | Origin не в whitelist | Добавить в `CORS_ORIGIN` |
