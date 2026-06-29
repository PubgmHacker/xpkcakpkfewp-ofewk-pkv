# Rave Clone — Этап 3: Сборка IPA и App Store Connect

## Полная инструкция от Xcode до публикации

---

## 1. Настройка Xcode Project

### 1.1 Создание проекта
```
File → New → Project → App
- Product Name: SyncWatch
- Organization Identifier: com.yourteam.raveclone
- Interface: SwiftUI
- Language: Swift
- Storage: SwiftData (или None)
- Minimum Deployment: iOS 17.0
```

### 1.2 Добавление файлов
Скопируйте всю директорию `RaveClone/` в проект Xcode:
- Перетащите папку `RaveClone/` в Project Navigator
- Убедитесь что:
  - ✅ "Copy items if needed" включено
  - ✅ "Create groups" (не "Create folder references")
  - ✅ Target membership: SyncWatch

### 1.3 Добавление SPM-зависимостей
```
File → Add Package Dependencies...
```
| Package | URL | Version |
|---------|-----|---------|
| Starscream | https://github.com/daltoniam/Starscream.git | 4.0.4+ |
| GoogleWebRTC | https://github.com/webrtc-sdk/GoogleWebRTC.git | 114.0.0+ |
| Kingfisher | https://github.com/onevcat/Kingfisher.git | 7.0.0+ |
| Firebase iOS SDK | https://github.com/firebase/firebase-ios-sdk.git | 10.0.0+ |

Для Firebase: выберите только нужные модули:
- `FirebaseAnalytics`
- `FirebaseAuth`
- `FirebaseFirestore`

### 1.4 Конфигурация Info.plist
```
Target → Info → Custom iOS Target Properties
```
Скопируйте все ключи из `Resources/Info.plist`.

### 1.5 Entitlements
```
Target → Signing & Capabilities
```
1. Нажмите "+ Capability"
2. Добавьте:
   - **Background Modes** → Audio, AirPlay, and Picture in Picture + Voice over IP
   - **Associated Domains** → `applinks:raveclone.app`

---

## 2. Схемы и конфигурации

### 2.1 Создание конфигураций
```
Project → Info → Configurations
```

| Configuration | Debug | Release | App Store |
|--------------|-------|---------|-----------|
| Based on | Debug | Release | Release |
| API URL | localhost | api.raveclone.app | api.raveclone.app |
| WS URL | ws://localhost:8080 | wss://raveclone.app/ws | wss://raveclone.app/ws |

### 2.2 Схемы
```
Product → Scheme → Manage Schemes
```
- **SyncWatch-Dev** → Debug configuration
- **SyncWatch-Prod** → Release configuration
- **SyncWatch-AppStore** → App Store configuration

---

## 3. Сборка и тестирование

### 3.1 Запуск на устройстве
```
1. Подключите iPhone/iPad
2. Выберите device в toolbar
3. Product → Run (⌘R)
4. При первом запуске — доверьте разработчику:
   Settings → General → VPN & Device Management → Trust
```

### 3.2 Проверка перед отправкой
```bash
# Анализ кода
Product → Analyze (⌘B ⇧⌘B)

# Проверка приватных API
Product → Analyze → проверьте warnings

# Тесты (если есть)
Product → Test (⌘U)

# Архивация (dry run)
Product → Archive
```

---

## 4. Подготовка App Store Connect

### 4.1 Регистрация app ID
```
Apple Developer Portal → Certificates, Identifiers & Profiles
→ Identifiers → App IDs → New
- Description: SyncWatch
- Bundle ID: com.yourteam.raveclone
- Capabilities: VoIP, Associated Domains
```

### 4.2 Создание записи в App Store Connect
```
App Store Connect → My Apps → + New App
- Name: SyncWatch — Watch Together
- Primary Language: English
- SKU: raveclone-ios-001
- Bundle ID: com.yourteam.raveclone (выбрать из списка)
```

