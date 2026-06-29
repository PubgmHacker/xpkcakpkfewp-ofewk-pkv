#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  SyncWatch — Lightweight build script (без Fastlane)
#
#  Использование:
#    ./devops/bash/build.sh build      # собрать .ipa
#    ./devops/bash/build.sh validate   # проверить Privacy Manifest
#    ./devops/bash/build.sh upload     # собрать + загрузить в TestFlight
#    ./devops/bash/build.sh clean      # очистить DerivedData
#
#  Требования:
#    - Xcode 16+ (xcodebuild)
#    - Apple Developer Account
#    - App Store Connect API Key (.p8) для неинтерактивного аплоада
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Конфигурация ────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_NAME="RaveClone"
SCHEME="RaveClone"
CONFIGURATION="Release"
BUNDLE_ID="com.raveclone.app"
OUTPUT_DIR="${PROJECT_DIR}/devops/build"
DERIVED_DATA_PATH="${PROJECT_DIR}/devops/derived_data"

# App Store Connect API Key (для неинтерактивного аплоада)
ASC_KEY_ID="${ASC_KEY_ID:-}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-}"
ASC_KEY_FILE="${ASC_KEY_FILE:-}"

# Цвета для логов
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# ── Команды ─────────────────────────────────────────────────────────────────

cmd_validate() {
    log "Валидация Privacy Manifest..."

    local PRIVACY_FILE="${PROJECT_DIR}/RaveClone/Resources/PrivacyInfo.xcprivacy"
    if [[ ! -f "$PRIVACY_FILE" ]]; then
        err "PrivacyInfo.xcprivacy не найден: $PRIVACY_FILE"
        exit 1
    fi

    # Парсим plist через plutil (нативный macOS)
    local is_valid
    if plutil -lint "$PRIVACY_FILE" > /dev/null 2>&1; then
        log "✅ PrivacyInfo.xcprivacy синтаксически валиден"
        is_valid=1
    else
        err "❌ PrivacyInfo.xcprivacy содержит ошибки синтаксиса"
        plutil -lint "$PRIVACY_FILE"
        exit 1
    fi

    # Проверяем обязательные ключи
    for key in NSPrivacyTracking NSPrivacyTrackingDomains NSPrivacyCollectedDataTypes NSPrivacyAccessedAPICategory; do
        if ! plutil -extract "$key" raw "$PRIVACY_FILE" > /dev/null 2>&1; then
            warn "Отсутствует ключ: $key"
        fi
    done

    log "✅ Валидация завершена"
}

cmd_build() {
    log "Сборка ${PROJECT_NAME} (${CONFIGURATION})..."

    mkdir -p "$OUTPUT_DIR"
    mkdir -p "$DERIVED_DATA_PATH"

    # Получаем текущий номер версии
    local current_version
    current_version=$(xcodebuild -project "${PROJECT_DIR}/${PROJECT_NAME}.xcodeproj" \
        -scheme "$SCHEME" -showBuildSettings 2>/dev/null \
        | grep -m1 'MARKETING_VERSION' | awk '{print $3}')
    info "Версия: ${current_version:-unknown}"

    # Генерируем уникальный build number (timestamp)
    local build_number
    build_number=$(date -u +"%y%m%d%H%M")
    info "Build number: $build_number"

    # Архивация
    log "Архивация..."
    xcodebuild archive \
        -project "${PROJECT_DIR}/${PROJECT_NAME}.xcodeproj" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -archivePath "${OUTPUT_DIR}/${PROJECT_NAME}.xcarchive" \
        -derivedDataPath "$DERIVED_DATA_PATH" \
        -allowProvisioningUpdates \
        MARKETING_VERSION="${current_version:-1.0}" \
        CURRENT_PROJECT_VERSION="$build_number" \
        | tee "${OUTPUT_DIR}/build.log"

    # Экспорт .ipa
    log "Экспорт .ipa..."

    # ExportOptions.plist
    cat > "${OUTPUT_DIR}/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>${TEAM_ID:-YOUR_TEAM_ID}</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>upload</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
EOF

    xcodebuild -exportArchive \
        -archivePath "${OUTPUT_DIR}/${PROJECT_NAME}.xcarchive" \
        -exportPath "$OUTPUT_DIR" \
        -exportOptionsPlist "${OUTPUT_DIR}/ExportOptions.plist" \
        -allowProvisioningUpdates

    log "✅ Готово: ${OUTPUT_DIR}/${PROJECT_NAME}.ipa"
}

cmd_upload() {
    cmd_validate
    cmd_build

    if [[ -z "$ASC_KEY_ID" || -z "$ASC_KEY_FILE" ]]; then
        warn "ASC_API_KEY не настроен — аплоад через Xcode Organizer"
        warn "Откройте Xcode → Window → Organizer → Distribute App"
        return
    fi

    log "Загрузка в App Store Connect / TestFlight..."

    # Путь к altool / xcrun не требуется, используем новый pilot-эквивалент
    # через App Store Connect API напрямую:
    xcrun altool --upload-app \
        -f "${OUTPUT_DIR}/${PROJECT_NAME}.ipa" \
        -t ios \
        --apiKey "$ASC_KEY_ID" \
        --apiIssuer "$ASC_ISSUER_ID" \
        --type ios \
        || {
            err "Аплоад через altool не удался. Используйте Xcode Organizer."
            err "Window → Organizer → Distribute App → App Store Connect"
            return 1
        }

    log "✅ Загружено в TestFlight. Проверьте App Store Connect через 15-30 мин."
}

cmd_clean() {
    log "Очистка DerivedData и build артефактов..."
    rm -rf "$DERIVED_DATA_PATH"
    rm -rf "$OUTPUT_DIR"
    log "✅ Очищено"
}

cmd_help() {
    cat <<EOF
SyncWatch Build Tool

Использование: $0 <command>

Команды:
  build       Сборка .ipa без аплоада
  validate    Проверка Privacy Manifest
  upload      Сборка + загрузка в TestFlight
  clean       Очистка артефактов
  help        Эта справка

Переменные окружения:
  ASC_KEY_ID            App Store Connect API Key ID
  ASC_ISSUER_ID         App Store Connect Issuer ID
  ASC_KEY_FILE          Путь к .p8 файлу ключа
  TEAM_ID               Apple Developer Team ID

Пример:
  ASC_KEY_ID=ABC123 ASC_ISSUER_ID=xxx ASC_KEY_FILE=~/AuthKey.p8 \\
    ./devops/bash/build.sh upload
EOF
}

# ── Точка входа ─────────────────────────────────────────────────────────────

case "${1:-help}" in
    build)     cmd_build ;;
    validate)  cmd_validate ;;
    upload)    cmd_upload ;;
    clean)     cmd_clean ;;
    help|--help|-h) cmd_help ;;
    *) err "Неизвестная команда: $1"; cmd_help; exit 1 ;;
esac
