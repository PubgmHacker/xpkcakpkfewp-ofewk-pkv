import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─────────────────────────────────────────────────────────────────────────────
//  authStore — глобальное состояние авторизации НАШЕГО приложения (RaveClone)
//
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  Уровень 1: App Auth (этот файл)                                    │
//  │  • Хранит JWT RaveClone + профиль пользователя                       │
//  │  • Проверяется в AppNavigator → Auth-Gate                           │
//  │  • Обязателен для доступа к HomeView и WebSocket                    │
//  ├─────────────────────────────────────────────────────────────────────┤
//  │  Уровень 2: DRM Auth (DrmSessionManager.ts) — ИЗОЛИРОВАН            │
//  │  • Куки/токены Кинопоиска, Netflix и т.д.                           │
//  │  • Живут только внутри WebView конкретного сервиса                  │
//  │  • Никак не связаны с этим стейтом                                   │
//  └─────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  username: string;
  email?: string;
  avatar?: string | null;
  isGuest: boolean;
  role?: string;
  createdAt?: string;
}

interface AuthState {
  // ── State ────────────────────────────────────────────────────────────────
  token: string | null;
  user: AppUser | null;
  isLoading: boolean;         // true во время первичной загрузки из AsyncStorage
  isAuthenticated: boolean;   // computed: token && user

  // ── Actions ──────────────────────────────────────────────────────────────
  hydrate: () => Promise<void>;            // восстановление из AsyncStorage при старте
  setAuth: (token: string, user: AppUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const JWT_KEY = "@raveclone_jwt";
const USER_KEY = "@raveclone_user";

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  // ─── Первичная инициализация при запуске приложения ─────────────────────
  hydrate: async () => {
    try {
      const [token, userJson] = await AsyncStorage.multiGet([JWT_KEY, USER_KEY]);
      const tokenValue = token[1];
      const userValue = userJson[1];

      if (tokenValue && userValue) {
        const user = JSON.parse(userValue) as AppUser;
        set({
          token: tokenValue,
          user,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch (e) {
      console.error("[authStore] hydrate failed:", e);
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  // ─── Сохранение JWT + user после успешного входа ────────────────────────
  setAuth: async (token, user) => {
    await AsyncStorage.multiSet([
      [JWT_KEY, token],
      [USER_KEY, JSON.stringify(user)],
    ]);
    set({ token, user, isAuthenticated: true });
  },

  // ─── Выход — очищает только app-auth, DRM-сессии не трогает ─────────────
  signOut: async () => {
    await AsyncStorage.multiRemove([JWT_KEY, USER_KEY]);
    set({ token: null, user: null, isAuthenticated: false });
  },
}));

// ─── Утилита: заголовок Authorization для fetch-запросов ────────────────────
export function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
