# ShareUrScreen — React Native CLI

تطبيق مشاركة شاشة عبر WebRTC + Firebase. مخصص لـ Android فقط.

## متطلبات البيئة
- Node.js 18+
- JDK 17
- Android SDK (API 26+)

## خطوات البدء

### 1. تثبيت المكتبات
```bash
npm install
```

### 2. إعداد Firebase
ضع ملف `google-services.json` في `android/app/`

### 3. TURN Server
افتح `src/config.ts` واستبدل:
```typescript
export const TURN_USERNAME   = 'YOUR_USERNAME';
export const TURN_CREDENTIAL = 'YOUR_CREDENTIAL';
```
سجّل مجاناً على: https://expressturn.com

### 4. البناء
```bash
# Debug APK
cd android && ./gradlew assembleDebug

# أو
npm run android
```

### 5. تثبيت APK
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## CI/CD
GitHub Actions يبني APK تلقائياً عند كل push على main.