### 4.3 Заполнение информации
Скопируйте метаданные из `APPSTORE_STRATEGY.md`:
- Описание (EN + RU)
- Keywords
- Category: Entertainment + Social Networking
- Age Rating: 17+ (User-Generated Content)
- Support URL, Privacy Policy URL
- Screenshots (6.7" iPhone 15 Pro Max required)

---

## 5. Сборка IPA и загрузка

### 5.1 Archive
```
1. Выберите схему SyncWatch-AppStore
2. Product → Archive (⌘⇧A)
3. Дождитесь успешной сборки
```

### 5.2 Валидация
```
Organizer → Выберите архив → Validate App
```
Проверит:
- Сигнатура кода
- Соответствие Guidelines
- Инфраструктура приватности
- Permissions descriptions

### 5.3 Загрузка
```
Organizer → Выберите архив → Distribute App
→ App Store Connect → Automatically manage signing
→ Upload
```

### 5.4 Альтернатива: Transporter App
```
1. Product → Archive
2. Distribute App → Custom → Export for App Store
3. Сохранить .ipa
4. Открыть Transporter.app
5. Перетащить .ipa → Deliver
```

---

## 6. App Review Notes

**ОБЯЗАТЕЛЬНО** добавьте это при отправке:

```
Dear App Review Team,

SyncWatch is a SOCIAL SYNCHRONIZATION tool, NOT a streaming service.

Key points:
✅ We do NOT host, store, or distribute any media content
✅ All content is user-provided (URLs, personal media servers, local files)
✅ We have a DMCA takedown process at raveclone.app/dmca
✅ Content reporting is available in every room
✅ Terms of Service prohibit sharing copyrighted content
✅ No built-in media libraries or sources

The app enables friends to synchronize playback of their OWN content,
similar to how "Watch Together" features work in messaging apps.

Test credentials:
Email: reviewer@raveclone.app
Password: ReviewTest2024!

Thank you for your time.
```

---

## 7. Частые причины отклонения и решения

| Причина | Решение |
|---------|---------|
| **Guideline 4.2 — Spam** | Уникальный дизайн, не клон. Описание должно подчёркивать уникальность sync-движка |
| **Guideline 5.2.1 — UGC** | Добавить report кнопку, Terms of Service, DMCA процедуру |
| **Guideline 2.3.1 — crashes** | Все screenshots должны быть с реального устройства, не симулятора |
| **Guideline 3.1.1 — payments** | Если будут IAP — описать что именно продаётся |
| **Guideline 2.1 — app completeness** | Не оставляйте placeholder контент, заглушки кнопок, TODO в UI |
| **Guideline 4.3 — similar apps** | Подчеркнуть уникальный sync-движок, голосовой чат, privacy focus |

---

## 8. Сроки

| Этап | Время |
|------|------|
| Archive + Upload | ~15 минут |
| App Store Processing | 24-48 часов |
| Review (обычно) | 1-3 дня |
| Review (повторный) | 1-2 дня |
| Rejection → Fix → Resubmit | +2-5 дней |

---

## 9. Xcode Project Checklist

Перед Archive:
```
✅ Deployment Target: iOS 17.0
✅ Bundle Identifier совпадает с App Store Connect
✅ Version: 1.0 (Build: 1)
✅ All placeholder TODOs removed from UI
✅ Info.plist permissions descriptions are specific and clear
✅ PrivacyInfo.xcprivacy included in bundle
✅ No print() statements in production code (use Logger)
✅ No test accounts or hardcoded credentials
✅ App icons: 1024x1024 + all required sizes
✅ Launch screen configured
✅ Dark mode: force .preferredColorScheme(.dark) or support both
✅ All SPM dependencies at latest compatible versions
✅ Architecture: Any iOS (arm64)
✅ Bitcode: Disabled (Xcode 14+, not needed)
✅ Strip Swift Symbols: Yes (Release)
```
