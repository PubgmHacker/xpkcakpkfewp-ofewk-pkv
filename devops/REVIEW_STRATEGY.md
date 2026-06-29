# SyncWatch — Стратегия прохождения App Store Review

> **Главная идея:** позиционируем приложение как **социальный инструмент синхронизации воспроизведения**, а НЕ как стриминговый сервис. Мы НЕ размещаем, НЕ храним и НЕ распространяем защищённый авторским правом контент. Все медиа — пользовательские ссылки на легально размещённый контент (прямые MP4, личные Plex/Jellyfin, YouTube с открытой лицензией).

---

## Содержание
1. [Риск-анализ по Guidelines](#1-риск-анализ-по-guidelines)
2. [Заполнение App Store Connect](#2-заполнение-app-store-connect)
3. [Review Notes — готовый текст](#3-review-notes--готовый-текст)
4. [Тестовый контент по умолчанию (Creative Commons)](#4-тестовый-контент-по-умолчанию-creative-commons)
5. [Чек-лист перед сабмитом](#5-чек-лист-перед-сабмитом)
6. [Что делать при отказе](#6-что-делать-при-отказе)

---

## 1. Риск-анализ по Guidelines

| Guideline | Риск | Митигация |
|-----------|------|-----------|
| **4.2 — Minimum Functionality** | Низкий | Sync-движок + VoIP = реальная функциональность, не вебвью-обёртка |
| **4.3 — Spam** | Средний | Уникальный UX (latency-compensated sync, mesh VoIP), отличия от Rave/Watch2Gether |
| **5.2.1 — User-Generated Content** | **Высокий** | Report-кнопка в каждой комнате, Terms of Service, DMCA-процедура, модерация |
| **5.2.3 — Audio/Video Download** | Средний | Явно заявить: приложение НЕ скачивает, только синхронизирует воспроизведение URL |
| **5.2.4 — Apple Music / Content** | Низкий | Не используем Apple Music API в первом релизе |
| **2.3.1 — Hidden Features** | Низкий | Никаких динамических фреймворков, hidden entitlements |
| **2.5.1 — APIs** | Низкий | Только публичные API, WebRTC framework через SPM |
| **3.1.1 — IAP** | Низкий | В первом релизе нет платных функций |

---

## 2. Заполнение App Store Connect

### 2.1 Базовая информация

```
Name (EN):           SyncWatch — Watch Together
Name (RU):           SyncWatch — Смотри вместе
Subtitle (EN):       Sync movies & music with friends in real-time
Subtitle (RU):       Синхронно смотри фильмы и слушай музыку с друзьями
Primary Category:    Entertainment
Secondary Category:  Social Networking
Age Rating:          17+ (Unrestricted Web Access — т.к. пользовательские URL)
```

### 2.2 Privacy Policy (ОБЯЗАТЕЛЬНО)

Опубликовать по URL (например `https://raveclone.app/privacy`). Должна покрывать:
- Типы собираемых данных (email, username, FCM-токен)
- Использование VoIP (микрофон — только во время звонка, шифруется WebRTC SRTP)
- Хранение: медиа не хранятся, сообщения — ephemerally
- Права пользователя на удаление данных (GDPR/CCPA compliance)
- DMCA-контакт: `dmca@raveclone.app`

### 2.3 Screenshots

- **6.7"** (iPhone 15 Pro Max) — обязательно
- **6.5"** (iPhone 11 Pro Max) — опционально, но рекомендуется
- **iPad 12.9"** — если поддерживается iPad

**Контент на скриншотах — ТОЛЬКО свободный:**
- Используйте Creative Commons видео (Big Buck Bunny, Sintel)
- НЕ показывайте логотипы Netflix, YouTube Red, платный контент
- Подчеркните: sync-индикатор, голосовой чат, список друзей

---

## 3. Review Notes — готовый текст

> Скопируйте этот текст в поле **«Notes for Reviewer»** в App Store Connect.
> Замените `<...>` на реальные значения.

### 3.1 Английская версия (рекомендуется)

```
Dear App Review Team,

Thank you for reviewing SyncWatch.

──────────────────────────────────────────────
WHAT THIS APP IS
──────────────────────────────────────────────
SyncWatch is a SOCIAL SYNCHRONIZATION tool. It lets friends press play
at the exact same moment on content they already have legal access to —
just like screen-sharing in FaceTime or the "Watch Together" feature
in messaging apps.

We do NOT stream, host, store, cache, or distribute any media content.
The app contains no media library, no search engine for videos, and no
built-in catalog of movies or music.

──────────────────────────────────────────────
HOW USERS GET CONTENT
──────────────────────────────────────────────
Users paste their OWN URLs into a room:
  • Direct MP4/M3U8 links they have rights to
  • Their personal Plex or Jellyfin server
  • Creative Commons / public domain videos

For YouTube links specifically, we use yt-dlp on our server only to
resolve a direct stream URL — we do not download, cache, or re-host
the video. The user could watch the same video in a browser; we simply
keep playback synchronized across devices.

──────────────────────────────────────────────
COPYRIGHT COMPLIANCE
──────────────────────────────────────────────
✅ No copyrighted content is included with the app
✅ Terms of Service prohibit sharing copyrighted material
✅ DMCA takedown procedure published: https://raveclone.app/dmca
✅ In-app "Report Room" button on every room (DMCA + abuse reporting)
✅ No piracy, torrents, or download functionality whatsoever
✅ No content is re-hosted, proxied, or cached by our servers

──────────────────────────────────────────────
TEST CREDENTIALS
──────────────────────────────────────────────
We have created a demo account for your review:

  Email:    reviewer@raveclone.app
  Password: AppleReview2024!

──────────────────────────────────────────────
HOW TO TEST (step by step)
──────────────────────────────────────────────
1. Sign in with the test credentials above.
2. Tap "Create Room" on the Home screen.
3. When prompted for media, paste this TEST URL (Creative Commons,
   no copyright — Blender open movie "Big Buck Bunny"):
     https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
4. Name the room "Review Test" and tap "Create".
5. You will see the video player with sync controls.
   (Voice chat requires a second device — optional.)
6. Tap the Share Code to verify the 6-character room code.

──────────────────────────────────────────────
VOICE CHAT (WebRTC)
──────────────────────────────────────────────
Voice chat uses WebRTC for peer-to-peer encrypted audio (SRTP).
The microphone is accessed ONLY when the user explicitly taps
"Join Voice" and ends when they leave the room or close the app.
NSMicrophoneUsageDescription explains this clearly.

──────────────────────────────────────────────
Thank you for your time. We are happy to provide any additional
information or a live demo via video call if needed.

Best regards,
The SyncWatch Team
support@raveclone.app
```

### 3.2 Что НЕ писать (гарантированный бан)

❌ «You can watch any movie for free»
❌ «Stream YouTube videos with friends»
❌ «Download videos for offline viewing»
❌ Упоминание конкретных стриминговых сервисов (Netflix, Disney+, etc.)
❌ Термины: pirate, free movies, cracked, unlocked, mod

### 3.3 Ключевые формулировки (использовать везде)

| ❌ Плохо | ✅ Хорошо |
|---------|----------|
| «Stream videos together» | «Synchronize playback of your own content» |
| «Watch movies with friends» | «Keep playback in sync across devices» |
| «Free video player» | «Social synchronization tool» |
| «YouTube downloader» | «URL resolver for sync purposes» |
| «Download music» | NOT MENTIONED — у нас нет этой функции |

---

## 4. Тестовый контент по умолчанию (Creative Commons)

> ⚠️ **Критично:** при дефолтной ссылке в `CreateRoomView` (если есть
> предзаполненный пример) используйте ТОЛЬКО видео с явной открытой лицензией.

### Безопасные тестовые ссылки (встроить как placeholder)

```swift
// В CreateRoomView.swift — плейсхолдер для текстового поля:
.placeholder("Paste a direct .mp4 URL or YouTube link")

// Демо-ссылка в коде (если есть кнопка "Try sample"):
static let sampleMediaURL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
```

### Свободные тестовые видео (для тестов и скриншотов)

| Название | Лицензия | URL |
|----------|----------|-----|
| Big Buck Bunny | CC BY 3.0 (Blender) | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4` |
| Sintel | CC BY 3.0 (Blender) | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4` |
| Tears of Steel | CC BY 3.0 (Mango) | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4` |
| Elephants Dream | CC BY 3.0 (Blender) | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4` |

> Все 4 видео — open movies Blender Foundation. На скриншотах и в демо
> показывайте ТОЛЬКО их. Это снимает любой риск по Guideline 5.2.

### Видео с открытой YouTube-лицензией (для теста экстрактора)

Используйте видео, где автор явно указал лицензию Creative Commons:

- `https://www.youtube.com/watch?v=YnQfW5cDA1g` (Blender open movies channel)
- Любое видео с фильтром «Creative Commons (reuse allowed)» на YouTube

---

## 5. Чек-лист перед сабмитом

### 5.1 Код и сборка

- [ ] Все `print()` заменены на `Logger.*` (release-сборка не должна спамить лог)
- [ ] Все `TODO`/`FIXME` либо выполнены, либо закомментированы
- [ ] Нет хардкоженных API-ключей, паролей, dev-URL в коде
- [ ] `APIConfig` указывает на продакшен (НЕ localhost)
- [ ] ATS в Release-сборке требует HTTPS (нет `NSAllowsArbitraryLoads`)
- [ ] `#if DEBUG` блокирует dev-функционал
- [ ] App Icon: 1024×1024 + все обязательные размеры
- [ ] Launch Screen настроен
- [ ] Версия: 1.0, Build: уникальный (timestamp/fastlane)

### 5.2 Метаданные

- [ ] App Store Connect: название, подзаголовок, описание
- [ ] Keywords (≤ 100 символов, без названий брендов)
- [ ] Скриншоты: 6.7" обязательно, контент — только Creative Commons
- [ ] App Preview (опционально, 15-30 сек видео)
- [ ] Description: про СОЦИАЛЬНУЮ функцию, не про стриминг
- [ ] Support URL: `https://raveclone.app/support`
- [ ] Marketing URL: `https://raveclone.app`
- [ ] Privacy Policy URL: `https://raveclone.app/privacy`
- [ ] DMCA URL: `https://raveclone.app/dmca`
- [ ] Copyright: `© 2024 SyncWatch` (НЕ перечисляйте бренды)

### 5.3 Разрешения (Info.plist)

- [ ] `NSMicrophoneUsageDescription` — конкретное объяснение (не «app needs mic»)
- [ ] `NSLocalNetworkUsageDescription` — для Plex/Jellyfin
- [ ] `PrivacyInfo.xcprivacy` — заполнен и включён в bundle
- [ ] No `NSCameraUsageDescription` (камера не используется в v1)

### 5.4 WebRTC / Networking

- [ ] STUN/TURN-серверы доступны из интернета (не localhost)
- [ ] WebSocket URL: `wss://` (не `ws://`) в продакшене
- [ ] Сертификаты бэкенда валидны (Let's Encrypt /paid SSL)
- [ ] TURN-сервер: настроен (для NAT traversal за симметричным NAT)
- [ ] Firebase Cloud Messaging: production certificate загружен

### 5.5 Review-specific

- [ ] Демо-аккаунт создан и работает: `reviewer@raveclone.app` / `AppleReview2024!`
- [ ] Тестовая ссылка (Big Buck Bunny) добавлена в Review Notes
- [ ] Review Notes заполнены по шаблону из §3
- [ ] Demo video URL (если есть App Preview) — Creative Commons

---

## 6. Что делать при отказе

### 6.1 Типичный сценарий отказа по 5.2 (Copyright)

**Симптом:** «Guideline 5.2.1 - Legal - Intellectual Property - User-Generated Content»

**Действия:**

1. **Не паниковать и не спорить** — это стандартный ответ для UGC-приложений.

2. **Проверить требования Guideline 5.2.1:**
   - ✅ Filter mechanism для неприемлемого контента → есть (report button)
   - ✅ Mechanism to block abusive users → добавить (если нет)
   - ✅ Published policy / TOS → есть
   - ✅ User contact info for reporting → есть (in-app + email)

3. **Ответить в Resolution Center:**

```
Thank you for the feedback. To clarify:

SyncWatch does not contain, host, or distribute any media content.
All content is user-provided via URLs to externally hosted material
that the user has legal access to.

We have implemented the following UGC safeguards per Guideline 5.2.1:
  • In-app "Report Room" button on every room
  • Terms of Service prohibiting copyrighted content
  • DMCA takedown procedure at raveclone.app/dmca
  • User block/report capability
  • Moderation tools for our team

No copyrighted material is included with the app, shown in screenshots,
or used in our marketing materials. The test URL we provided is a
Creative Commons open movie (Big Buck Bunny by Blender Foundation,
licensed under CC BY 3.0).

Please let us know what specific functionality you'd like us to add
or modify. We are committed to full compliance.
```

4. **Доработать и пересдать** (обычно 1-2 итерации).

### 6.2 Если требуют убрать YouTube-экстракцию

Если Apple настаивает, что извлечение YouTube URL нарушает ToS YouTube:

```
We understand the concern. We have removed the YouTube URL resolution
feature in build [VERSION]. Users can still use direct .mp4/.m3u8 URLs
and personal Plex/Jellyfin servers — no third-party platform integration
remains.

All YouTube references have been removed from the UI and metadata.
```

В этом случае:
- Закомментировать вызовы `MediaService.extract(youTubeURL:)`
- Убрать упоминания YouTube из UI, описания, keywords
- Оставить только прямые URL + Plex/Jellyfin
- Пересдать через 2-3 дня

### 6.3 Сроки

| Этап | Время |
|------|-------|
| Upload → Processing | 15-30 мин |
| Processing → In Review | 12-48 ч |
| In Review → Resolution | 4-48 ч |
| First review (обычно) | 1-3 дня |
| Re-review (после reject) | 1-2 дня |
| Total to App Store | 5-10 дней (первый сабмит) |

---

## 7. Постоянная защита (после релиза)

- Мониторить жалобы через App Store Connect → Reviews
- Быстро отвечать на DMCA-заявки (≤ 48 ч)
- Вести журнал takedown-запросов (для аудита Apple)
- Регулярно обновлять Privacy Policy при добавлении функций
- Проверять каждый новый build на compliance перед бета-тестом

---

## 8. Резюме для команды

**Три правила, которые нельзя нарушать:**

1. 🎬 **Никогда не поставляем контент** — только URL пользователя
2. 🛡️ **Всегда есть путь к удалению/жалобе** — report + DMCA + block
3. 📝 **Язык = синхронизация**, не стриминг — в UI, метаданных, поддержке

Придерживаясь этих правил и предоставив рецензенту чёткое объяснение +
тестовый аккаунт + свободную тестовую ссылку, вы проходите ревью
с первой или второй попытки.
