// src/services/ForegroundService.ts
import notifee, { AndroidImportance, AndroidCategory } from '@notifee/react-native';
import { Platform, Linking } from 'react-native';

const CHANNEL_ID      = 'screen_share_channel';
const NOTIFICATION_ID = 'screen_share_fg';

// طلب تجاهل Battery Optimization
async function requestIgnoreBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Android intent رسمي لصفحة Battery Optimization
    const url = 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS';
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openSettings();
    }
  } catch {
    // تجاهل — ليست مشكلة حرجة
  }
}

export const ForegroundService = {

  async start(): Promise<void> {
    // طلب تجاهل Battery Optimization قبل البدء
    await requestIgnoreBatteryOptimization();

    const channelId = await notifee.createChannel({
      id:         CHANNEL_ID,
      name:       'البث المباشر',
      importance: AndroidImportance.LOW,
    });

    await notifee.displayNotification({
      id:    NOTIFICATION_ID,
      title: '📡 Share Ur Screen',
      body:  'جارٍ بث شاشتك...',
      android: {
        channelId,
        asForegroundService: true,
        importance:          AndroidImportance.LOW,
        category:            AndroidCategory.SERVICE,
        color:               '#7B2FFF',
        colorized:           true,
        smallIcon:           'ic_notification',
        ongoing:             true,
        onlyAlertOnce:       true,
        pressAction:         { id: 'default' },
        actions: [
          { title: '⏹ إيقاف البث', pressAction: { id: 'stop' } },
        ],
      },
    });
  },

  async stop(): Promise<void> {
    await notifee.stopForegroundService();
    await notifee.cancelNotification(NOTIFICATION_ID);
  },

  async updateViewerCount(count: number): Promise<void> {
    const channelId = await notifee.createChannel({
      id:         CHANNEL_ID,
      name:       'البث المباشر',
      importance: AndroidImportance.LOW,
    });

    await notifee.displayNotification({
      id:    NOTIFICATION_ID,
      title: '📡 Share Ur Screen — البث مباشر',
      body:  count > 0 ? `👁 ${count} مشاهد يشاهد الآن` : 'في انتظار المشاهدين...',
      android: {
        channelId,
        asForegroundService: true,
        importance:          AndroidImportance.LOW,
        category:            AndroidCategory.SERVICE,
        color:               '#7B2FFF',
        colorized:           true,
        smallIcon:           'ic_notification',
        ongoing:             true,
        onlyAlertOnce:       true,
        pressAction:         { id: 'default' },
        actions: [
          { title: '⏹ إيقاف البث', pressAction: { id: 'stop' } },
        ],
      },
    });
  },
};
