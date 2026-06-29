type Logger = { info(msg: string, ...args: any[]): void; warn(msg: string, ...args: any[]): void; error(msg: string, ...args: any[]): void };
import { YouTubeService } from "./youtube.js";
import { extractVKVideo, isVKVideoURL } from "./extractors/vk.js";
import { extractRuTube, isRuTubeURL } from "./extractors/rutube.js";
import { extractWebMedia, isDirectMediaURL } from "./extractors/web.js";

// ─────────────────────────────────────────────────────────────────────────────
//  MediaExtractor — единая точка входа для извлечения прямых потоков.
//
//  Архитектура источника:
//
//   ┌─────────────────────────┬───────────────────────────────────────────┐
//   │ Прямой поток (Native)   │ WebView-синхронизация (DRM)               │
//   │ expo-av / AVPlayer      │ react-native-webview + injectedJS         │
//   ├─────────────────────────┼───────────────────────────────────────────┤
//   │ • Прямые .mp4/.m3u8     │ • Netflix                                 │
//   │ • YouTube               │ • Disney+                                 │
//   │ • VK Видео              │ • Кинопоиск                               │
//   │ • RuTube                │ • Окко                                    │
//   │ • Открытый веб (<video>)│ • Wink                                    │
//   └─────────────────────────┴───────────────────────────────────────────┘
//
//  ⚠️ Платные DRM-сервисы НЕ экстрактятся на бэкенде — это нарушает их ToS и
//  законы об авторском праве (обход Widevine/FairPlay). Вместо этого RoomPlayer
//  открывает официальный сайт в WebView, пользователь входит в СВОЙ аккаунт,
//  и синхронизация идёт через инъекцию JS (как Teleparty/Discord Watch Party).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Режим воспроизведения ─────────────────────────────────────────────────

export enum PlaybackMode {
  /** expo-av / AVPlayer с прямым потоком (.mp4/.m3u8). */
  NATIVE = "native",
  /** WebView с официальным сайтом DRM-сервиса + JS-инъекция для синхронизации. */
  WEBVIEW = "webview",
}

// ─── Реестр медиа-источников ───────────────────────────────────────────────

export interface MediaSourceConfig {
  id: string;
  name: string;
  mode: PlaybackMode;
  /** Домены сервиса (для сопоставления URL). */
  domains: string[];
  /** Базовый URL для WebView (куда вести пользователя при выборе сервиса). */
  webviewBaseURL?: string;
  /** Нужно ли каждому зрителю иметь свою подписку. */
  requiresSubscription: boolean;
  /** Логотип (URL или эмодзи) для UI. */
  icon: string;
}

export const MEDIA_SOURCES: MediaSourceConfig[] = [
  // ─── Бесплатные (нативный плеер) ───────────────────────────────────────
  {
    id: "youtube", name: "YouTube", mode: PlaybackMode.NATIVE,
    domains: ["youtube.com", "youtu.be"], icon: "▶️",
    requiresSubscription: false,
  },
  {
    id: "vk", name: "VK Видео", mode: PlaybackMode.NATIVE,
    domains: ["vk.com", "vk.ru", "vkvideo.ru"], icon: "🟦",
    requiresSubscription: false,
  },
  {
    id: "rutube", name: "RuTube", mode: PlaybackMode.NATIVE,
    domains: ["rutube.ru"], icon: "📺",
    requiresSubscription: false,
  },
  {
    id: "web", name: "Открытый веб", mode: PlaybackMode.NATIVE,
    domains: [], icon: "🌐",
    requiresSubscription: false,
  },

  // ─── Платные DRM (WebView-синхронизация) ──────────────────────────────
  {
    id: "netflix", name: "Netflix", mode: PlaybackMode.WEBVIEW,
    domains: ["netflix.com"], icon: "🔴",
    webviewBaseURL: "https://www.netflix.com",
    requiresSubscription: true,
  },
  {
    id: "disney", name: "Disney+", mode: PlaybackMode.WEBVIEW,
    domains: ["disneyplus.com", "disney.ru"], icon: "🏰",
    webviewBaseURL: "https://www.disneyplus.com",
    requiresSubscription: true,
  },
  {
    id: "kinopoisk", name: "Кинопоиск", mode: PlaybackMode.WEBVIEW,
    domains: ["kinopoisk.ru", "hd.kinopoisk.ru"], icon: "🎬",
    webviewBaseURL: "https://hd.kinopoisk.ru",
    requiresSubscription: true,
  },
  {
    id: "okko", name: "Okko", mode: PlaybackMode.WEBVIEW,
    domains: ["okko.tv"], icon: "🟠",
    webviewBaseURL: "https://okko.tv",
    requiresSubscription: true,
  },
  {
    id: "wink", name: "Wink", mode: PlaybackMode.WEBVIEW,
    domains: ["wink.ru"], icon: "✨",
    webviewBaseURL: "https://wink.ru",
    requiresSubscription: true,
  },
];

// ─── Результат извлечения ───────────────────────────────────────────────────

