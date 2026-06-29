// ─────────────────────────────────────────────────────────────────────────────
//  Роли пользователей RaveClone
//
//  Иерархия привилегий (от низшей к высшей):
//    USER → MODERATOR → FOUNDER → ADMIN
//
//  • USER       — обычный зритель. Может смотреть, писать в чат.
//  • MODERATOR  — назначается основателем комнаты. Может мутить/кикать в СВОЕЙ комнате.
//  • FOUNDER    — создатель комнаты (хост). Полный контроль над СВОЕЙ комнатой.
//  • ADMIN      — глобальный администратор ПРИЛОЖЕНИЯ. Полный контроль над ВСЕМ.
//                 Бейдж 👑, золотой ник, красный анимированный градиент.
//
//  Важно: ADMIN ≠ FOUNDER. Админ может удалить ЛЮБУЮ комнату, даже чужую.
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "user" | "moderator" | "founder" | "admin";

export interface RoleConfig {
  /** Человеко-читаемое название. */
  label: string;
  /** Префикс перед никнеймом (например "[А]"). */
  prefix: string;
  /** Бейдж-эмодзи после ника. */
  badge: string;
  /** Основной цвет роли (для UI). */
  color: string;
  /** Признак премиум-стиля (золотой ник, рамка аватара). */
  isPremium: boolean;
  /** Признак анимированного красного градиента (только ADMIN). */
  isAnimatedRed: boolean;
  /** Глобальные права администратора. */
  isGlobalAdmin: boolean;
  /** Право модерировать ЛЮБУЮ комнату (kick/ban/mute везде). */
  canModerateAnyRoom: boolean;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  // ─── Обычный пользователь ─────────────────────────────────────────────
  user: {
    label: "Пользователь",
    prefix: "",
    badge: "",
    color: "#AAAAAA",
    isPremium: false,
    isAnimatedRed: false,
    isGlobalAdmin: false,
    canModerateAnyRoom: false,
  },

  // ─── Модератор комнаты ────────────────────────────────────────────────
  moderator: {
    label: "Модератор",
    prefix: "[М]",
    badge: "🛡️",
    color: "#3D8BFD",
    isPremium: false,
    isAnimatedRed: false,
    isGlobalAdmin: false,
    canModerateAnyRoom: false,
  },

  // ─── Основатель комнаты (хост) ────────────────────────────────────────
  founder: {
    label: "Основатель",
    prefix: "[О]",
    badge: "👑",
    color: "#FFB300",
    isPremium: true,
    isAnimatedRed: false,
    isGlobalAdmin: false,
    canModerateAnyRoom: false,
  },

  // ─── Глобальный администратор (Super Admin) ───────────────────────────
  admin: {
    label: "Администратор",
    prefix: "[А]",
    badge: "👑",
    color: "#FF1744",        // красный — фирменный цвет админа
    isPremium: true,
    isAnimatedRed: true,     // ← анимированный красный перелив
    isGlobalAdmin: true,
    canModerateAnyRoom: true, // кик/бан в ЛЮБОЙ комнате
  },
};

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** Получить конфиг роли (с fallback на user). */
export function getRoleConfig(role: UserRole | undefined | null): RoleConfig {
  if (!role) return ROLE_CONFIG.user;
  return ROLE_CONFIG[role] ?? ROLE_CONFIG.user;
}

/** Отформатированный никнейм с префиксом: "Иван [А]". */
export function formatNickname(username: string, role: UserRole): string {
  const cfg = getRoleConfig(role);
  return cfg.prefix ? `${username} ${cfg.prefix}` : username;
}

/** Иерархия: может ли роль A управлять ролью B? */
export function canManage(myRole: UserRole, theirRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    user: 0,
    moderator: 1,
    founder: 2,
    admin: 3,
  };
  return hierarchy[myRole] > hierarchy[theirRole];
}

/** Показывать ли кнопку «Кик/Бан» для этого пользователя? */
export function canKickBan(
  myRole: UserRole,
  theirRole: UserRole,
  isMyRoom: boolean
): boolean {
  // Админ может всегда (в любой комнате, любого пользователя)
  if (myRole === "admin") return true;
  // Основатель может в СВОЕЙ комнате (кроме админа)
  if (isMyRoom && myRole === "founder" && theirRole !== "admin") return true;
  // Модератор может кикать обычных юзеров в назначенной комнате
  if (myRole === "moderator" && theirRole === "user") return true;
  return false;
}

/** Может ли роль удалить комнату? */
export function canDeleteRoom(myRole: UserRole, isMyRoom: boolean): boolean {
  // Админ может удалить любую комнату
  if (myRole === "admin") return true;
  // Основатель может удалить свою
  return isMyRoom && myRole === "founder";
}

/** Может ли роль завершить стрим в любой комнате? */
export function canEndStream(myRole: UserRole): boolean {
  return myRole === "admin" || myRole === "founder";
}
