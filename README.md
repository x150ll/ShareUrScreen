# Share Ur Screen — دليل الإعداد الكامل

## هيكل المشروع

```
ShareUrScreen/
├── App.tsx                          ← نقطة الدخول والـ Navigation
├── app.json                         ← إعدادات Expo
├── eas.json                         ← إعدادات البناء
├── package.json
│
├── src/
│   ├── screens/
│   │   ├── OnboardingScreen.tsx     ← شاشة الأذونات (أول تشغيل)
│   │   ├── HomeScreen.tsx           ← الشاشة الرئيسية
│   │   ├── HostScreen.tsx           ← لوحة تحكم المضيف
│   │   └── ViewerScreen.tsx         ← شاشة المشاهد
│   │
│   ├── services/
│   │   ├── SignalingService.ts      ← Firebase Realtime DB (Signaling فقط)
│   │   └── WebRTCService.ts         ← إدارة P2P + TURN + ICE
│   │
│   ├── utils/
│   │   └── CodeGenerator.ts         ← توليد كود 12 خانة
│   │
│   └── theme/
│       └── index.ts                 ← ألوان، خطوط، مسافات
│
└── modules/
    └── screen-capture/
        ├── index.ts                 ← واجهة TypeScript
        └── android/.../
            └── ScreenCaptureModule.kt ← الكود النيتف (Kotlin)
```

---

## خطوات الإعداد

### 1. تثبيت المكتبات
```bash
npm install
```

### 2. Firebase
1. اذهب لـ https://console.firebase.google.com
2. أنشئ مشروع جديد
3. أضف تطبيق Android بـ package: `com.shareurscreen.app`
4. حمّل `google-services.json` وضعه في **root المشروع** (جانب `package.json`)
   - بعد `prebuild` سيُنسخ تلقائياً لـ `android/app/`
5. فعّل **Realtime Database** واختر أي منطقة

Firebase Rules — انسخها من `firebase-rules.json` في المشروع إلى Firebase Console.

### 3. ExpressTURN (1000 GB مجاناً)
1. اذهب لـ https://www.expressturn.com
2. سجّل حساب مجاني
3. احصل على `username` و`credential`
4. ضعها في `src/services/WebRTCService.ts`:
```typescript
const EXPRESSTURN_USERNAME   = 'YOUR_USERNAME';
const EXPRESSTURN_CREDENTIAL = 'YOUR_CREDENTIAL';
```

### 4. البناء المحلي (بدون EAS)
```bash
# أسهل طريقة — سكريبت جاهز
./build-local.sh          # debug APK
./build-local.sh release  # release APK
./build-local.sh clean    # تنظيف + إعادة بناء

# أو يدوياً خطوة بخطوة:
npm install
npx expo prebuild --platform android --clean --no-install
cp google-services.json android/app/google-services.json
chmod +x android/gradlew
cd android && ./gradlew assembleDebug
```

### 5. البناء مع EAS (السحابي)
```bash
# تسجيل الدخول
npx eas login

# ربط المشروع (مرة واحدة فقط)
npx eas init

# بناء APK للاختبار (مجاني)
npx eas build --platform android --profile preview

# بناء للإنتاج (App Bundle)
npx eas build --platform android --profile production
```

### 6. CI/CD — GitHub Actions
أضف هذه المتغيرات في **GitHub → Settings → Secrets and variables**:

| المتغير | القيمة | النوع |
|---------|--------|-------|
| `EXPO_TOKEN` | token من expo.dev | Secret |
| `USE_EAS` | `true` (لتفعيل EAS في CI) | Variable |

بدون `USE_EAS=true`، سيعمل CI فقط بالبناء المحلي عبر Gradle (مجاني تماماً).


---

## ملاحظات مهمة

### Android 14+ — MediaProjection
يجب إضافة هذا في AndroidManifest.xml (يُضاف تلقائياً عبر app.json):
```xml
<service
    android:name=".ScreenShareService"
    android:foregroundServiceType="mediaProjection"
    android:exported="false"/>
```

### Xiaomi / Huawei / Samsung
قد يحتاج المستخدم تفعيل AutoStart يدوياً.
مكتبة `react-native-autostart` تساعد في توجيه المستخدم.

### الصوت الداخلي
- يعمل على Android 10+ فقط
- تطبيقات DRM (Netflix, Shahid) لا يمكن التقاط صوتها
- التطبيق يُنبّه المستخدم تلقائياً

---

## ICE Servers المستخدمة

| الخدمة | النوع | الحد المجاني |
|--------|-------|------------|
| Google STUN | STUN | ∞ |
| ExpressTURN | TURN | 1000 GB/شهر |
| Open Relay | TURN احتياط | 20 GB/شهر |

---

## التطوير المستقبلي

- [ ] كلمة مرور مشفرة (bcrypt hash)
- [ ] Cloudflare Calls SFU (لـ 10+ مشاهدين)
- [ ] إحصائيات شبكة متقدمة
- [ ] دعم iOS
- [ ] AutoStart لكل الشركات المصنعة