export interface ExtractedMedia {
  sourceID: string;
  sourceName: string;
  mode: PlaybackMode;
  /** Для NATIVE: прямой поток. Для WEBVIEW: URL страницы плеера. */
  streamURL: string;
  /** Базовый URL сервиса (для WebView). */
  webviewBaseURL?: string;
  title: string;
  thumbnailURL?: string;
  duration?: number;
  format?: string;
  quality?: string;
  /** Требуется ли подписка у каждого зрителя (DRM-сервисы). */
  requiresSubscription: boolean;
}

// ─── Главный класс ──────────────────────────────────────────────────────────

export class MediaExtractor {
  private youtube: YouTubeService;

  constructor(
    private log: Logger,
    private ytdlpPath: string
  ) {
    this.youtube = new YouTubeService(log, ytdlpPath);
  }

  /**
   * Определить источник по URL.
   * Возвращает конфиг источника + режим воспроизведения.
   */
  detectSource(url: string): MediaSourceConfig {
    const lower = url.toLowerCase();

    // Платные DRM-сервисы — всегда WebView
    const drm = MEDIA_SOURCES.find((s) =>
      s.mode === PlaybackMode.WEBVIEW && s.domains.some((d) => lower.includes(d))
    );
    if (drm) return drm;

    // Бесплатные — нативный плеер
    if (isVKVideoURL(url)) return MEDIA_SOURCES.find((s) => s.id === "vk")!;
    if (isRuTubeURL(url)) return MEDIA_SOURCES.find((s) => s.id === "rutube")!;
    if (/youtube\.com|youtu\.be/i.test(url)) return MEDIA_SOURCES.find((s) => s.id === "youtube")!;
    if (isDirectMediaURL(url)) return MEDIA_SOURCES.find((s) => s.id === "web")!;

    // Fallback: пробуем как веб-страницу
    return MEDIA_SOURCES.find((s) => s.id === "web")!;
  }

  /**
   * Извлечь медиа из URL.
   * Для DRM-сервисов НЕ извлекает поток, а возвращает URL для WebView.
   */
  async extract(url: string): Promise<ExtractedMedia> {
    const source = this.detectSource(url);
    this.log.info({ url, source: source.id, mode: source.mode }, "[MediaExtractor] Извлечение");

    // ─── DRM-сервисы: WebView-синхронизация ──────────────────────────────
    if (source.mode === PlaybackMode.WEBVIEW) {
      return {
        sourceID: source.id,
        sourceName: source.name,
        mode: PlaybackMode.WEBVIEW,
        streamURL: url,                          // конкретный фильм/сериал
        webviewBaseURL: source.webviewBaseURL,
        title: `${source.name} — совместный просмотр`,
        requiresSubscription: true,
      };
    }

    // ─── Бесплатные: нативный плеер ──────────────────────────────────────
    try {
      switch (source.id) {
        case "youtube": {
          const info = await this.youtube.extract(url);
          return {
            sourceID: "youtube",
            sourceName: "YouTube",
            mode: PlaybackMode.NATIVE,
            streamURL: info.streamURL,
            title: info.title,
            thumbnailURL: info.thumbnailURL,
            duration: info.duration,
            format: info.format,
            quality: info.quality,
            requiresSubscription: false,
          };
        }

        case "vk": {
          const info = await extractVKVideo(url, this.ytdlpPath, this.log);
          return {
            sourceID: "vk",
            sourceName: "VK Видео",
            mode: PlaybackMode.NATIVE,
            streamURL: info.streamURL,
            title: info.title,
            thumbnailURL: info.thumbnailURL,
            duration: info.duration,
            quality: info.quality,
            requiresSubscription: false,
          };
        }

        case "rutube": {
          const info = await extractRuTube(url, this.ytdlpPath, this.log);
          return {
            sourceID: "rutube",
            sourceName: "RuTube",
            mode: PlaybackMode.NATIVE,
            streamURL: info.streamURL,
            title: info.title,
            thumbnailURL: info.thumbnailURL,
            duration: info.duration,
            format: info.format,
            quality: info.quality,
            requiresSubscription: false,
          };
        }

        case "web":
        default: {
          const info = await extractWebMedia(url, this.log);
          return {
            sourceID: "web",
            sourceName: "Открытый веб",
            mode: PlaybackMode.NATIVE,
            streamURL: info.streamURL,
            title: info.title,
            duration: info.duration,
            format: info.format,
            requiresSubscription: false,
          };
        }
      }
    } catch (e: any) {
      this.log.error({ err: e.message, url }, "[MediaExtractor] Ошибка извлечения");
      throw new Error(
        `Не удалось извлечь поток из ${url}. ${e.message}. ` +
        `Возможно, видео недоступно, приватное или защищено.`
      );
    }
  }

  /** Список всех поддерживаемых источников (для UI выбора в RoomPlayer). */
  listSources(): MediaSourceConfig[] {
    return MEDIA_SOURCES;
  }
}
