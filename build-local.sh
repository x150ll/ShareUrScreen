#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# build-local.sh — سكريبت البناء المحلي لـ ShareUrScreen
# الاستخدام:
#   ./build-local.sh           ← بناء debug APK
#   ./build-local.sh release   ← بناء release APK
#   ./build-local.sh clean     ← تنظيف كامل + إعادة بناء
# ─────────────────────────────────────────────────────────────────────────────

set -e  # توقف فوري عند أي خطأ

PROFILE="${1:-debug}"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     ShareUrScreen — Local Build      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── تنظيف إذا طُلب ──────────────────────────────────────
if [ "$PROFILE" = "clean" ]; then
  echo "🧹 تنظيف android/ ..."
  rm -rf "$PROJECT_ROOT/android"
  echo "✅ تم التنظيف"
  PROFILE="debug"
fi

# ─── التحقق من المتطلبات ──────────────────────────────────
echo "🔍 التحقق من المتطلبات..."

command -v node >/dev/null 2>&1 || { echo "❌ Node.js غير موجود"; exit 1; }
command -v java >/dev/null 2>&1 || { echo "❌ Java غير موجود (يجب JDK 17)"; exit 1; }
command -v npx  >/dev/null 2>&1 || { echo "❌ npx غير موجود"; exit 1; }

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ يجب Node.js 18 أو أحدث (الحالي: $(node -v))"
  exit 1
fi

echo "✅ Node: $(node -v)"
echo "✅ Java: $(java -version 2>&1 | head -1)"

# ─── تثبيت المكتبات ───────────────────────────────────────
echo ""
echo "📦 تثبيت المكتبات..."
cd "$PROJECT_ROOT"
npm ci --silent
echo "✅ تم تثبيت المكتبات"

# ─── Prebuild ─────────────────────────────────────────────
if [ ! -d "$PROJECT_ROOT/android" ]; then
  echo ""
  echo "🔨 توليد android/ عبر expo prebuild..."
  npx expo prebuild --platform android --clean --no-install
  echo "✅ تم توليد android/"
else
  echo "ℹ️  android/ موجودة — تخطي prebuild (استخدم 'clean' لإعادة التوليد)"
fi

# ─── نسخ google-services.json ────────────────────────────
echo ""
echo "📋 نسخ google-services.json..."
if [ -f "$PROJECT_ROOT/google-services.json" ]; then
  cp "$PROJECT_ROOT/google-services.json" "$PROJECT_ROOT/android/app/google-services.json"
  echo "✅ تم النسخ"
else
  echo "❌ google-services.json غير موجود في root المشروع"
  exit 1
fi

# ─── صلاحيات gradlew ─────────────────────────────────────
chmod +x "$PROJECT_ROOT/android/gradlew"

# ─── البناء ───────────────────────────────────────────────
echo ""
if [ "$PROFILE" = "release" ]; then
  echo "🚀 بناء Release APK..."
  cd "$PROJECT_ROOT/android"
  ./gradlew assembleRelease --no-daemon \
    -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=512m"

  APK_PATH="$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
else
  echo "🔧 بناء Debug APK..."
  cd "$PROJECT_ROOT/android"
  ./gradlew assembleDebug --no-daemon \
    -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=512m"

  APK_PATH="$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
fi

# ─── النتيجة ──────────────────────────────────────────────
echo ""
if [ -f "$APK_PATH" ]; then
  SIZE=$(du -h "$APK_PATH" | cut -f1)
  echo "╔══════════════════════════════════════╗"
  echo "║           ✅ البناء نجح!             ║"
  echo "╚══════════════════════════════════════╝"
  echo ""
  echo "📱 الملف: $APK_PATH"
  echo "📦 الحجم: $SIZE"
  echo ""
  echo "📲 للتثبيت مباشرة على جهاز متصل:"
  echo "   adb install \"$APK_PATH\""
else
  echo "❌ فشل البناء — الملف غير موجود"
  exit 1
fi
