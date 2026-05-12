// src/utils/AutoStartHelper.ts
// يطلب من المستخدم تفعيل AutoStart على أجهزة Xiaomi/Huawei/Oppo/Vivo
// هذه الأجهزة تقتل Foreground Services تلقائياً بدون إذن AutoStart

import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTOSTART_ASKED_KEY = 'autostart_asked_v1';

// قاموس الأجهزة المعروفة بهذه المشكلة مع إعداداتها
const OEM_INTENTS: Record<string, { pkg: string; label: string }> = {
  xiaomi: {
    pkg:   'com.miui.securitycenter',
    label: 'إعدادات الأمان → أذونات → بدء التشغيل التلقائي',
  },
  redmi: {
    pkg:   'com.miui.securitycenter',
    label: 'إعدادات الأمان → أذونات → بدء التشغيل التلقائي',
  },
  huawei: {
    pkg:   'com.huawei.systemmanager',
    label: 'إدارة الهاتف → إدارة التطبيقات → بدء التشغيل التلقائي',
  },
  honor: {
    pkg:   'com.huawei.systemmanager',
    label: 'إدارة الهاتف → إدارة التطبيقات → بدء التشغيل التلقائي',
  },
  oppo: {
    pkg:   'com.coloros.safecenter',
    label: 'إدارة الخصوصية → بدء التشغيل التلقائي',
  },
  realme: {
    pkg:   'com.coloros.safecenter',
    label: 'إدارة الخصوصية → بدء التشغيل التلقائي',
  },
  vivo: {
    pkg:   'com.iqoo.secure',
    label: 'iManager → بدء التشغيل التلقائي',
  },
  samsung: {
    pkg:   'com.samsung.android.lool',
    label: 'رعاية الجهاز → البطارية → التطبيقات في الخلفية',
  },
  oneplus: {
    pkg:   'com.oneplus.opti.manager',
    label: 'إدارة البطارية → تحسين البطارية',
  },
};

function detectOEM(): string | null {
  if (Platform.OS !== 'android') return null;
  // نستخدم Platform.constants للكشف عن الشركة المصنعة
  const manufacturer = (
    (Platform as any).constants?.Manufacturer ||
    (Platform as any).constants?.Brand        ||
    ''
  ).toLowerCase();

  return Object.keys(OEM_INTENTS).find(oem => manufacturer.includes(oem)) || null;
}

export async function promptAutoStartIfNeeded(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const oem = detectOEM();
  if (!oem) return; // جهاز عادي — لا يحتاج

  // لا نسأل مرة ثانية
  const already = await AsyncStorage.getItem(AUTOSTART_ASKED_KEY).catch(() => null);
  if (already) return;

  const info = OEM_INTENTS[oem];

  Alert.alert(
    '⚙️ تفعيل البث في الخلفية',
    `جهازك (${oem.charAt(0).toUpperCase() + oem.slice(1)}) يوقف التطبيقات في الخلفية تلقائياً.\n\nلضمان استمرار البث:\n${info.label}\n\nوفعّل التشغيل التلقائي لـ "Share Ur Screen"`,
    [
      {
        text: 'افتح الإعدادات',
        onPress: async () => {
          await AsyncStorage.setItem(AUTOSTART_ASKED_KEY, '1').catch(() => {});
          Linking.openSettings().catch(() => {});
        },
      },
      {
        text: 'لاحقاً',
        style: 'cancel',
        onPress: () => AsyncStorage.setItem(AUTOSTART_ASKED_KEY, '1').catch(() => {}),
      },
    ],
    { cancelable: false }
  );
}
