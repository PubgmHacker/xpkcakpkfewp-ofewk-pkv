# ═══════════════════════════════════════════════════════════════════════════
#  RaveClone Backend — Dev Image
#
#  Базовый образ: Debian slim (НЕ Alpine!).
#  Причина: Prisma binary engine требует OpenSSL 1.1.x и glibc.
#  На Alpine (musl libc) Prisma падает с "Error load...".
#  Debian slim имеет glibc и libssl предустановленные → Prisma работает.
#
#  Запуск через tsx (транслирует TS на лету, без type-check → мгновенный старт).
# ═══════════════════════════════════════════════════════════════════════════

FROM node:20-bookworm-slim

WORKDIR /app

# Системные зависимости:
#   openssl, libssl-dev — нужны Prisma engine
#   python3, pip        — для yt-dlp
#   wget, ca-certificates — для healthcheck и HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libssl-dev \
    python3 \
    python3-pip \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp || true

# Копируем package.json и устанавливаем зависимости
COPY package.json ./
RUN npm install --legacy-peer-deps

# Копируем исходный код
COPY . .

# Генерируем Prisma клиент
RUN npx prisma generate

# Переменные для Prisma в Docker (явно указываем бинарный engine)
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Запуск через tsx watch (dev-режим, hot-reload)
CMD ["npx", "tsx", "watch", "src/index.ts"]
