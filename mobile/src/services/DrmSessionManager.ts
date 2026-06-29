import AsyncStorage from "@react-native-async-storage/async-storage";

// ─────────────────────────────────────────────────────────────────────────────
//  DrmSessionManager — ИЗОЛИРОВАННАЯ авторизация в DRM-сервисах
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  ВАЖНО: Полная изоляция от app-auth (authStore)                     │
//  │                                                                       │
//  │  • Токены/куки Кинопоиска, Netflix, Wink, Okko, Disney+             │
//  │    хранятся ОТДЕЛЬНО от JWT RaveClone                                │
//  │  • App Auth (Уровень 1) никогда не знает про DRM-сессии             │
//  │  • DRM-сессия (Уровень 2) живёт только внутри WebView сервиса       │
//  │  • При выходе из RaveClone DRM-куи могут сохраняться (опционально)  │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  Как это работает:
//    1. Пользователь открывает комнату с Кинопоиском.
//    2. RoomPlayer спрашивает DrmSessionManager: «мы залогинены в Кинопоиске?»
//    3. Если нет → показывается DrmOverlay («привяжите аккаунт Кинопоиска»).
//    4. Пользователь жмёт кнопку → открывается WebView Кинопоиска.
//    5. После входа WebView сообщает токен/статус → DrmSessionManager сохраняет.
//    6. DrmOverlay закрывается → RoomPlayer запускает WebView-синхронизацию.
// ─────────────────────────────────────────────────────────────────────────────

export type DrmServiceID =
  | "netflix" | "disney" | "kinopoisk" | "okko" | "wink";

export interface DrmServiceConfig {
  id: DrmServiceID;
  name: string;
  baseURL: string;
  loginURL: string;
  icon: string;
  color: string;
}

/** Реестр DRM-сервисов (должен совпадать с бэкенд MediaExtractor). */
export const DRM_SERVICES: Record<DrmServiceID, DrmServiceConfig> = {
  kinopoisk: {
    id: "kinopoisk",
    name: "Кинопоиск",
    baseURL: "https://hd.kinopoisk.ru",
    loginURL: "https://passport.yandex.ru/auth",
    icon: "🎬",
    color: "#FF6600",
  },
  netflix: {
    id: "netflix",
    name: "Netflix",
    baseURL: "https://www.netflix.com",
    loginURL: "https://www.netflix.com/login",
    icon: "🔴",
    color: "#E50914",
  },
  disney: {
    id: "disney",
    name: "Disney+",
    baseURL: "https://www.disneyplus.com",
    loginURL: "https://www.disneyplus.com/login",
    icon: "🏰",
    color: "#113CCF",
  },
  okko: {
    id: "okko",
    name: "Okko",
    baseURL: "https://okko.tv",
    loginURL: "https://okko.tv/login",
    icon: "🟠",
    color: "#FF4D00",
  },
  wink: {
    id: "wink",
    name: "Wink",
    baseURL: "https://wink.ru",
    loginURL: "https://wink.ru/auth/login",
    icon: "✨",
    color: "#7C3AED",
  },
};

// ─── Состояние DRM-сессии ───────────────────────────────────────────────────

export type DrmSessionStatus = "unknown" | "unauthenticated" | "authenticating" | "authenticated";

export interface DrmSession {
  serviceID: DrmServiceID;
  status: DrmSessionStatus;
  /** Имя пользователя в DRM-сервисе (если удалось прочитать из WebView). */
  accountName?: string;
  /** Cookie-строка (сохраняется для повторного открытия без повторного входа). */
  cookies?: string;
  /** Метка времени последней проверки. */
  lastChecked: number;
}

// ─── Хранилище ──────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "@drm_session_";

/** Ключ AsyncStorage — ОТДЕЛЬНЫЙ от app-auth (никакого пересечения с JWT). */
function storageKey(serviceID: DrmServiceID): string {
  return `${STORAGE_KEY_PREFIX}${serviceID}`;
}

// ─── Singleton Manager ──────────────────────────────────────────────────────

class DrmSessionManagerClass {
  private sessions = new Map<DrmServiceID, DrmSession>();
  private listeners = new Set<() => void>();

  /** Подписка на изменения (для React-компонентов). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  /** Получить текущую сессию сервиса (или unknown). */
  getSession(serviceID: DrmServiceID): DrmSession {
    return (
      this.sessions.get(serviceID) ?? {
        serviceID,
        status: "unknown",
        lastChecked: 0,
      }
    );
  }

  /** Загрузить все сохранённые DRM-сессии из AsyncStorage при старте. */
  async hydrate(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const drmKeys = keys.filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
      const pairs = await AsyncStorage.multiGet(drmKeys);

      for (const [key, value] of pairs) {
        if (!value) continue;
        const serviceID = key.replace(STORAGE_KEY_PREFIX, "") as DrmServiceID;
        const session = JSON.parse(value) as DrmSession;
        // После перезапуска статус всегда unknown — нужно перепроверить
        session.status = "unknown";
        this.sessions.set(serviceID, session);
      }
    } catch (e) {
      console.warn("[DrmSessionManager] hydrate failed:", e);
    }
  }

  /** Проверить, авторизован ли пользователь в конкретном сервисе. */
  isAuthenticated(serviceID: DrmServiceID): boolean {
    return this.getSession(serviceID).status === "authenticated";
  }

  /** Начать процесс привязки аккаунта. */
  startAuth(serviceID: DrmServiceID): void {
    this.updateSession(serviceID, { status: "authenticating" });
  }

  /**
   * Отметить сессию как авторизованную.
   * Вызывается WebView после успешного входа (через onMessage).
   */
  async setAuthenticated(
    serviceID: DrmServiceID,
    accountName?: string,
    cookies?: string
  ): Promise<void> {
    const session: DrmSession = {
      serviceID,
      status: "authenticated",
      accountName,
      cookies,
      lastChecked: Date.now(),
    };
    this.sessions.set(serviceID, session);
    await AsyncStorage.setItem(storageKey(serviceID), JSON.stringify(session));
    this.notify();
  }

  /** Отметить, что пользователь НЕ залогинен в сервисе. */
  async setUnauthenticated(serviceID: DrmServiceID): Promise<void> {
    this.updateSession(serviceID, { status: "unauthenticated", lastChecked: Date.now() });
  }

  /** Разлогиниться из конкретного DRM-сервиса (куки удаляются). */
  async logout(serviceID: DrmServiceID): Promise<void> {
    this.sessions.delete(serviceID);
    await AsyncStorage.removeItem(storageKey(serviceID));
    this.notify();
  }

  /** Полный сброс всех DRM-сессий (не трогает app-auth JWT). */
  async logoutAll(): Promise<void> {
    const keys = Array.from(this.sessions.keys());
    this.sessions.clear();
    await AsyncStorage.multiRemove(keys.map(storageKey));
    this.notify();
  }

  private updateSession(serviceID: DrmServiceID, patch: Partial<DrmSession>): void {
    const current = this.getSession(serviceID);
    this.sessions.set(serviceID, { ...current, ...patch });
    this.notify();
  }
}

// Экспортируем синглтон
export const DrmSessionManager = new DrmSessionManagerClass();
